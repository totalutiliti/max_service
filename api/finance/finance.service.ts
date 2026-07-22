import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Actor, ActorRole } from "../auth/demo-actor.js";
import { demoActorIds } from "../auth/demo-actor.js";
import { DatabaseService } from "../database/database.service.js";
import type { SandboxFinancialEvent } from "./finance-signature.js";
import { verifySandboxSignature } from "./finance-signature.js";

type PaymentStatus = "sandbox_authorized" | "sandbox_settled" | "sandbox_refunded";

interface FinanceRecord {
  id: string;
  publicCode: string;
  bookingId: string;
  requestPublicCode: string;
  serviceTitle: string;
  grossAmountCents: number;
  status: PaymentStatus;
  actorAmountCents: number;
  recognizedAmountCents: number;
  reversedAmountCents: number;
  bookingStatus: string | null;
  createdAt: string;
  settledAt: string | null;
  refundedAt: string | null;
  reconciledAt: string | null;
}

const allocationTypeByRole: Record<ActorRole, string> = {
  customer: "customer_cashback",
  provider: "provider_receivable",
  partner: "partner_commission",
  operation: "platform_fee",
};

@Injectable()
export class FinanceService {
  constructor(private readonly database: DatabaseService) {}

  async dashboard(actor: Actor) {
    return this.database.withActor(actor, async (client) => {
      const ruleResult = await client.query(`
        SELECT
          version,
          currency,
          platform_fee_bps AS "platformFeeBps",
          partner_commission_bps AS "partnerCommissionBps",
          customer_cashback_bps AS "customerCashbackBps",
          effective_from AS "effectiveFrom"
        FROM commercial_rules
        WHERE status = 'active'
      `);
      if (!ruleResult.rows[0]) throw new NotFoundException("Regra comercial ativa não encontrada.");

      const recordsResult = await client.query<FinanceRecord>(`
        SELECT
          intent.id,
          intent.public_code AS "publicCode",
          intent.booking_id AS "bookingId",
          intent.request_public_code AS "requestPublicCode",
          intent.service_title AS "serviceTitle",
          intent.gross_amount_cents AS "grossAmountCents",
          intent.status,
          COALESCE(allocation.amount_cents, 0)::int AS "actorAmountCents",
          COALESCE((
            SELECT sum(CASE ledger.direction WHEN 'credit' THEN ledger.amount_cents ELSE -ledger.amount_cents END)
            FROM financial_ledger_entries ledger
            WHERE ledger.allocation_id = allocation.id
          ), 0)::int AS "recognizedAmountCents",
          COALESCE((
            SELECT sum(ledger.amount_cents)
            FROM financial_ledger_entries ledger
            WHERE ledger.allocation_id = allocation.id AND ledger.direction = 'debit'
          ), 0)::int AS "reversedAmountCents",
          booking.status AS "bookingStatus",
          intent.created_at AS "createdAt",
          intent.settled_at AS "settledAt",
          intent.refunded_at AS "refundedAt",
          intent.reconciled_at AS "reconciledAt"
        FROM payment_intents intent
        LEFT JOIN payment_allocations allocation
          ON allocation.payment_intent_id = intent.id AND allocation.entry_type = $1
        LEFT JOIN bookings booking ON booking.id = intent.booking_id
        ORDER BY intent.created_at DESC, intent.id DESC
      `, [allocationTypeByRole[actor.role]]);

      const records = recordsResult.rows;
      const summary = records.reduce((totals, record) => ({
        recordCount: totals.recordCount + 1,
        grossAmountCents: totals.grossAmountCents + record.grossAmountCents,
        pendingAmountCents: totals.pendingAmountCents + (record.status === "sandbox_authorized" ? record.actorAmountCents : 0),
        recognizedAmountCents: totals.recognizedAmountCents + record.recognizedAmountCents,
        reversedAmountCents: totals.reversedAmountCents + record.reversedAmountCents,
      }), { recordCount: 0, grossAmountCents: 0, pendingAmountCents: 0, recognizedAmountCents: 0, reversedAmountCents: 0 });

      let reconciliation = null;
      if (actor.role === "operation") {
        const reconciliationResult = await client.query<{
          expectedLedgerCents: number;
          ledgerNetCents: number;
          unreconciledCount: number;
        }>(`
          SELECT
            COALESCE((SELECT sum(gross_amount_cents) FROM payment_intents WHERE status = 'sandbox_settled'), 0)::int AS "expectedLedgerCents",
            COALESCE((SELECT sum(CASE direction WHEN 'credit' THEN amount_cents ELSE -amount_cents END) FROM financial_ledger_entries), 0)::int AS "ledgerNetCents",
            COALESCE((SELECT count(*) FROM payment_intents WHERE status <> 'sandbox_authorized' AND reconciled_at IS NULL), 0)::int AS "unreconciledCount"
        `);
        const result = reconciliationResult.rows[0];
        reconciliation = { ...result, differenceCents: result.ledgerNetCents - result.expectedLedgerCents, matched: result.ledgerNetCents === result.expectedLedgerCents && result.unreconciledCount === 0 };
      }

      return { rule: ruleResult.rows[0], summary, reconciliation, records };
    });
  }

