export const apiPermissionsPolicy = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export function apiSecurityHeaders(environment: NodeJS.ProcessEnv) {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-site",
    "origin-agent-cluster": "?1",
    "permissions-policy": apiPermissionsPolicy,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-dns-prefetch-control": "off",
    "x-frame-options": "DENY",
    "x-permitted-cross-domain-policies": "none",
    ...(environment.TRANSPORT_SECURITY_CONFIGURED === "true"
      ? { "strict-transport-security": "max-age=31536000; includeSubDomains" }
      : {}),
  };
}

export const apiCorsAllowedHeaders = [
  "accept",
  "authorization",
  "content-type",
  "idempotency-key",
  "x-after-message-id",
  "x-bff-signature",
  "x-bff-timestamp",
  "x-demo-actor-id",
  "x-demo-role",
  "x-file-name",
  "x-message-body",
  "x-sandbox-signature",
  "x-sandbox-timestamp",
] as const;

export const apiCorsExposedHeaders = [
  "content-disposition",
  "content-length",
  "idempotency-replayed",
  "ratelimit-limit",
  "ratelimit-policy",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
  "x-request-id",
] as const;
