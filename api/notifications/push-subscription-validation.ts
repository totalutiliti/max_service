export interface ValidPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

function decodedKeyLength(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return -1;
  try {
    return Buffer.from(value, "base64url").byteLength;
  } catch {
    return -1;
  }
}

export function validatePushEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length < 20 || value.length > 2048) {
    throw new Error("Endpoint push inválido.");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Endpoint push inválido.");
  }
  if (
    endpoint.protocol !== "https:"
    || !endpoint.hostname
    || endpoint.username
    || endpoint.password
    || endpoint.hash
  ) {
    throw new Error("Endpoint push inválido.");
  }
  return endpoint.toString();
}

export function validatePushSubscription(value: unknown): ValidPushSubscription {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Assinatura push inválida.");
  }
  const candidate = value as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = validatePushEndpoint(candidate.endpoint);
  const expirationTime = candidate.expirationTime;
  if (
    expirationTime !== null
    && expirationTime !== undefined
    && (typeof expirationTime !== "number" || !Number.isSafeInteger(expirationTime) || expirationTime < 0)
  ) {
    throw new Error("Expiração da assinatura push inválida.");
  }
  const p256dh = candidate.keys?.p256dh;
  const auth = candidate.keys?.auth;
  if (typeof p256dh !== "string" || decodedKeyLength(p256dh) !== 65) {
    throw new Error("Chave pública da assinatura push inválida.");
  }
  if (typeof auth !== "string" || decodedKeyLength(auth) !== 16) {
    throw new Error("Segredo de autenticação da assinatura push inválido.");
  }
  return {
    endpoint,
    expirationTime: expirationTime ?? null,
    keys: { p256dh, auth },
  };
}
