const forwardedApiHeaders = [
  "x-request-id",
  "ratelimit-policy",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
  "idempotency-replayed",
] as const;

export function apiResponseHeaders(response: Response, initial: HeadersInit = {}) {
  const headers = new Headers(initial);
  for (const name of forwardedApiHeaders) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
