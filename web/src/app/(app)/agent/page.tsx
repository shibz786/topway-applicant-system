import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { MyApplications } from "@/components/agent-portal/my-applications";

export default async function AgentPortalPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "AGENT") redirect("/admin/candidates");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:p-8">
      <div>
        <h1 className="font-heading text-xl font-semibold">My Applications</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline stages are read-only here. Topway staff manage the visa pipeline.
        </p>
      </div>
      <MyApplications user={user} />
    </div>
  );
}
