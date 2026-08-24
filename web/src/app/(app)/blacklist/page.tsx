import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { BlacklistTable } from "@/components/blacklist/blacklist-table";

export default async function BlacklistPage() {
  const { user } = await validateRequest();
  if (!user) redirect("/login");
  if (user.role === "STAFF" && !user.permissions.tracking) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
      <div>
        <h1 className="font-heading text-xl font-semibold">Blacklist</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every candidate with a recorded dispute, and which company was handling them at the
          time — shared across every company on this platform so a problem with one placement
          isn&apos;t repeated with another.
        </p>
      </div>
      <BlacklistTable />
    </div>
  );
}
