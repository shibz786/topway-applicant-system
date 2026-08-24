import { NextRequest, NextResponse } from "next/server";

// CLAUDE.md rule #9 (CSP) combined with rule #6 (CORS/CSRF). Both live in
// middleware rather than next.config.ts's static headers() because the CSP
// needs a fresh random nonce per request — Next.js's own hydration/RSC
// inline scripts are allowed via that nonce (see root layout, which reads
// it back out of the request headers), everything else stays 'self' only.
//
// IMPORTANT: this was originally a static `script-src 'self'` CSP with no
// nonce, which silently broke the entire app in a real browser — Next.js
// injects its own inline bootstrap scripts, so nothing hydrated and no
// client interaction worked at all. Caught by an actual Playwright run
// against the dev server, not by curl (curl doesn't execute JS/CSP).
// Don't reintroduce a nonce-less script-src 'self' here.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  // Candidate photo/document thumbnails render as <img src={signedUrl}>
  // where signedUrl is a real Supabase-hosted URL once
  // src/lib/storage/supabase-adapter.ts is the active adapter (SUPABASE_URL
  // set) — those need an img-src allowance or the browser silently drops
  // every one of them (caught by an actual Playwright run showing broken
  // thumbnails + a CSP console error, not by the PDF route working fine,
  // since that fetches bytes server-side and never goes through img-src at
  // all). The local-disk stand-in's signed URLs are same-origin (`self`)
  // already, so this is additive, not a fallback swap.
  const supabaseOrigin = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : null;

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' is required in dev only (Next's dev-mode React Refresh /
    // source-mapped eval). Never ship it in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // CLAUDE.md rule #6: CORS restricted to the app's own origin, no wildcard
  // anywhere. We never emit Access-Control-Allow-Origin headers at all (the
  // app is never called cross-origin by design), and — since an httpOnly
  // cookie alone doesn't stop CSRF — every state-changing request must
  // carry an Origin header that matches this app's own Host. This is
  // Lucia v3's documented CSRF mitigation pattern for cookie-based
  // sessions. GETs (including the Server Action "read" path) are exempt;
  // Server Action POSTs go through the same check as any other mutation.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const originHeader = request.headers.get("Origin");
    const hostHeader = request.headers.get("Host");
    if (!originHeader || !hostHeader) {
      return new NextResponse(null, { status: 403 });
    }
    let origin: URL;
    try {
      origin = new URL(originHeader);
    } catch {
      return new NextResponse(null, { status: 403 });
    }
    if (origin.host !== hostHeader) {
      return new NextResponse(null, { status: 403 });
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and image optimization.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
