import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { CandidatesPageClient } from "@/components/candidates/candidates-page-client";

export default async function CandidatesPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  // Agents get the dedicated mobile-first Agent Portal instead — this wide
  // table isn't usable at 375px, and CLAUDE.md's Agent Portal spec is its
  // own card-based UI, not a cut-down view of the admin console.
  if (user.role === "AGENT") redirect("/agent");

  return <CandidatesPageClient user={user} />;
}
