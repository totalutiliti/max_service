import assert from "node:assert/strict";
import test from "node:test";
import { crossOriginMutation } from "./_session";

function mutation(origin?: string, url = "http://internal-web:4174/api/v1/auth/session") {
  return new Request(url, {
    method: "POST",
    headers: origin ? { origin } : undefined,
  });
}

test("aceita a origem pública configurada mesmo atrás do proxy", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://dev.maxservice.example";
  try {
    assert.equal(
      crossOriginMutation(mutation("https://dev.maxservice.example")),
      false,
    );
    assert.equal(
      crossOriginMutation(mutation("https://evil.example")),
      true,
    );
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("usa a URL da requisição quando não há origem pública configurada", () => {
  const previous = process.env.APP_ORIGIN;
  delete process.env.APP_ORIGIN;
  try {
    assert.equal(
      crossOriginMutation(mutation("http://internal-web:4174")),
      false,
    );
    assert.equal(
      crossOriginMutation(mutation("http://other.internal")),
      true,
    );
    assert.equal(crossOriginMutation(mutation()), false);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("falha fechada quando a origem pública é inválida", () => {
  const previous = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "not-a-url";
  try {
    assert.equal(
      crossOriginMutation(mutation("https://dev.maxservice.example")),
      true,
    );
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});
