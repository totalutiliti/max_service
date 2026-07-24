import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { Actor } from "../auth/demo-actor.js";
import { idempotencyRequestHash, validateIdempotencyKey } from "./idempotency.js";

interface IdempotencyExecution<T> {
  value: T;
  replayed: boolean;
}

interface IdempotencyRecord<T> {
  requestHash: string;
  status: "processing" | "completed";
  responseBody: T | null;
  expiresAt: Date;
}

interface IdempotencyInput {
  key: string | undefined;
  method: string;
  route: string;
  payload: unknown;
}

@Injectable()
export class IdempotencyService {
  async execute<T extends Record<string, unknown>>(
    client: PoolClient,
    actor: Actor,
    input: IdempotencyInput,
    operation: () => Promise<T>,
  ): Promise<IdempotencyExecution<T>> {
    let key: string;
    try {
      key = validateIdempotencyKey(input.key);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Idempotency-Key inválido.");
    }

    const method = input.method.toUpperCase();
    const requestHash = idempotencyRequestHash(input.payload);
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO api_idempotency_records (
        id,
        actor_id,
        actor_role,
        method,
        route,
        idempotency_key,
        request_hash,
        status,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', now() + interval '24 hours')
      ON CONFLICT (actor_id, method, route, idempotency_key) DO NOTHING
      RETURNING id
    `, [randomUUID(), actor.id, actor.role, method, input.route, key, requestHash]);

    if (!inserted.rows[0]) {
      const existing = await client.query<IdempotencyRecord<T>>(`
        SELECT
          request_hash AS "requestHash",
          status,
          response_body AS "responseBody",
          expires_at AS "expiresAt"
        FROM api_idempotency_records
        WHERE actor_id = $1
          AND method = $2
          AND route = $3
          AND idempotency_key = $4
      `, [actor.id, method, input.route, key]);
      const record = existing.rows[0];
      if (!record) throw new ConflictException("A operação idempotente não pôde ser recuperada.");
      if (record.requestHash !== requestHash) {
        throw new ConflictException("Idempotency-Key já foi usada com outro conteúdo.");
      }
      if (record.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException("Idempotency-Key expirada. Gere uma nova chave para outra operação.");
      }
      if (record.status !== "completed" || record.responseBody === null) {
        throw new ConflictException("A operação com esta Idempotency-Key ainda está em processamento.");
      }
      return { value: record.responseBody, replayed: true };
    }

    const value = await operation();
    const completed = await client.query(`
      UPDATE api_idempotency_records
      SET
        status = 'completed',
        response_status = 201,
        response_body = $5::jsonb,
        completed_at = now()
      WHERE actor_id = $1
        AND method = $2
        AND route = $3
        AND idempotency_key = $4
        AND status = 'processing'
    `, [actor.id, method, input.route, key, JSON.stringify(value)]);
    if (completed.rowCount !== 1) {
      throw new Error("A resposta idempotente não pôde ser confirmada na mesma transação.");
    }

    return { value, replayed: false };
  }
}
