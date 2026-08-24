import { validateRequest } from "@/lib/auth/session";
import { OpsDashboard } from "@/components/dashboard/ops-dashboard";
import { AgentDashboard } from "@/components/dashboard/agent-dashboard";
import { MySessionsCard } from "@/components/account/my-sessions-card";

export default async function DashboardPage() {
  // (app)/layout.tsx already redirected unauthenticated visitors, so `user`
  // is guaranteed here — this call is cache()-deduped, not a second fetch.
  const { user } = await validateRequest();
  if (!user) return null;

  return (
    <>
      {user.role === "AGENT" ? <AgentDashboard name={user.name} /> : <OpsDashboard name={user.name} />}
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-8">
        <MySessionsCard userId={user.id} />
      </div>
    </>
  );
}
