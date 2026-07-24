export const webContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

export const webSecurityHeaders = {
  "content-security-policy": webContentSecurityPolicy,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "origin-agent-cluster": "?1",
  "permissions-policy": [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", "),
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-dns-prefetch-control": "off",
  "x-frame-options": "DENY",
  "x-permitted-cross-domain-policies": "none",
} as const;

export function applyWebSecurityHeaders(response: Response, pathname: string) {
  for (const [name, value] of Object.entries(webSecurityHeaders)) {
    response.headers.set(name, value);
  }
  if (
    pathname === "/demo"
    || pathname.startsWith("/demo/")
    || pathname === "/convite"
    || pathname.startsWith("/convite/")
    || pathname.startsWith("/api/")
  ) {
    response.headers.set("cache-control", "private, no-store");
  }
  return response;
}
