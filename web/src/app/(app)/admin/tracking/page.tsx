import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { TrackingView } from "@/components/tracking-view/tracking-view";
import { ContractClosureBanner } from "@/components/tracking-view/contract-closure-banner";

export default async function TrackingPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && !user.permissions.tracking) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Tracking</h1>
        <p className="text-sm text-muted-foreground">Post-departure candidates, grouped by stage.</p>
      </div>
      <ContractClosureBanner />
      <TrackingView user={user} />
    </div>
  );
}
