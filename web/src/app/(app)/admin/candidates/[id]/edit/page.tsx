import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ProfileWizard } from "@/components/candidates/profile-wizard";
import { BasicInfoForm } from "@/components/candidates/basic-info-form";

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.applications) redirect("/admin/candidates");

  const { id } = await params;

  // The module isn't taken from the URL here (unlike /new) - a candidate's
  // own saved workforceModule is authoritative once the record exists, so
  // editing always routes to the right form even if the link that got here
  // didn't carry a ?module= param.
  const candidate = await db.candidate.findUnique({ where: { id }, select: { workforceModule: true } });
  if (!candidate) redirect("/admin/candidates");

  return (
    <div className="p-4 sm:p-8">
      {candidate.workforceModule === "SKILLED" || candidate.workforceModule === "PROFESSIONAL" ? (
        <BasicInfoForm module={candidate.workforceModule} candidateId={id} />
      ) : (
        <ProfileWizard candidateId={id} />
      )}
    </div>
  );
}
