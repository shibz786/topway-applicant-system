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
import { invoiceFormSchema, ADVANCE_STATUSES, type InvoiceFormInput } from "@/lib/validation/invoice";
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
    watch,
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
      advanceStatus: "NONE",
      advanceAmount: 0,
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
        advanceStatus: (existing.advanceStatus as InvoiceFormInput["advanceStatus"]) ?? "NONE",
        advanceAmount: existing.advanceAmount ?? 0,
      });
    }
  }, [existing, reset]);

  // Live preview, matching the legacy calculator (invoice.html's
  // "Calculated Total" bar) — an advance only reduces what's shown as due
  // once it's actually PAID, not merely requested.
  const watchedItems = watch("items");
  const watchedAdvanceStatus = watch("advanceStatus");
  const watchedAdvanceAmount = watch("advanceAmount");
  const watchedCurrency = watch("currency");
  const subtotal = (watchedItems ?? []).reduce((sum, i) => sum + (i.amount || 0) * (i.quantity || 0), 0);
  const amountDue = watchedAdvanceStatus === "PAID" ? subtotal - (watchedAdvanceAmount || 0) : subtotal;

  if (isEdit && existing && existing.status !== "DRAFT") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invoice #{existing.number}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This invoice is {existing.status.toLowerCase()} and can no longer be edited. Use
            Duplicate from the list to create a new draft based on it.
          </p>
          <div className="space-y-1 text-sm">
            {existing.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span>
                  {item.description} × {item.quantity}
                </span>
                <span>
                  {existing.currency} {(item.amount * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {existing.advanceStatus !== "NONE" && existing.advanceAmount !== null && (
            <div className="flex justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">
                {existing.advanceStatus === "PAID" ? "Advance paid" : "Advance requested"}
              </span>
              <span>
                {existing.currency} {existing.advanceAmount.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-medium">
            <span>Amount due</span>
            <span>
              {existing.currency} {existing.amountDue.toLocaleString()}
            </span>
          </div>
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

          <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Advance</Label>
                <Controller
                  control={control}
                  name="advanceStatus"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ADVANCE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === "NONE" ? "None" : s === "REQUESTED" ? "Requested" : "Paid"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Advance amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  disabled={watchedAdvanceStatus === "NONE"}
                  {...register("advanceAmount", { valueAsNumber: true })}
                />
                {errors.advanceAmount && <p className="text-sm text-destructive">{errors.advanceAmount.message}</p>}
              </div>
            </div>
            <div className="space-y-0.5 text-right text-sm">
              {watchedAdvanceStatus === "PAID" && (watchedAdvanceAmount || 0) > 0 && (
                <p className="text-muted-foreground">
                  Subtotal {watchedCurrency} {subtotal.toFixed(2)}, less advance paid {watchedCurrency}{" "}
                  {(watchedAdvanceAmount || 0).toFixed(2)}
                </p>
              )}
              <p className="font-medium">
                Amount due: {watchedCurrency} {amountDue.toFixed(2)}
              </p>
            </div>
          </div>
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
