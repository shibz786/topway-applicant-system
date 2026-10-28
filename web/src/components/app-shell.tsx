"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

function navItemsFor(user: SessionUser): NavItem[] {
  const items: NavItem[] = [{ href: "/dashboard", label: "Dashboard" }];

  if (user.role === "AGENT") {
    // Agents get the dedicated mobile-first Agent Portal (card layout,
    // read-only pipeline, databank request flow), not the admin ATS table.
    // Applications and the shared Databank are separate top-level tabs, not
    // nested inside one — an agent without dataBankAccess never sees the
    // second tab at all.
    items.push({ href: "/agent", label: "My Applications" });
    if (user.agentDataBankAccess) {
      items.push({ href: "/agent/databank", label: "Databank" });
    }
    items.push({ href: "/blacklist", label: "Blacklist" });
    // D1: the cross-category Applications view, distinct from "My
    // Applications" above (the Agent Portal's own richer card UI) - this
    // one is the same table every other role sees, just scoped to this
    // agent's own candidates server-side.
    items.push({ href: "/applications", label: "Applications" });
    items.push({ href: "/settings", label: "Settings" });
    return items;
  }

  items.push({ href: "/admin/candidates", label: "Candidates" });
  items.push({ href: "/applications", label: "Applications" });
  if (user.role === "ADMIN" || user.permissions.tracking) {
    items.push({ href: "/admin/tracking", label: "Tracking" });
    // Blacklist is disputed-candidate history — same permission that
    // already governs dispute visibility elsewhere (the Tracking View's
    // "Dispute Active" tab), not a new flag.
    items.push({ href: "/blacklist", label: "Blacklist" });
  }
  if (user.role === "ADMIN" || user.permissions.agents) {
    items.push({ href: "/admin/agents", label: "Agents" });
  }
  if (user.role === "ADMIN") {
    items.push({ href: "/admin/staff", label: "Staff" });
  }
  if (user.role === "ADMIN" || user.permissions.invoices) {
    items.push({ href: "/invoices", label: "Invoices" });
  }
  items.push({ href: "/settings", label: "Settings" });
  return items;
}

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", STAFF: "Staff", AGENT: "Agent" };

// "The Manifest" shell. The masthead is real glass, not a flat panel —
// semi-transparent brand ink with backdrop-blur, so content scrolling
// underneath it is genuinely visible through the bar. This is one of the
// two places this redesign uses glassmorphism (see the mockup artifact's
// own reasoning): a sticky header has something to blur by construction,
// unlike a dense table or KPI tile where blur would fight legibility. The
// folder-tab row underneath (active tab fuses with the page's own paper
// background) is unchanged in concept from "The Register" — that idea
// wasn't the part the user rejected, the typography and palette were.
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const navItems = navItemsFor(user);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-white/8 bg-brand-ink/80 supports-backdrop-filter:backdrop-blur-md supports-backdrop-filter:backdrop-saturate-150">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <Image src="/mark.png" alt="" width={20} height={19} priority className="brightness-0 invert" />
            <span className="hidden text-[16px] font-semibold tracking-tight text-white sm:inline">
              Topway
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="font-mono text-[10.5px] tracking-wide text-white/60 uppercase">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex items-end gap-0.5 overflow-x-auto px-3 sm:px-5">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-t-md px-4 py-2 font-mono text-[11.5px] font-medium tracking-wide whitespace-nowrap transition-colors",
                  active ? "bg-background font-semibold text-brand-ink" : "text-white/60 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
