import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { demoActorIds, type Actor, type ActorRole } from "./demo-actor.js";
import { requireProductionIdentity } from "./identity-config.js";
import type { VerifiedIdentityPrincipal } from "./identity-provider.js";
import { identitySessionPolicy } from "./identity-session-policy.js";
import {
  createIdentitySessionToken,
  hashIdentitySessionToken,
} from "./identity-session-token.js";

const actorIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const subjectDigestPattern = /^[a-f0-9]{64}$/;
const demoIds = new Set<string>(Object.values(demoActorIds));

interface IdentitySessionRow {
  id: string;
  familyId: string;
  parentSessionId: string | null;
  replacedBySessionId: string | null;
  userId: string;
  role: ActorRole;
  generation: number;
  assuranceLevel: "contact_verified" | "mfa";
  mfaCompletedAt: Date | null;
  expiresAt: Date;
  idleExpiresAt: Date;
  lastSeenAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: string | null;
  createdAt: Date;
}

interface IdentityRow {
  displayName: string;
  email: string;
}

type SessionResolution =
  | { kind: "resolved"; session: ProductionSession }
  | { kind: "rejected"; reason: string };

export interface ProductionSession {
  id: string;
  actorId: string;
  role: ActorRole;
  identityMode: "production";
  name: string;
  email: string;
  assuranceLevel: "contact_verified" | "mfa";
  mfaCompletedAt: Date | null;
  expiresAt: Date;
  idleExpiresAt: Date;
  createdAt: Date;
  rotationRequired: boolean;
}

@Injectable()
export class IdentitySessionService {
  constructor(private readonly database: DatabaseService) {}

  async issue(principal: VerifiedIdentityPrincipal) {
    this.requireFeature();
    this.requireEligiblePrincipal(principal);
    const policy = identitySessionPolicy();
    const now = new Date();
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const { token, tokenHash } = createIdentitySessionToken();
    const expiresAt = new Date(now.getTime() + policy.absoluteMinutes * 60_000);
    const idleExpiresAt = new Date(now.getTime() + policy.idleMinutes * 60_000);
    const assuranceLevel = principal.mfaCompletedAt ? "mfa" as const : "contact_verified" as const;

    const session = await this.database.withIdentitySessionHash(tokenHash, async (client) => {
      await setActorAndSecurityWriter(client, {
        id: principal.userId,
        role: principal.role,
      });
      const inserted = await client.query<IdentitySessionRow>(`
        INSERT INTO identity_sessions (
          id, family_id, user_id, role, token_hash, generation,
          assurance_level, mfa_completed_at, expires_at, idle_expires_at,
          last_seen_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, $10, $10)
        RETURNING
          id,
          family_id AS "familyId",
          parent_session_id AS "parentSessionId",
          replaced_by_session_id AS "replacedBySessionId",
          user_id AS "userId",
          role,
          generation,
          assurance_level AS "assuranceLevel",
          mfa_completed_at AS "mfaCompletedAt",
          expires_at AS "expiresAt",
          idle_expires_at AS "idleExpiresAt",
          last_seen_at AS "lastSeenAt",
          rotated_at AS "rotatedAt",
          revoked_at AS "revokedAt",
          revocation_reason AS "revocationReason",
          created_at AS "createdAt"
      `, [
        sessionId,
        familyId,
        principal.userId,
        principal.role,
        tokenHash,
        assuranceLevel,
        principal.mfaCompletedAt,
        expiresAt,
        idleExpiresAt,
        now,
      ]);
      const row = inserted.rows[0];
      if (!row) throw new UnauthorizedException("Não foi possível emitir a sessão.");
      await recordSecurityEvent(client, {
        actorId: principal.userId,
        sessionId: row.id,
        eventType: "session_issued",
        outcome: "succeeded",
        reasonCode: "verified_principal",
        details: {
          providerKey: principal.providerKey,
          assuranceLevel,
          generation: 0,
        },
      });
      return this.present(client, row, policy.rotationMinutes);
    });
    return { token, session };
  }

