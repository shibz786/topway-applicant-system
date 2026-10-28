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
    //
    // The font variable classes (inter.variable/plexMono.variable) live on
    // <html>, not <body>. A real bug, found live: they used to sit on
    // <body> only. CSS custom properties resolve lazily per-element using
    // that element's OWN inheritance chain, not a value frozen at the
    // declaring selector - so globals.css's `html { font-family:
    // var(--font-inter) }` rule, evaluated AT html itself, saw an unset
    // --font-inter (the class granting it was one level further down, on
    // body) and fell through to the CSS initial value with no fallback,
    // which Chromium renders as Times. Every element that inherited
    // font-family through html/body rather than carrying its own explicit
    // font-heading/font-mono class (i.e. nearly all plain body text)
    // rendered in serif Times instead of Inter. Headings looked fine only
    // because .font-heading directly re-resolves --font-inter at its own
    // position. Putting the variable classes on <html> fixes it at the
    // root, for every descendant, without needing an explicit class
    // anywhere - confirmed live via computed-style inspection (html/body
    // font-family both read "Inter, Inter Fallback" after the fix).
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plexMono.variable}`}>
      <body className="antialiased">
        <Providers nonce={nonce}>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
