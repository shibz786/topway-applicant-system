"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1 },
        },
      }),
  );

  return (
    // attribute="class" is what actually makes the .dark selectors in
    // globals.css activate — toggles the class on <html> based on system
    // preference (defaultTheme="system") or a stored user choice. Without
    // this, every --dark token in the theme is dead: real gap found by
    // screenshotting the login page with colorScheme:"dark" and noticing
    // nothing changed, not something caught by typecheck/build. The nonce
    // prop is required here too — next-themes' pre-paint script is inline,
    // and the app's CSP (middleware.ts) rejects any inline script without
    // the per-request nonce it issued.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
