import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renderiza a landing própria da Max Service", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Max Service/);
  assert.match(html, /Serviço bem feito começa/);
  assert.match(html, /Encontrar um profissional/);
  assert.match(html, /dados fictícios/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Triider|GetNinjas/i);
});

test("renderiza a demonstração com os quatro perfis", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Cliente/);
  assert.match(html, /Profissional/);
  assert.match(html, /Parceiro/);
  assert.match(html, /Administração/);
  assert.match(html, /Pedir um serviço/);
  assert.match(html, /PLATAFORMA MAX SERVICE/);
  assert.match(html, /nenhuma cobrança real/i);
});
