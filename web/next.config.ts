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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
