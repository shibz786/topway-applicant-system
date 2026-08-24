"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listAgents, createAgent, updateAgent, type AgentRow } from "@/lib/actions/agents";
import { createAgentSchema, updateAgentSchema, type CreateAgentInput, type UpdateAgentInput } from "@/lib/validation/agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { SessionsDialog } from "@/components/staff/sessions-dialog";

const AGENTS_QUERY_KEY = ["agents-admin"];

export function AgentManager() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [sessionsFor, setSessionsFor] = useState<AgentRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: AGENTS_QUERY_KEY,
    queryFn: async () => {
      const res = await listAgents();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>+ New Agent</Button>
          </DialogTrigger>
          <DialogContent>
            <CreateAgentForm
              onSuccess={() => {
                setCreateOpen(false);
                refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Databank Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.companyName}</TableCell>
                <TableCell>
                  {a.user.name} ({a.user.username})
                </TableCell>
                <TableCell>{a.country}</TableCell>
                <TableCell>{a._count.placements}</TableCell>
                <TableCell>{a.dataBankAccess ? <Badge variant="secondary">Yes</Badge> : "-"}</TableCell>
                <TableCell>
                  {a.user.isActive ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSessionsFor(a)}>
                    Sessions
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {sessionsFor && (
        <SessionsDialog
          userId={sessionsFor.user.id}
          userName={sessionsFor.user.name}
          open={!!sessionsFor}
          onOpenChange={(open) => !open && setSessionsFor(null)}
        />
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <EditAgentForm
              agent={editing}
              onSuccess={() => {
                setEditing(null);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateAgentForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateAgentInput>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      name: "",
      companyName: "",
      country: "",
      username: "",
      email: "",
      password: "",
      dataBankAccess: false,
    },
  });

  async function onSubmit(values: CreateAgentInput) {
    const res = await createAgent(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Agent created");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>New Agent</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Contact name" error={errors.name?.message}>
          <Input {...register("name")} />
        </F>
        <F label="Company" error={errors.companyName?.message}>
          <Input {...register("companyName")} />
        </F>
        <F label="Country" error={errors.country?.message}>
          <Input {...register("country")} />
        </F>
        <F label="Username" error={errors.username?.message}>
          <Input {...register("username")} />
        </F>
        <F label="Email" error={errors.email?.message}>
          <Input type="email" {...register("email")} />
        </F>
        <F label="Temporary password" error={errors.password?.message}>
          <Input type="password" {...register("password")} />
        </F>
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label className="text-sm font-normal">Databank access</Label>
        <Controller
          control={control}
          name="dataBankAccess"
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating…" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditAgentForm({ agent, onSuccess }: { agent: AgentRow; onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAgentInput>({
    resolver: zodResolver(updateAgentSchema),
    defaultValues: {
      id: agent.id,
      name: agent.user.name,
      companyName: agent.companyName,
      country: agent.country,
      email: agent.user.email,
      password: "",
      dataBankAccess: agent.dataBankAccess,
      isActive: agent.user.isActive,
    },
  });

  async function onSubmit(values: UpdateAgentInput) {
    const res = await updateAgent({ ...values, password: values.password || undefined });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Agent updated");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Edit {agent.companyName}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Contact name" error={errors.name?.message}>
          <Input {...register("name")} />
        </F>
        <F label="Company" error={errors.companyName?.message}>
          <Input {...register("companyName")} />
        </F>
        <F label="Country" error={errors.country?.message}>
          <Input {...register("country")} />
        </F>
        <F label="Email" error={errors.email?.message}>
          <Input type="email" {...register("email")} />
        </F>
        <F label="New password (optional)" error={errors.password?.message}>
          <Input type="password" {...register("password")} />
        </F>
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label className="text-sm font-normal">Databank access</Label>
        <Controller
          control={control}
          name="dataBankAccess"
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
      </div>
      <div className="flex items-center justify-between rounded-md border p-3">
        <Label className="text-sm font-normal">Account active</Label>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function F({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