  async resolve(token: string): Promise<ProductionSession> {
    this.requireFeature();
    const tokenHash = hashIdentitySessionToken(token);
    const policy = identitySessionPolicy();
    const resolution = await this.database.withIdentitySessionHash(
      tokenHash,
      async (client): Promise<SessionResolution> => {
        const row = await selectSession(client, tokenHash, false);
        if (!row) return { kind: "rejected", reason: "unknown_session" };
        await setActorAndSecurityWriter(client, { id: row.userId, role: row.role });
        const now = new Date();

        if (row.rotatedAt) {
          await revokeFamily(client, row, "token_reuse_detected");
          await recordSecurityEvent(client, {
            actorId: row.userId,
            sessionId: row.id,
            eventType: "session_reuse_detected",
            outcome: "blocked",
            reasonCode: "rotated_token_reused",
            details: { familyId: row.familyId, generation: row.generation },
          });
          return { kind: "rejected", reason: "token_reuse_detected" };
        }
        if (row.revokedAt) return { kind: "rejected", reason: "revoked_session" };
        if (row.expiresAt <= now || row.idleExpiresAt <= now) {
          await client.query(`
            UPDATE identity_sessions
            SET revoked_at = COALESCE(revoked_at, $2),
                revocation_reason = COALESCE(revocation_reason, 'expired')
            WHERE id = $1
          `, [row.id, now]);
          return { kind: "rejected", reason: "expired_session" };
        }

        const idleExpiresAt = new Date(Math.min(
          row.expiresAt.getTime(),
          now.getTime() + policy.idleMinutes * 60_000,
        ));
        if (row.lastSeenAt.getTime() <= now.getTime() - 5 * 60_000) {
          const updated = await client.query<IdentitySessionRow>(`
            UPDATE identity_sessions
            SET last_seen_at = $2, idle_expires_at = $3
            WHERE id = $1
            RETURNING
              id,
              family_id AS "familyId",
              parent_session_id AS "parentSessionId",
              replaced_by_session_id AS "replacedBySessionId",
              user_id AS "userId",
              role,
              generation,
              assurance_level AS "assuranceLevel",
              mfa_completed_at AS "mfaCompletedAt",
              expires_at AS "expiresAt",
              idle_expires_at AS "idleExpiresAt",
              last_seen_at AS "lastSeenAt",
              rotated_at AS "rotatedAt",
              revoked_at AS "revokedAt",
              revocation_reason AS "revocationReason",
              created_at AS "createdAt"
          `, [row.id, now, idleExpiresAt]);
          if (updated.rows[0]) return {
            kind: "resolved",
            session: await this.present(client, updated.rows[0], policy.rotationMinutes),
          };
        }
        return {
          kind: "resolved",
          session: await this.present(client, row, policy.rotationMinutes),
        };
      },
    );
    if (resolution.kind === "rejected") throw unauthorized();
    return resolution.session;
  }

  async rotate(token: string) {
    this.requireFeature();
    const oldTokenHash = hashIdentitySessionToken(token);
    const policy = identitySessionPolicy();
    const nextToken = createIdentitySessionToken();
    const result = await this.database.withIdentitySessionHash(
      oldTokenHash,
      async (client): Promise<
        | { kind: "rotated"; session: ProductionSession }
        | { kind: "rejected"; reason: string }
      > => {
        const row = await selectSession(client, oldTokenHash, true);
        if (!row) return { kind: "rejected", reason: "unknown_session" };
        await setActorAndSecurityWriter(client, { id: row.userId, role: row.role });
        const now = new Date();
        if (row.rotatedAt) {
          await revokeFamily(client, row, "token_reuse_detected");
          await recordSecurityEvent(client, {
            actorId: row.userId,
            sessionId: row.id,
            eventType: "session_reuse_detected",
            outcome: "blocked",
            reasonCode: "rotation_replay",
            details: { familyId: row.familyId, generation: row.generation },
          });
          return { kind: "rejected", reason: "token_reuse_detected" };
        }
        if (row.revokedAt || row.expiresAt <= now || row.idleExpiresAt <= now) {
          return { kind: "rejected", reason: "inactive_session" };
        }

        const nextSessionId = randomUUID();
        const idleExpiresAt = new Date(Math.min(
          row.expiresAt.getTime(),
          now.getTime() + policy.idleMinutes * 60_000,
        ));
        await client.query(
          "SELECT set_config('app.identity_session_hash', $1, true)",
          [nextToken.tokenHash],
        );
        const inserted = await client.query<IdentitySessionRow>(`
          INSERT INTO identity_sessions (
            id, family_id, parent_session_id, user_id, role, token_hash,
            generation, assurance_level, mfa_completed_at, expires_at,
            idle_expires_at, last_seen_at, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12
          )
          RETURNING
            id,
            family_id AS "familyId",
            parent_session_id AS "parentSessionId",
            replaced_by_session_id AS "replacedBySessionId",
            user_id AS "userId",
            role,
            generation,
            assurance_level AS "assuranceLevel",
            mfa_completed_at AS "mfaCompletedAt",
            expires_at AS "expiresAt",
            idle_expires_at AS "idleExpiresAt",
            last_seen_at AS "lastSeenAt",
            rotated_at AS "rotatedAt",
            revoked_at AS "revokedAt",
            revocation_reason AS "revocationReason",
            created_at AS "createdAt"
        `, [
          nextSessionId,
          row.familyId,
          row.id,
          row.userId,
          row.role,
          nextToken.tokenHash,
          row.generation + 1,
          row.assuranceLevel,
          row.mfaCompletedAt,
          row.expiresAt,
          idleExpiresAt,
          now,
        ]);
        const nextRow = inserted.rows[0];
        if (!nextRow) return { kind: "rejected", reason: "rotation_failed" };
        await client.query(`
          UPDATE identity_sessions
          SET rotated_at = $2, replaced_by_session_id = $3
          WHERE id = $1
        `, [row.id, now, nextRow.id]);
        await recordSecurityEvent(client, {
          actorId: row.userId,
          sessionId: nextRow.id,
          eventType: "session_rotated",
          outcome: "succeeded",
          reasonCode: "explicit_rotation",
          details: {
            familyId: row.familyId,
            previousGeneration: row.generation,
            generation: nextRow.generation,
          },
        });
        return {
          kind: "rotated",
          session: await this.present(client, nextRow, policy.rotationMinutes),
        };
      },
    );
    if (result.kind === "rejected") throw unauthorized();
    return { token: nextToken.token, session: result.session };
  }

