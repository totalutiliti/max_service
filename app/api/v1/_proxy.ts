const customerActorId = "00000000-0000-4000-8000-000000000101";

export async function proxyCustomerRequest(path: string, request: Request) {
  const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
  const headers = new Headers({
    accept: "application/json",
    "x-demo-role": "customer",
    "x-demo-actor-id": customerActorId,
  });

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("content-type", "application/json");
    body = await request.text();
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
