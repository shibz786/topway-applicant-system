"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Permissions } from "@/lib/permissions";

const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  applications: "Applications: create/edit candidate profiles",
  databank: "Databank: browse the candidate databank",
  invoices: "Invoices: access the invoicing portal",
  agents: "Agents: assign/reassign candidates to agents",
  tracking: "Tracking: visa pipeline, departure, disputes",
};

// Generic over any form whose values include a `permissions: Permissions`
// field, so the same component works in both the create and edit dialogs
// without duplicating the switches.
export function PermissionsFields<T extends FieldValues & { permissions: Permissions }>({
  control,
}: {
  control: Control<T>;
}) {
  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Permissions</p>
      {(Object.keys(PERMISSION_LABELS) as (keyof Permissions)[]).map((key) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <Label htmlFor={`perm-${key}`} className="text-sm font-normal text-muted-foreground">
            {PERMISSION_LABELS[key]}
          </Label>
          <Controller
            control={control}
            name={`permissions.${key}` as Path<T>}
            render={({ field }) => (
              <Switch id={`perm-${key}`} checked={!!field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
      ))}
    </div>
  );
}
