import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { AgentManager } from "@/components/agents/agent-manager";
import { DatabankRequests } from "@/components/agents/databank-requests";

export default async function AgentsPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.agents) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Create foreign recruitment agents, toggle databank access, and reassign candidates from
          each candidate&apos;s own detail panel.
        </p>
      </div>
      {/* listDatabankRequests is admin-only server-side — don't render it
          for staff even though they can reach this page via the `agents`
          permission flag, or every mount would 403-toast on load. */}
      {user.role === "ADMIN" && <DatabankRequests />}
      <AgentManager />
    </div>
  );
}
