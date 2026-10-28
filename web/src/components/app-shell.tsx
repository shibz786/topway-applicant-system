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

// "Switchboard", the direction picked from the mockup comparison
// (see the redesign-directions artifact). A persistent left rail
// replaces the old top folder-tab bar: it carries the mark on every
// screen instead of a thin strip, and has room to grow as more modules
// land, which the tab row never did. Collapses to a slim top bar with
// a horizontally-scrolling nav row below sm, so the agent portal's
// zero-horizontal-overflow-at-375px behavior is unchanged, not a
// regression: the sidebar only exists at sm and up.
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const navItems = navItemsFor(user);

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      {/* Mobile top bar, sm and up use the sidebar instead. */}
      <header className="sticky top-0 z-10 border-b border-white/8 bg-brand-ink sm:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <Image src="/mark.png" alt="" width={20} height={19} priority className="brightness-0 invert" />
            <span className="text-[16px] font-semibold tracking-tight text-white">Topway</span>
          </Link>
          <LogoutButton />
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors",
                  active ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col bg-gradient-to-b from-brand-ink to-[#0b1215] sm:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
          <Image src="/mark.png" alt="" width={22} height={21} priority className="brightness-0 invert" />
          <span className="text-[16px] font-semibold tracking-tight text-white">Topway</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 font-mono text-[12.5px] font-medium tracking-wide transition-colors",
                  active ? "bg-white/15 font-semibold text-white" : "text-white/55 hover:bg-white/8 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="font-mono text-[10.5px] tracking-wide text-white/50 uppercase">
            {ROLE_LABEL[user.role] ?? user.role}
          </p>
          <div className="mt-2.5">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
