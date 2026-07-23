import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("renderiza o carregamento seguro antes de resolver a sessão", async () => {
  const response = await render("/demo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Preparando seu espaço Max Service/);
  assert.match(html, /Plataforma SaaS \| Max Service/);
  assert.doesNotMatch(html, /token|ms_demo_session/i);
});

test("renderiza a landing pública de indicação sem expor dados da rede", async () => {
  const response = await render("/convite?codigo=PC-7K2M&origem=link");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Transforme sua experiência/);
  assert.match(html, /PC-7K2M/);
  assert.match(html, /Cadastro de interesse/i);
  assert.doesNotMatch(html, /joao\.martins|partner_id|00000000-0000-4000/i);
});

test("publica uma PWA instalável sem armazenar APIs protegidas", async () => {
  const manifestResponse = await render("/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type") ?? "", /^application\/manifest\+json\b/i);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "Max Service");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /^\/demo/);
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);

  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /offline\.html/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /addEventListener\("notificationclick"/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(/);

  const offline = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
  assert.match(offline, /MODO OFFLINE/);
  assert.match(offline, /dados protegidos não são guardados no cache/i);
});
