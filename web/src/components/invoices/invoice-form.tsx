"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createInvoice,
  updateInvoice,
  getInvoice,
  listAgentsForInvoice,
  listCandidatesForInvoice,
} from "@/lib/actions/invoices";
import { invoiceFormSchema, type InvoiceFormInput } from "@/lib/validation/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMPTY_ITEM = { candidateId: null, description: "", amount: 0, quantity: 1 };

export function InvoiceForm({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const isEdit = !!invoiceId;

  const { data: agents } = useQuery({
    queryKey: ["invoice-agents"],
    queryFn: async () => {
      const res = await listAgentsForInvoice();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["invoice-candidates"],
    queryFn: async () => {
      const res = await listCandidatesForInvoice();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const res = await getInvoice(invoiceId!);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: isEdit,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      agentId: null,
      currency: "USD",
      notes: "",
      issuedAt: new Date().toISOString().slice(0, 10),
      dueAt: "",
      items: [EMPTY_ITEM],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (existing) {
      reset({
        agentId: existing.agentId,
        currency: existing.currency,
        notes: existing.notes ?? "",
        issuedAt: existing.issuedAt ? new Date(existing.issuedAt).toISOString().slice(0, 10) : "",
        dueAt: existing.dueAt ? new Date(existing.dueAt).toISOString().slice(0, 10) : "",
        items: existing.items.map((i) => ({
          id: i.id,
          candidateId: i.candidateId,
          description: i.description,
          amount: i.amount,
          quantity: i.quantity,
        })),
      });
    }
  }, [existing, reset]);

  if (isEdit && existing && existing.status !== "DRAFT") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Invoice #{existing.number} is {existing.status.toLowerCase()} and can no longer be edited.
          Use Duplicate from the list to create a new draft based on it.
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(values: InvoiceFormInput) {
    if (isEdit) {
      const res = await updateInvoice(invoiceId!, values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice updated");
      router.push("/invoices");
    } else {
      const res = await createInvoice(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Invoice created");
      router.push(`/invoices/${res.data.id}`);
    }
    router.refresh();
  }

  if (isEdit && loadingExisting) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{isEdit ? `Edit invoice #${existing?.number}` : "New invoice"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Agent</Label>
            <Controller
              control={control}
              name="agentId"
              render={({ field }) => (
                <Select value={field.value ?? "__none"} onValueChange={(v) => field.onChange(v === "__none" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {agents?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.companyName} ({a.country})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" {...register("currency")} aria-invalid={!!errors.currency} />
            {errors.currency && <p className="text-sm text-destructive">{errors.currency.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="issuedAt">Issued date</Label>
            <Input id="issuedAt" type="date" {...register("issuedAt")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueAt">Due date</Label>
            <Input id="dueAt" type="date" {...register("dueAt")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input {...register(`items.${index}.description`)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Candidate (optional)</Label>
                <Controller
                  control={control}
                  name={`items.${index}.candidateId`}
                  render={({ field: f }) => (
                    <Select value={f.value ?? "__none"} onValueChange={(v) => f.onChange(v === "__none" ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {candidates?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={1}
                  {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  {...register(`items.${index}.amount`, { valueAsNumber: true })}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {errors.items?.message && <p className="text-sm text-destructive">{errors.items.message}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => append(EMPTY_ITEM)}>
            + Add line item
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea {...register("notes")} rows={3} />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/invoices")}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
        </Button>
      </div>
    </form>
  );
}
