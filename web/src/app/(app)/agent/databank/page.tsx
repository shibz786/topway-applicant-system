import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { DatabankBrowser } from "@/components/agent-portal/databank-browser";

// Its own top-level route (not a tab bolted onto My Applications) — the
// user's explicit ask: "Separate Applications and Candidate Databank."
export default async function AgentDatabankPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "AGENT") redirect("/admin/candidates");
  // UX-layer only, matching the nav link's own gating — every action this
  // page calls (listDatabank, requestAssignment) independently checks
  // dataBankAccess server-side too.
  if (!user.agentDataBankAccess) redirect("/agent");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-8">
      <div>
        <h1 className="font-heading text-xl font-semibold">Candidate Databank</h1>
        <p className="text-sm text-muted-foreground">
          Browse candidates available for assignment. Requesting a candidate notifies Topway
          admin for approval. It isn&apos;t self-service.
        </p>
      </div>
      <DatabankBrowser />
    </div>
  );
}