  async ingestSandboxEvent(event: SandboxFinancialEvent, signature: string | undefined, timestamp: string | undefined) {
    if (process.env.DEMO_MODE !== "true") throw new ForbiddenException("O processador financeiro sandbox está desativado.");
    const secret = process.env.FINANCIAL_SANDBOX_SECRET;
    if (!secret) throw new ForbiddenException("Assinatura do sandbox financeiro não configurada.");
    if (!timestamp || !/^\d{10}$/.test(timestamp)) throw new BadRequestException("Timestamp do evento sandbox inválido.");
    const eventTimestamp = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - eventTimestamp) > 300) throw new UnauthorizedException("Evento sandbox expirado.");
    if (!signature || !verifySandboxSignature(secret, timestamp, event, signature)) {
      throw new UnauthorizedException("Assinatura do evento sandbox inválida.");
    }

    const operationActor: Actor = { id: demoActorIds.operation, role: "operation" };
    return this.database.withActor(operationActor, async (client) => {
      const existing = await client.query<{
        paymentIntentId: string;
        transactionType: string;
        amountCents: number;
      }>(`
        SELECT payment_intent_id AS "paymentIntentId", transaction_type AS "transactionType", amount_cents AS "amountCents"
        FROM payment_transactions
        WHERE idempotency_key = $1
      `, [event.eventId]);
      if (existing.rows[0]) {
        const transaction = existing.rows[0];
        if (transaction.paymentIntentId !== event.intentId || transaction.transactionType !== event.eventType || transaction.amountCents !== event.amountCents) {
          throw new ConflictException("A chave idempotente já foi usada por outro evento.");
        }
        return { duplicate: true, eventId: event.eventId, intentId: event.intentId };
      }

      const current = await client.query<{
        id: string;
        status: PaymentStatus;
        grossAmountCents: number;
        bookingStatus: string;
      }>(`
        SELECT intent.id, intent.status, intent.gross_amount_cents AS "grossAmountCents", booking.status AS "bookingStatus"
        FROM payment_intents intent
        JOIN bookings booking ON booking.id = intent.booking_id
        WHERE intent.id = $1
        FOR UPDATE OF intent
      `, [event.intentId]);
      if (!current.rows[0]) throw new NotFoundException("Intent financeiro sandbox não encontrado.");
      const intent = current.rows[0];
      if (intent.grossAmountCents !== event.amountCents) throw new ConflictException("O valor do evento diverge do valor congelado no intent.");

      if (event.eventType === "settlement") {
        if (intent.status !== "sandbox_authorized") throw new ConflictException("Somente intents autorizados podem ser liquidados.");
        if (intent.bookingStatus !== "completed") throw new ConflictException("A liquidação só é aceita após a conclusão do serviço.");
      } else {
        if (intent.status === "sandbox_refunded") throw new ConflictException("Este intent já foi estornado.");
        if (intent.status === "sandbox_authorized" && intent.bookingStatus !== "cancelled") {
          throw new ConflictException("O estorno de uma autorização exige o cancelamento do serviço.");
        }
      }

      const transactionId = randomUUID();
      await client.query(`
        INSERT INTO payment_transactions (
          id, payment_intent_id, idempotency_key, transaction_type, amount_cents, source, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, 'signed_sandbox_webhook', to_timestamp($6))
      `, [transactionId, event.intentId, event.eventId, event.eventType, event.amountCents, eventTimestamp]);

      if (event.eventType === "settlement") {
        await client.query(`
          INSERT INTO financial_ledger_entries (
            id, payment_intent_id, allocation_id, transaction_id, beneficiary_id, entry_type, direction, amount_cents
          )
          SELECT gen_random_uuid(), allocation.payment_intent_id, allocation.id, $2, allocation.beneficiary_id,
            allocation.entry_type, 'credit', allocation.amount_cents
          FROM payment_allocations allocation
          WHERE allocation.payment_intent_id = $1 AND allocation.amount_cents > 0
        `, [event.intentId, transactionId]);
        await client.query(`
          UPDATE payment_intents
          SET status = 'sandbox_settled', settled_at = to_timestamp($2), reconciled_at = now(), updated_at = now()
          WHERE id = $1
        `, [event.intentId, eventTimestamp]);
      } else {
        if (intent.status === "sandbox_settled") {
          await client.query(`
            INSERT INTO financial_ledger_entries (
              id, payment_intent_id, allocation_id, transaction_id, beneficiary_id, entry_type, direction, amount_cents
            )
            SELECT gen_random_uuid(), allocation.payment_intent_id, allocation.id, $2, allocation.beneficiary_id,
              allocation.entry_type, 'debit', allocation.amount_cents
            FROM payment_allocations allocation
            WHERE allocation.payment_intent_id = $1 AND allocation.amount_cents > 0
          `, [event.intentId, transactionId]);
        }
        await client.query(`
          UPDATE payment_intents
          SET status = 'sandbox_refunded', refunded_at = to_timestamp($2), reconciled_at = now(), updated_at = now()
          WHERE id = $1
        `, [event.intentId, eventTimestamp]);
      }

      const ledger = await client.query<{ netCents: number }>(`
        SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount_cents ELSE -amount_cents END), 0)::int AS "netCents"
        FROM financial_ledger_entries
        WHERE payment_intent_id = $1
      `, [event.intentId]);
      const expectedNet = event.eventType === "settlement" ? event.amountCents : 0;
      if (ledger.rows[0].netCents !== expectedNet) {
        throw new ConflictException("A reconciliação do ledger sandbox não fechou; nenhuma alteração foi aplicada.");
      }

      await client.query(
        "INSERT INTO audit_events (actor_id, actor_role, action, entity_type, entity_id, payload) VALUES ($1, 'operation', $2, 'payment_intent', $3, $4::jsonb)",
        [operationActor.id, `finance.sandbox_${event.eventType}`, event.intentId, JSON.stringify({ eventId: event.eventId, transactionId, amountCents: event.amountCents, ledgerNetCents: ledger.rows[0].netCents })],
      );
      return { duplicate: false, eventId: event.eventId, transactionId, intentId: event.intentId, status: event.eventType === "settlement" ? "sandbox_settled" : "sandbox_refunded", ledgerNetCents: ledger.rows[0].netCents };
    });
  }
}
