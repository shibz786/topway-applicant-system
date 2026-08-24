import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { StaffManager } from "@/components/staff/staff-manager";

export default async function StaffPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  // (app)/layout.tsx only guarantees "logged in", not "admin" — this page
  // is admin-only per the permissions matrix, so check the role here too.
  // (The real gate is still requireSession({ role: "ADMIN" }) inside every
  // Server Action below — this redirect is just so a non-admin who
  // navigates here directly sees something sane instead of empty data.)
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Create staff accounts and set per-section permissions. Every action here is checked
          server-side against the ADMIN role, not just hidden from the nav.
        </p>
      </div>
      <StaffManager />
    </div>
  );
}
