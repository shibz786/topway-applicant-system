import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { ProfileWizard } from "@/components/candidates/profile-wizard";
import { BasicInfoForm } from "@/components/candidates/basic-info-form";
import { WORKFORCE_MODULES, type WorkforceModule } from "@/lib/validation/candidate";

export default async function NewCandidatePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.applications) redirect("/admin/candidates");

  const { module: rawModule } = await searchParams;
  // Named workforceModule, not `module` - Next.js's build lints against
  // ever assigning to a variable literally named `module` (it collides
  // with the CommonJS module-scope binding), and this is exactly that:
  // a real build-blocking error on Vercel, not a style nit. Caught live
  // by the actual production deploy failing, not by local dev (next dev
  // doesn't run this same lint-on-build step), so this won't surface in
  // a local check - watch for it if anything ever reintroduces `module`
  // as a plain variable name anywhere in this app.
  const workforceModule: WorkforceModule = WORKFORCE_MODULES.includes(rawModule as WorkforceModule)
    ? (rawModule as WorkforceModule)
    : "DOMESTIC";

  return (
    <div className="p-4 sm:p-8">
      {workforceModule === "SKILLED" || workforceModule === "PROFESSIONAL" ? (
        <BasicInfoForm module={workforceModule} />
      ) : (
        <ProfileWizard workforceModule={workforceModule} />
      )}
    </div>
  );
}
