import { redirect } from "next/navigation";
import Link from "next/link";
import { validateRequest } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { CandidateTable } from "@/components/candidates/candidate-table";

export default async function CandidatesPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  // Agents get the dedicated mobile-first Agent Portal instead — this wide
  // table isn't usable at 375px, and CLAUDE.md's Agent Portal spec is its
  // own card-based UI, not a cut-down view of the admin console.
  if (user.role === "AGENT") redirect("/agent");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Candidates</h1>
          <p className="text-sm text-muted-foreground">
            Status is always read from tracking fields, never inferred from notes text.
          </p>
        </div>
        {(user.role === "ADMIN" || user.permissions.applications) && (
          <Button asChild>
            <Link href="/admin/candidates/new">+ New Candidate</Link>
          </Button>
        )}
      </div>
      <CandidateTable user={user} />
    </div>
  );
}
