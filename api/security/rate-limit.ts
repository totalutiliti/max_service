export interface RateLimitRule {
  policyId: RateLimitPolicyId;
  subject: string;
  limit: number;
  windowMs: number;
}

export const rateLimitPolicyVersion = "ABUSE-PROTECTION-2026-01";

export const rateLimitPolicies = [
  {
    id: "demo-session-create",
    label: "Criação de sessão demonstrativa",
    limit: 30,
    windowSeconds: 60,
  },
  {
    id: "public-referral-read-global",
    label: "Consulta pública global",
    limit: 300,
    windowSeconds: 60,
  },
  {
    id: "public-referral-read-code",
    label: "Consulta por convite",
    limit: 60,
    windowSeconds: 60,
  },
  {
    id: "public-referral-capture-global",
    label: "Captura pública global",
    limit: 60,
    windowSeconds: 60,
  },
  {
    id: "public-referral-capture-code",
    label: "Captura por convite",
    limit: 5,
    windowSeconds: 600,
  },
  {
    id: "coupon-validation-global",
    label: "Validação de cupom global",
    limit: 300,
    windowSeconds: 60,
  },
  {
    id: "coupon-validation-customer",
    label: "Validação por cliente",
    limit: 30,
    windowSeconds: 60,
  },
] as const;

export type RateLimitPolicyId = typeof rateLimitPolicies[number]["id"];

interface RateLimitRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string | string[] | undefined>;
}

export function requestRateLimitRules(request: RateLimitRequest): RateLimitRule[] {
  if (header(request, "x-bff-verified") !== "1") return [];
  const method = request.method.toUpperCase();
  const path = request.originalUrl.split("?", 1)[0] ?? request.originalUrl;

  if (method === "POST" && path === "/api/v1/auth/demo-sessions") {
    return [rule("demo-session-create", "global")];
  }

  const publicReferral = path.match(/^\/api\/v1\/public\/referrals\/([A-Za-z0-9-]+)$/);
  if (publicReferral && header(request, "x-demo-role") === "public_referral") {
    const code = publicReferral[1]?.toUpperCase() ?? "unknown";
    if (method === "GET") {
      return [
        rule("public-referral-read-global", "global"),
        rule("public-referral-read-code", code),
      ];
    }
    if (method === "POST") {
      return [
        rule("public-referral-capture-global", "global"),
        rule("public-referral-capture-code", code),
      ];
    }
  }

  if (
    method === "POST"
    && path === "/api/v1/campaigns/validate"
    && header(request, "x-demo-role") === "customer"
  ) {
    return [
      rule("coupon-validation-global", "global"),
      rule("coupon-validation-customer", header(request, "x-demo-actor-id") || "unknown"),
    ];
  }

  return [];
}

function rule(policyId: RateLimitPolicyId, subject: string): RateLimitRule {
  const policy = rateLimitPolicies.find((candidate) => candidate.id === policyId);
  if (!policy) throw new Error(`Política de rate limit desconhecida: ${policyId}`);
  return {
    policyId,
    subject,
    limit: policy.limit,
    windowMs: policy.windowSeconds * 1_000,
  };
}

function header(request: RateLimitRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