  async revokeCurrent(token: string) {
    this.requireFeature();
    const tokenHash = hashIdentitySessionToken(token);
    await this.database.withIdentitySessionHash(tokenHash, async (client) => {
      const row = await selectSession(client, tokenHash, true);
      if (!row) return;
      await setActorAndSecurityWriter(client, { id: row.userId, role: row.role });
      if (!row.revokedAt) {
        await client.query(`
          UPDATE identity_sessions
          SET revoked_at = now(), revocation_reason = 'logout'
          WHERE id = $1
        `, [row.id]);
        await recordSecurityEvent(client, {
          actorId: row.userId,
          sessionId: row.id,
          eventType: "session_revoked",
          outcome: "succeeded",
          reasonCode: "user_logout",
          details: { familyId: row.familyId, generation: row.generation },
        });
      }
    });
  }

  async revokeAll(token: string) {
    const current = await this.resolve(token);
    const actor = { id: current.actorId, role: current.role } satisfies Actor;
    return this.database.withActor(actor, async (client) => {
      await client.query(
        "SELECT set_config('app.identity_security_write', '1', true)",
      );
      const revoked = await client.query<{ id: string }>(`
        UPDATE identity_sessions
        SET revoked_at = COALESCE(revoked_at, now()),
            revocation_reason = COALESCE(revocation_reason, 'global_logout')
        WHERE user_id = $1 AND revoked_at IS NULL
        RETURNING id
      `, [actor.id]);
      await recordSecurityEvent(client, {
        actorId: actor.id,
        sessionId: current.id,
        eventType: "session_family_revoked",
        outcome: "succeeded",
        reasonCode: "user_global_logout",
        details: { revokedSessionCount: revoked.rowCount ?? revoked.rows.length },
      });
      return { revokedSessionCount: revoked.rowCount ?? revoked.rows.length };
    });
  }

  async inventory(token: string) {
    const current = await this.resolve(token);
    const actor = { id: current.actorId, role: current.role } satisfies Actor;
    return this.database.withActor(actor, async (client) => {
      const result = await client.query<{
        id: string;
        familyId: string;
        generation: number;
        assuranceLevel: "contact_verified" | "mfa";
        expiresAt: Date;
        idleExpiresAt: Date;
        lastSeenAt: Date;
        createdAt: Date;
        state: "active" | "rotated" | "revoked" | "expired";
      }>(`
        SELECT
          id,
          family_id AS "familyId",
          generation,
          assurance_level AS "assuranceLevel",
          expires_at AS "expiresAt",
          idle_expires_at AS "idleExpiresAt",
          last_seen_at AS "lastSeenAt",
          created_at AS "createdAt",
          CASE
            WHEN revoked_at IS NOT NULL THEN 'revoked'
            WHEN rotated_at IS NOT NULL THEN 'rotated'
            WHEN expires_at <= now() OR idle_expires_at <= now() THEN 'expired'
            ELSE 'active'
          END AS state
        FROM identity_sessions
        WHERE user_id = $1
        ORDER BY created_at DESC, generation DESC
        LIMIT 50
      `, [actor.id]);
      return {
        currentSessionId: current.id,
        sessions: result.rows,
      };
    });
  }

