import { proxyDemoRequest } from "../_proxy";

export const dynamic = "force-dynamic";

const onboardingRoles = ["customer", "provider"] as const;

export async function GET(request: Request) {
  return proxyDemoRequest("/api/v1/onboarding", request, onboardingRoles);
}

export async function POST(request: Request) {
  const payload = await request.json();
  return proxyDemoRequest("/api/v1/onboarding", request, onboardingRoles, payload);
}
