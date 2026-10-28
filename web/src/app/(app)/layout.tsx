import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app-shell";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";

// Every page under the (app) route group requires a session. This is a
// UX-layer redirect for the browser — it is NOT the security boundary.
// The security boundary is requireSession() inside each Route Handler and
// Server Action; never rely on this layout alone to protect data.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");

  // Mounted here (not per-page) so the tour follows the person regardless
  // of which page they land on first after signing in, same reasoning as
  // ContractClosureModal living in the Agent Portal's own layout.
  const { hasSeenOnboarding } = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { hasSeenOnboarding: true },
  });

  return (
    <AppShell user={user}>
      {!hasSeenOnboarding && <OnboardingTour user={user} />}
      {children}
    </AppShell>
  );
}