  private requireFeature() {
    try {
      return requireProductionIdentity();
    } catch {
      throw new ServiceUnavailableException(
        "A identidade de produção não está configurada e homologada.",
      );
    }
  }

  private requireEligiblePrincipal(principal: VerifiedIdentityPrincipal) {
    if (
      !actorIdPattern.test(principal.userId)
      || demoIds.has(principal.userId)
      || !subjectDigestPattern.test(principal.providerSubjectDigest)
      || !principal.contactVerified
    ) {
      throw new ForbiddenException("O principal não está apto a receber uma sessão.");
    }
    if (principal.role === "operation" && !principal.mfaCompletedAt) {
      throw new ForbiddenException("MFA é obrigatório para a Operação.");
    }
  }

  private async present(
    client: PoolClient,
    row: IdentitySessionRow,
    rotationMinutes: number,
  ): Promise<ProductionSession> {
    const identity = await client.query<IdentityRow>(`
      SELECT display_name AS "displayName", email
      FROM current_identity_profile()
    `);
    const user = identity.rows[0];
    if (!user) throw new UnauthorizedException("Identidade da sessão não encontrada.");
    return {
      id: row.id,
      actorId: row.userId,
      role: row.role,
      identityMode: "production",
      name: user.displayName,
      email: user.email,
      assuranceLevel: row.assuranceLevel,
      mfaCompletedAt: row.mfaCompletedAt,
      expiresAt: row.expiresAt,
      idleExpiresAt: row.idleExpiresAt,
      createdAt: row.createdAt,
      rotationRequired: Date.now() >= row.createdAt.getTime() + rotationMinutes * 60_000,
    };
  }
}

async function selectSession(
  client: PoolClient,
  tokenHash: string,
  lock: boolean,
) {
  const result = await client.query<IdentitySessionRow>(`
    SELECT
      id,
      family_id AS "familyId",
      parent_session_id AS "parentSessionId",
      replaced_by_session_id AS "replacedBySessionId",
      user_id AS "userId",
      role,
      generation,
      assurance_level AS "assuranceLevel",
      mfa_completed_at AS "mfaCompletedAt",
      expires_at AS "expiresAt",
      idle_expires_at AS "idleExpiresAt",
      last_seen_at AS "lastSeenAt",
      rotated_at AS "rotatedAt",
      revoked_at AS "revokedAt",
      revocation_reason AS "revocationReason",
      created_at AS "createdAt"
    FROM identity_sessions
    WHERE token_hash = $1
    LIMIT 1
    ${lock ? "FOR UPDATE" : ""}
  `, [tokenHash]);
  return result.rows[0] ?? null;
}

async function setActorAndSecurityWriter(client: PoolClient, actor: Actor) {
  await client.query(`
    SELECT
      set_config('app.actor_id', $1, true),
      set_config('app.actor_role', $2, true),
      set_config('app.identity_security_write', '1', true)
  `, [actor.id, actor.role]);
}

async function revokeFamily(
  client: PoolClient,
  row: IdentitySessionRow,
  reason: "token_reuse_detected",
) {
  await client.query(`
    UPDATE identity_sessions
    SET revoked_at = COALESCE(revoked_at, now()),
        revocation_reason = COALESCE(revocation_reason, $2)
    WHERE family_id = $1
  `, [row.familyId, reason]);
}

async function recordSecurityEvent(
  client: PoolClient,
  event: {
    actorId: string | null;
    sessionId: string | null;
    eventType:
      | "session_issued"
      | "session_rotated"
      | "session_revoked"
      | "session_family_revoked"
      | "session_reuse_detected";
    outcome: "succeeded" | "rejected" | "blocked";
    reasonCode: string;
    details: Record<string, string | number | boolean | null>;
  },
) {
  await client.query(`
    INSERT INTO identity_security_events (
      id, actor_id, session_id, event_type, outcome, reason_code, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
  `, [
    randomUUID(),
    event.actorId,
    event.sessionId,
    event.eventType,
    event.outcome,
    event.reasonCode,
    JSON.stringify(event.details),
  ]);
}

function unauthorized() {
  return new UnauthorizedException("Sessão ausente, expirada ou revogada.");
}
