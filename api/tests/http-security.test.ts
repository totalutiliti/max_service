import assert from "node:assert/strict";
import test from "node:test";
import {
  apiCorsAllowedHeaders,
  apiCorsExposedHeaders,
  apiSecurityHeaders,
} from "../security/http-security.js";

test("baseline da API bloqueia embedding, sniffing e recursos de navegador", () => {
  const headers = apiSecurityHeaders({});
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.match(headers["content-security-policy"], /default-src 'none'/);
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(headers["cache-control"], "no-store");
  assert.equal("strict-transport-security" in headers, false);
});

test("HSTS só é emitido depois da homologação explícita do transporte", () => {
  const headers = apiSecurityHeaders({ TRANSPORT_SECURITY_CONFIGURED: "true" });
  assert.equal(
    headers["strict-transport-security"],
    "max-age=31536000; includeSubDomains",
  );
});

test("CORS usa listas fechadas e expõe apenas cabeçalhos operacionais", () => {
  assert.equal(apiCorsAllowedHeaders.includes("x-demo-role"), true);
  assert.equal(apiCorsAllowedHeaders.includes("x-file-name"), true);
  assert.equal(apiCorsExposedHeaders.includes("x-request-id"), true);
  assert.equal(apiCorsExposedHeaders.includes("ratelimit-remaining"), true);
  assert.equal(apiCorsAllowedHeaders.includes("*" as never), false);
  assert.equal(apiCorsExposedHeaders.includes("*" as never), false);
});
