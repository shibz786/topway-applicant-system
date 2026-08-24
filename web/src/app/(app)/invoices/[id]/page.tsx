import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { InvoiceForm } from "@/components/invoices/invoice-form";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.invoices) redirect("/dashboard");

  const { id } = await params;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <InvoiceForm invoiceId={id} />
    </div>
  );
}
