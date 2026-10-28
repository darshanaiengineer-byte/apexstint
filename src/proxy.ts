import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, generateNonce } from "@/lib/security/csp";

/**
 * Per-request Content-Security-Policy (Next.js 16 "proxy", formerly middleware).
 *
 * A fresh nonce is generated for every document request and passed to rendering through the
 * request headers: Next.js reads it from `Content-Security-Policy` and stamps it on its own
 * scripts, and the root layout reads `x-nonce` for next-themes. Any client-supplied `x-nonce` is
 * overwritten. Pages are rendered per request as a result (nonces cannot exist in static HTML),
 * and Next.js marks those responses `private, no-store`, so nonce-bearing HTML is not cached.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development", https });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every request except exactly: files under /_next/static/, the /_next/image optimiser, and the
  // /favicon.ico and /icon.svg files. Exclusions are anchored and dots escaped: an unanchored
  // pattern also exempted paths like /icon.svgx or /_next/staticfoo, which return the HTML 404 page
  // without a CSP (verified, then fixed). Prefetch requests are NOT exempt either: a request carrying
  // `purpose: prefetch` or `next-router-prefetch` can still return a full HTML document.
  matcher: ["/((?!_next/static/|_next/image$|favicon\\.ico$|icon\\.svg$).*)"],
};
