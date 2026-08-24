import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

// Display face — headings only (see globals.css --font-heading). "The
// Register" direction (picked by the user from two mockup options — see
// CLAUDE.md): a serif with real document-office gravitas, fitting for a
// tool that spends its day on passports, licenses, and case files, without
// tipping into a generic template serif.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body/UI/data face — carries every paragraph, label, and table cell in
// the app. Chosen for legibility at the small sizes a dense ATS table
// demands, not for character.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Utility/data face — reference numbers, invoice/passport numbers, KPI
// figures. Anywhere a number should read as counted, not decorated.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Topway Applicant System",
  description: "Candidate placement lifecycle management for Topway International",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Also feeds next-themes' own inline script below (it sets the .dark
  // class before paint, to avoid a flash-of-wrong-theme — that script is
  // inline, so it needs this same nonce or the CSP blocks it outright).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // suppressHydrationWarning: next-themes sets the .dark class via that
    // pre-paint script, which never matches the server-rendered markup —
    // expected and harmless, this is next-themes' own documented fix.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} antialiased`}
      >
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
