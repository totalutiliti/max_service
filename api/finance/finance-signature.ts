import { createHmac, timingSafeEqual } from "node:crypto";

export interface SandboxFinancialEvent {
  eventId: string;
  intentId: string;
  eventType: "settlement" | "refund";
  amountCents: number;
}

export function sandboxEventCanonical(timestamp: string, event: SandboxFinancialEvent) {
  return `${timestamp}.${event.eventId}.${event.intentId}.${event.eventType}.${event.amountCents}`;
}

export function computeSandboxSignature(secret: string, timestamp: string, event: SandboxFinancialEvent) {
  return `sha256=${createHmac("sha256", secret).update(sandboxEventCanonical(timestamp, event)).digest("hex")}`;
}

export function verifySandboxSignature(secret: string, timestamp: string, event: SandboxFinancialEvent, received: string) {
  const expected = Buffer.from(computeSandboxSignature(secret, timestamp, event));
  const candidate = Buffer.from(received);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
