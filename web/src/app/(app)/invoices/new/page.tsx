import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default async function NewInvoicePage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.invoices) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <InvoiceForm />
    </div>
  );
}
