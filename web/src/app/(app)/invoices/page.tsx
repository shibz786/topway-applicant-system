import { redirect } from "next/navigation";
import Link from "next/link";
import { validateRequest } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { InvoiceList } from "@/components/invoices/invoice-list";

export default async function InvoicesPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  // UX-layer only — every Server Action behind this page independently
  // checks requirePermission(user, "invoices") server-side.
  if (user.role !== "ADMIN" && !user.permissions.invoices) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Draft → Sent → Paid → Void. Every status change is audit-logged.
          </p>
        </div>
        <div className="flex gap-2">
          {user.role === "ADMIN" && (
            <Button variant="outline" asChild>
              <Link href="/invoices/settings">Bank Details</Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/invoices/new">+ New Invoice</Link>
          </Button>
        </div>
      </div>
      <InvoiceList />
    </div>
  );
}
