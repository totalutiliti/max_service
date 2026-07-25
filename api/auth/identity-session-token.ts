import { createHash, randomBytes } from "node:crypto";

const opaqueTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function createIdentitySessionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashIdentitySessionToken(token) };
}

export function requireIdentitySessionToken(token: string) {
  if (!opaqueTokenPattern.test(token)) {
    throw new Error("Token de sessão de produção inválido.");
  }
  return token;
}

export function hashIdentitySessionToken(token: string) {
  return createHash("sha256")
    .update(requireIdentitySessionToken(token))
    .digest("hex");
}
