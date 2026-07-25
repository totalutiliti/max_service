export const demoActorIds = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  partner: "00000000-0000-4000-8000-000000000301",
  operation: "00000000-0000-4000-8000-000000000401",
  advertiser: "00000000-0000-4000-8000-000000000501",
} as const;

export type DemoRole = keyof typeof demoActorIds;
export type InternalRole = DemoRole | "public_referral";

export interface DemoSession {
  id: string;
  actorId: string;
  role: DemoRole;
  identityMode: "demo" | "production";
  name: string;
  email: string;
  assuranceLevel?: "contact_verified" | "mfa";
  mfaCompletedAt?: string | null;
  expiresAt: string;
  idleExpiresAt?: string;
  createdAt: string;
  rotationRequired?: boolean;
}

export const demoSessionCookie = "ms_demo_session";
export const productionSessionCookieName = "__Host-ms_session";

export async function resolveDemoSession(request: Request): Promise<DemoSession | null> {
  const candidates = [
    {
      token: productionSessionToken(request),
      path: "/api/v1/auth/production-sessions/current",
      identityMode: "production" as const,
    },
    {
      token: sessionToken(request),
      path: "/api/v1/auth/demo-sessions/current",
      identityMode: "demo" as const,
    },
  ];
  for (const candidate of candidates) {
    if (!candidate.token) continue;
    const headers = await signedInternalHeaders("GET", candidate.path);
    headers.set("authorization", `Bearer ${candidate.token}`);
    try {
      const response = await fetch(
        `${apiUrl()}${candidate.path}`,
        { headers, cache: "no-store" },
      );
      if (!response.ok) continue;
      const payload = await response.json() as { session?: DemoSession };
      if (payload.session) {
        return { ...payload.session, identityMode: candidate.identityMode };
      }
    } catch {
      // Tenta a próxima modalidade sem transformar indisponibilidade em autenticação.
    }
  }
  return null;
}

export async function signedInternalHeaders(
  method: string,
  path: string,
  role: InternalRole | "" = "",
  actorId = "",
  idempotencyKey = "",
) {
  const secret = process.env.BFF_INTERNAL_SECRET;
  if (!secret) throw new Error("Canal interno não configurado.");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const canonical = `${timestamp}.${method.toUpperCase()}.${path}.${role}.${actorId}${idempotencyKey ? `.${idempotencyKey}` : ""}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical)))}`;
  return new Headers({
    accept: "application/json",
    "x-bff-timestamp": timestamp,
    "x-bff-signature": signature,
    ...(role ? { "x-demo-role": role, "x-demo-actor-id": actorId } : {}),
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
  });
}

export function sessionToken(request: Request) {
  return tokenForCookie(request, demoSessionCookie);
}

export function productionSessionToken(request: Request) {
  return tokenForCookie(request, productionSessionCookieName);
}

function tokenForCookie(request: Request, cookieName: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  const secureByDefault = process.env.COOKIE_SECURE === undefined && process.env.NODE_ENV === "production";
  const secure = process.env.COOKIE_SECURE === "true" || secureByDefault ? "; Secure" : "";
  return `${demoSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearedSessionCookie() {
  return sessionCookie("", 0);
}

export function productionSessionCookie(token: string, maxAgeSeconds: number) {
  return `${productionSessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${maxAgeSeconds}`;
}

export function clearedProductionSessionCookie() {
  return productionSessionCookie("", 0);
}

export function crossOriginMutation(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expectedOrigin = new URL(process.env.APP_ORIGIN ?? request.url).origin;
    return new URL(origin).origin !== expectedOrigin;
  } catch {
    return true;
  }
}

export function apiUrl() {
  return process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
