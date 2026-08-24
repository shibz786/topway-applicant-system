import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

// Display face - headings only (see globals.css --font-heading). Swapped
// off Fraunces (a serif, "The Register" direction) for a cleaner, more
// current geometric sans - Geist is purpose-built for software UI and,
// since this app deploys on Vercel, is a natural fit for the surface it
// actually runs on.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Body/UI/data face - carries every paragraph, label, and table cell in
// the app. Chosen for legibility at the small sizes a dense ATS table
// demands, not for character.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Utility/data face - reference numbers, invoice/passport numbers, KPI
// figures. Anywhere a number should read as counted, not decorated. Pairs
// naturally with Geist proper above (same type family, built together).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
        className={`${geist.variable} ${inter.variable} ${geistMono.variable} antialiased`}
      >
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
