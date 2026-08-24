import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { CompanySettingsForm } from "@/components/invoices/company-settings-form";

export default async function InvoiceSettingsPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/invoices");

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <CompanySettingsForm />
    </div>
  );
}
