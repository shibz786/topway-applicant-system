import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { ApplicationsTable } from "@/components/applications/applications-table";

// D1: a central cross-category view, reachable from the main nav for
// every role (not just admin/staff) - listCandidates() already scopes an
// AGENT to only their own candidates server-side, so this page needs no
// extra redirect the way /admin/candidates redirects agents to the
// mobile-first Agent Portal instead.
export default async function ApplicationsPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Every application across all 4 workforce categories, in one place.
        </p>
      </div>
      <ApplicationsTable user={user} />
    </div>
  );
}
