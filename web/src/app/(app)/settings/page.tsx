import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { ChangePasswordCard } from "@/components/settings/change-password-card";
import { CvBrandingCard } from "@/components/settings/cv-branding-card";

// B1: "Add a Settings page that's easy to find in the main navigation,
// where each agent can manage their CV branding." Every signed-in role
// lands here - password change is universal, CV Branding only renders for
// an AGENT (their own agency) or ADMIN/STAFF with the `agents` permission
// (any agency) since that's who the permissions matrix already lets touch
// Agent records.
export default async function SettingsPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");

  const canManageBranding = user.role === "AGENT" || user.role === "ADMIN" || user.permissions.agents;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Your account and CV branding preferences.</p>
      </div>
      <ChangePasswordCard />
      {canManageBranding && (
        <CvBrandingCard
          currentAgentId={user.role === "AGENT" ? user.agentId : null}
          canPickAgent={user.role === "ADMIN" || user.permissions.agents}
        />
      )}
    </div>
  );
}
