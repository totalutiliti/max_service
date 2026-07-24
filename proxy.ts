import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applyWebSecurityHeaders } from "./app/http-security";

export function proxy(request: NextRequest) {
  return applyWebSecurityHeaders(NextResponse.next(), request.nextUrl.pathname);
}

export const config = {
  matcher: ["/", "/demo/:path*", "/convite/:path*", "/api/:path*"],
};
