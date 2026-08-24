import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

// Every page under the (app) route group requires a session. This is a
// UX-layer redirect for the browser — it is NOT the security boundary.
// The security boundary is requireSession() inside each Route Handler and
// Server Action; never rely on this layout alone to protect data.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
