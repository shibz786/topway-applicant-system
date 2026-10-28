"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CandidateTable } from "./candidate-table";
import { BasicCandidateTable } from "./basic-candidate-table";
import { WORKFORCE_MODULE_LABELS, type WorkforceModule } from "@/lib/validation/candidate";
import type { SessionUser } from "@/lib/auth/session";

// C: "Each gets its own candidate list, search, filters and status
// tracking" - one page, four tabs, each tab scoping the same underlying
// listCandidates() query to one workforceModule rather than four separate
// routes that would drift apart over time.
export function CandidatesPageClient({ user }: { user: SessionUser }) {
  const [module, setModule] = useState<WorkforceModule>("DOMESTIC");
  const canCreate = user.role === "ADMIN" || user.permissions.applications;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Candidates</h1>
          <p className="text-sm text-muted-foreground">
            Status is always read from tracking fields, never inferred from notes text.
          </p>
        </div>
        {canCreate && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>+ New Candidate</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(WORKFORCE_MODULE_LABELS) as WorkforceModule[]).map((m) => (
                <DropdownMenuItem key={m} asChild>
                  <Link href={`/admin/candidates/new?module=${m}`}>{WORKFORCE_MODULE_LABELS[m]}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Tabs value={module} onValueChange={(v) => setModule(v as WorkforceModule)}>
        <TabsList>
          {(Object.keys(WORKFORCE_MODULE_LABELS) as WorkforceModule[]).map((m) => (
            <TabsTrigger key={m} value={m}>
              {WORKFORCE_MODULE_LABELS[m]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {module === "SKILLED" || module === "PROFESSIONAL" ? (
        <BasicCandidateTable user={user} workforceModule={module} />
      ) : (
        <CandidateTable user={user} workforceModule={module} />
      )}
    </div>
  );
}
