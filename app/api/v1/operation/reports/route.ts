import { proxyDemoRequest } from "../../_proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = url.searchParams.get("days") ?? "30";
  return proxyDemoRequest(
    `/api/v1/operation/reports?days=${encodeURIComponent(days)}`,
    request,
    "operation",
  );
}

export async function POST(request: Request) {
  const payload = await request.json() as {
    periodDays?: 7 | 30 | 90;
    proposalCoverageTargetBps?: number;
    bookingConversionTargetBps?: number;
    firstProposalTargetMinutes?: number;
    overdueCaseLimit?: number;
    unreconciledLimit?: number;
    note?: string;
  };
  return proxyDemoRequest(
    "/api/v1/operation/reports/goals",
    request,
    "operation",
    payload,
  );
}
