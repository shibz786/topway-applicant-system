"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listStaff, createStaff, updateStaff, type StaffRow } from "@/lib/actions/staff";
import {
  createStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from "@/lib/validation/staff";
import { NO_PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { PermissionsFields } from "./permissions-fields";
import { SessionsDialog } from "./sessions-dialog";

const STAFF_QUERY_KEY = ["staff"];

export function StaffManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [sessionsFor, setSessionsFor] = useState<StaffRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: STAFF_QUERY_KEY,
    queryFn: async () => {
      const res = await listStaff();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  function onCreated() {
    setCreateOpen(false);
    queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
  }
  function onUpdated() {
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>+ New Staff Member</Button>
          </DialogTrigger>
          <DialogContent>
            <CreateStaffForm onSuccess={onCreated} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No staff accounts yet.
                </TableCell>
              </TableRow>
            )}
            {data?.map((s) => {
              const perms = s.permissions as Record<string, boolean>;
              const activeFlags = Object.entries(perms)
                .filter(([, v]) => v)
                .map(([k]) => k);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.username}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell className="max-w-48">
                    <div className="flex flex-wrap gap-1">
                      {activeFlags.length === 0 && (
                        <span className="text-xs text-muted-foreground">none</span>
                      )}
                      {activeFlags.map((f) => (
                        <Badge key={f} variant="secondary" className="text-xs">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {s.isActive ? (
                      <Badge variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSessionsFor(s)}>
                      Sessions
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && <EditStaffForm staff={editing} onSuccess={onUpdated} />}
        </DialogContent>
      </Dialog>

      {sessionsFor && (
        <SessionsDialog
          userId={sessionsFor.id}
          userName={sessionsFor.name}
          open={!!sessionsFor}
          onOpenChange={(open) => !open && setSessionsFor(null)}
        />
      )}
    </div>
  );
}

function CreateStaffForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { name: "", username: "", email: "", password: "", permissions: NO_PERMISSIONS },
  });

  async function onSubmit(values: CreateStaffInput) {
    const res = await createStaff(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Staff member created");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>New Staff Member</DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" {...register("username")} aria-invalid={!!errors.username} />
        {errors.username && <p className="text-sm text-destructive">{errors.username.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Temporary password</Label>
        <Input id="password" type="password" {...register("password")} aria-invalid={!!errors.password} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <PermissionsFields control={control} />

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditStaffForm({ staff, onSuccess }: { staff: StaffRow; onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateStaffInput>({
    resolver: zodResolver(updateStaffSchema),
    defaultValues: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      password: "",
      permissions: staff.permissions as UpdateStaffInput["permissions"],
      isActive: staff.isActive,
    },
  });

  async function onSubmit(values: UpdateStaffInput) {
    const res = await updateStaff({ ...values, password: values.password || undefined });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Staff member updated");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Edit {staff.name}</DialogTitle>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="edit-name">Name</Label>
        <Input id="edit-name" {...register("name")} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-email">Email</Label>
        <Input id="edit-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-password">New password (leave blank to keep current)</Label>
        <Input id="edit-password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <Label htmlFor="edit-active" className="text-sm font-normal">
          Account active
        </Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch id="edit-active" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <PermissionsFields control={control} />

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
