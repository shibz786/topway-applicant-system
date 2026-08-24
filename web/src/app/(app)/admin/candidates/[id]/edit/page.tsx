import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { ProfileWizard } from "@/components/candidates/profile-wizard";

export default async function EditCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.applications) redirect("/admin/candidates");

  const { id } = await params;

  return (
    <div className="p-4 sm:p-8">
      <ProfileWizard candidateId={id} />
    </div>
  );
}
