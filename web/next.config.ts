import type { NextConfig } from "next";

// CLAUDE.md security rule #9: X-Frame-Options DENY, HSTS, Referrer-Policy
// strict-origin, Permissions-Policy. Content-Security-Policy is NOT here —
// it needs a fresh nonce per request, so it's set in middleware.ts instead.
// Don't add a static CSP here; see the comment in middleware.ts for why
// that broke the app outright.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // Next's own dev-mode route indicator (a floating badge, bottom-left by
  // default) sat directly on top of the Switchboard sidebar's user/sign-out
  // block once that sidebar existed - dev-only chrome, never shipped to
  // Vercel, but a real visible collision locally. Off entirely rather than
  // repositioned around, since it has no function here.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Two SEPARATE Next.js body-size limits both had to be raised, found live
  // via UAT-20 (oversized-file upload test), not assumed - fixing only one
  // still breaks uploads:
  //  1. Server Actions default to a 1MB request body limit, which silently
  //     rejected every upload between 1-10MB with a raw Next.js error
  //     ("Body exceeded 1 MB limit...") well before any of this app's own
  //     MAX_UPLOAD_BYTES (10MB, CLAUDE.md rule #7) or magic-byte checks
  //     ever ran.
  //  2. This app's middleware.ts (CSP nonce injection) runs on every
  //     request including these POSTs, and Next's middleware layer has
  //     its OWN separate ~10MB body cap. Exactly where this matters most:
  //     since MAX_UPLOAD_BYTES is also 10MB, every file this app is
  //     actually supposed to reject as "too large" sits right in the
  //     range the middleware cap truncates mid-multipart-boundary first -
  //     corrupting the request into "Unexpected end of form", an
  //     unhandled 500, instead of ever reaching the clean "File too large
  //     (max 10MB)" ActionError this app's own code throws. 12mb/13mb
  //     give real headroom above the true 10MB content cap those actions
  //     enforce themselves, so a too-large file now actually reaches that
  //     code instead of being truncated before it gets there.
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
    middlewareClientMaxBodySize: "13mb",
  },
};

export default nextConfig;
