import { createHmac } from "node:crypto";

export const progressiveLockoutPolicyVersion = "IDENTITY-LOCKOUT-2026-01";

export interface ProgressiveLockoutDecision {
  failedAttemptCount: number;
  lockSeconds: number;
  blocked: boolean;
}

export function normalizeIdentityIdentifier(identifier: string) {
  return identifier.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

export function identitySubjectDigest(secret: string, identifier: string) {
  if (secret.length < 32) {
    throw new Error("A chave de digest de identidade deve ter ao menos 32 caracteres.");
  }
  return createHmac("sha256", secret)
    .update(normalizeIdentityIdentifier(identifier))
    .digest("hex");
}

export function progressiveLockout(failedAttemptCount: number): ProgressiveLockoutDecision {
  const count = Math.max(1, Math.floor(failedAttemptCount));
  const lockSeconds = count >= 12
    ? 24 * 60 * 60
    : count >= 8
    ? 15 * 60
    : count >= 5
    ? 60
    : 0;
  return {
    failedAttemptCount: count,
    lockSeconds,
    blocked: lockSeconds > 0,
  };
}

export const uniformAuthenticationFailure = {
  statusCode: 401,
  code: "AUTHENTICATION_FAILED",
  message: "Não foi possível confirmar as credenciais informadas.",
} as const;
