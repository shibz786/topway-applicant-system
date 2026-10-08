import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

// One face for everything, headings and body alike (see globals.css
// --font-heading, which now resolves to this same variable). The user's
// standing instruction after rejecting a follow-up redesign pass as "too
// AI generic": always use a standard, clear, easy-to-read font, no
// display serif (Fraunces), no stylized accent face (Space Grotesk, which
// a since-superseded mockup also tried). Inter carries every paragraph,
// heading, label, and table cell - legible at the small sizes a dense ATS
// table demands, with zero added "character" to read as generic-AI.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Utility/data face - reference numbers, invoice/passport numbers, KPI
// figures. Anywhere a number should read as counted, not decorated. IBM
// Plex Mono over Geist Mono for the same reason as the heading swap - a
// standard monospace, not one chosen for character.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
        className={`${inter.variable} ${plexMono.variable} antialiased`}
      >
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
