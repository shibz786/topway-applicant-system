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
  const module: WorkforceModule = WORKFORCE_MODULES.includes(rawModule as WorkforceModule)
    ? (rawModule as WorkforceModule)
    : "DOMESTIC";

  return (
    <div className="p-4 sm:p-8">
      {module === "SKILLED" || module === "PROFESSIONAL" ? (
        <BasicInfoForm module={module} />
      ) : (
        <ProfileWizard workforceModule={module} />
      )}
    </div>
  );
}
