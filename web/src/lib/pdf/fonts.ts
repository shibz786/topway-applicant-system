import "server-only";
import { Font } from "@react-pdf/renderer";
import { join } from "node:path";

// The legacy PDF/print templates (index.html's #pdf-layout, invoice.html's
// buildPrintTemplate) both declare `font-family: Inter, Arial, Helvetica,
// sans-serif` and lean on real weight variety (500/600/700/800/900) for
// their look — react-pdf's built-in Helvetica only has Normal/Bold, which
// would flatten that. @fontsource/inter ships local .woff2 files (works
// directly with react-pdf/fontkit, verified) so PDF rendering doesn't
// depend on a network fetch at request time.
let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;

  // Plain .ttf, converted once from @fontsource/inter's .woff via
  // fontTools (see src/lib/pdf/fonts-ttf/, checked in) — both the .woff2
  // AND .woff files trip a real fontkit bug once a document has enough
  // distinct glyphs across enough Text nodes to need real subsetting
  // (RangeError inside fontkit's glyph encoder; reproduced directly
  // against fontkit/pdfkit standalone, nothing to do with Next or this
  // app). Plain TTF sidesteps whatever WOFF-wrapper table quirk causes it
  // and renders the full candidate PDF correctly.
  const weights = [400, 500, 600, 700, 800, 900] as const;
  Font.register({
    family: "Inter",
    fonts: [
      ...weights.map((weight) => ({
        src: join(process.cwd(), `src/lib/pdf/fonts-ttf/inter-${weight}.ttf`),
        fontWeight: weight,
      })),
      // Only the one italic weight actually used (the candidate PDF's
      // empty-agent-logo placeholder text, matching the legacy CSS's
      // `font-style: italic` on .pdf-logo-empty).
      {
        src: join(process.cwd(), "src/lib/pdf/fonts-ttf/inter-400-italic.ttf"),
        fontWeight: 400,
        fontStyle: "italic",
      },
    ],
  });

  // react-pdf's default hyphenation callback breaks names/words at
  // arbitrary points when a container is tight — the legacy templates
  // never did this (browser text just overflows/wraps by word). Matching
  // that is closer to "how it originally was" than silently hyphenating.
  Font.registerHyphenationCallback((word) => [word]);
}
