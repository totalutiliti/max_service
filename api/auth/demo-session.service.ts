import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseService } from "../database/database.service.js";
import { demoActorIds, type ActorRole } from "./demo-actor.js";

const sessionHours = 4;

const demoProfiles: Record<ActorRole, { actorId: string; name: string; email: string }> = {
  customer: { actorId: demoActorIds.customer, name: "Marina Alves", email: "marina@demo.maxservice" },
  provider: { actorId: demoActorIds.provider, name: "Rafael Santos", email: "rafael@demo.maxservice" },
  partner: { actorId: demoActorIds.partner, name: "João Martins", email: "joao@demo.maxservice" },
  operation: { actorId: demoActorIds.operation, name: "Equipe Max", email: "operacao@demo.maxservice" },
};

interface SessionRow {
  id: string;
  user_id: string;
  role: ActorRole;
  expires_at: Date;
  created_at: Date;
}

@Injectable()
export class DemoSessionService {
  constructor(private readonly database: DatabaseService) {}

  async create(role: ActorRole, currentToken?: string) {
    if (process.env.DEMO_MODE !== "true") {
      throw new UnauthorizedException("As sessões demonstrativas estão desativadas.");
    }
    if (currentToken) await this.revoke(currentToken, true);

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
    const profile = demoProfiles[role];
    const row = await this.database.withSessionHash(tokenHash, async (client) => {
      const result = await client.query<SessionRow>(
        `INSERT INTO demo_sessions (user_id, role, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, role, expires_at, created_at`,
        [profile.actorId, role, tokenHash, expiresAt],
      );
      return result.rows[0];
    });
    if (!row) throw new UnauthorizedException("Não foi possível criar a sessão demonstrativa.");
    return { token, session: present(row) };
  }

  async resolve(token: string) {
    const tokenHash = hashToken(requireToken(token));
    const row = await this.database.withSessionHash(tokenHash, async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT id, user_id, role, expires_at, created_at
         FROM demo_sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
         LIMIT 1`,
        [tokenHash],
      );
      if (result.rows[0]) {
        await client.query(
          `UPDATE demo_sessions SET last_seen_at = now()
           WHERE token_hash = $1 AND last_seen_at < now() - interval '5 minutes'`,
          [tokenHash],
        );
      }
      return result.rows[0];
    });
    if (!row) throw new UnauthorizedException("Sessão ausente, expirada ou revogada.");
    return present(row);
  }

  async revoke(token: string, ignoreInvalid = false) {
    try {
      const tokenHash = hashToken(requireToken(token));
      await this.database.withSessionHash(tokenHash, async (client) => {
        await client.query(
          "UPDATE demo_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1",
          [tokenHash],
        );
      });
    } catch (error) {
      if (!ignoreInvalid) throw error;
    }
  }
}

function present(row: SessionRow) {
  const profile = demoProfiles[row.role];
  return {
    id: row.id,
    actorId: row.user_id,
    role: row.role,
    name: profile.name,
    email: profile.email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function requireToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException("Token de sessão inválido.");
  return token;
}
