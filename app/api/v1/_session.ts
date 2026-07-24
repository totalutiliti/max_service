export const demoActorIds = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  partner: "00000000-0000-4000-8000-000000000301",
  operation: "00000000-0000-4000-8000-000000000401",
} as const;

export type DemoRole = keyof typeof demoActorIds;
export type InternalRole = DemoRole | "public_referral";

export interface DemoSession {
  id: string;
  actorId: string;
  role: DemoRole;
  name: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export const demoSessionCookie = "ms_demo_session";

export async function resolveDemoSession(request: Request): Promise<DemoSession | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const path = "/api/v1/auth/demo-sessions/current";
  const headers = await signedInternalHeaders("GET", path);
  headers.set("authorization", `Bearer ${token}`);
  try {
    const response = await fetch(`${apiUrl()}${path}`, { headers, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as { session?: DemoSession };
    return payload.session ?? null;
  } catch {
    return null;
  }
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
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === demoSessionCookie) return decodeURIComponent(value.join("="));
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

export function crossOriginMutation(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
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
