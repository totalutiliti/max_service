const actorIds = {
  customer: "00000000-0000-4000-8000-000000000101",
  provider: "00000000-0000-4000-8000-000000000201",
  operation: "00000000-0000-4000-8000-000000000401",
} as const;

type DemoRole = keyof typeof actorIds;

export async function proxyDemoRequest(path: string, request: Request, role: DemoRole, payload?: unknown) {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
  const headers = new Headers({
    accept: "application/json",
    "x-demo-role": role,
    "x-demo-actor-id": actorIds[role],
  });

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("content-type", "application/json");
    body = payload === undefined ? await request.text() : JSON.stringify(payload);
  }

  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "A API da Max Service está temporariamente indisponível." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export function proxyCustomerRequest(path: string, request: Request, payload?: unknown) {
  return proxyDemoRequest(path, request, "customer", payload);
}
