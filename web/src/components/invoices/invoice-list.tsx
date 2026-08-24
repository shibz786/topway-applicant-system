"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listInvoices,
  duplicateInvoice,
  setInvoiceStatus,
  deleteDraftInvoice,
  type InvoiceListRow,
} from "@/lib/actions/invoices";
import { ALLOWED_STATUS_TRANSITIONS, type InvoiceStatus } from "@/lib/validation/invoice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const INVOICES_QUERY_KEY = ["invoices"];

const STATUS_STYLE: Record<InvoiceStatus, { variant: "outline" | "secondary" | "default" | "destructive"; label: string }> = {
  DRAFT: { variant: "outline", label: "Draft" },
  SENT: { variant: "secondary", label: "Sent" },
  PAID: { variant: "default", label: "Paid" },
  VOID: { variant: "destructive", label: "Void" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status as InvoiceStatus] ?? { variant: "outline" as const, label: status };
  return (
    <Badge variant={style.variant} className={status === "VOID" ? "line-through opacity-70" : ""}>
      {style.label}
    </Badge>
  );
}

// Matches invoice.html's own "Advance" states (None isn't shown at all,
// same as legacy's calculator omitting an empty advance row entirely).
function AdvanceBadge({ status }: { status: string }) {
  if (status === "PAID") {
    return (
      <Badge className="border-0 bg-critical/15 text-critical">
        Advance paid
      </Badge>
    );
  }
  if (status === "REQUESTED") {
    return (
      <Badge className="border-0 bg-warn/15 text-warn">
        Advance requested
      </Badge>
    );
  }
  return null;
}

export function InvoiceList() {
  const queryClient = useQueryClient();
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    id: string;
    number: string;
    status: InvoiceStatus;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: async () => {
      const res = await listInvoices();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { id: string; status: InvoiceStatus }) => {
      const res = await setInvoiceStatus(input);
      if (!res.ok) throw new Error(res.error);
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: INVOICES_QUERY_KEY });
      const previous = queryClient.getQueryData<InvoiceListRow[]>(INVOICES_QUERY_KEY);
      queryClient.setQueryData<InvoiceListRow[]>(INVOICES_QUERY_KEY, (old) =>
        old?.map((inv) => (inv.id === id ? { ...inv, status } : inv)),
      );
      return { previous };
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(INVOICES_QUERY_KEY, context.previous);
      toast.error(err.message);
    },
    onSuccess: () => toast.success("Status updated"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await duplicateInvoice(id);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Invoice duplicated as a new draft");
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteDraftInvoice(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Draft deleted");
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount due</TableHead>
            <TableHead>Advance</TableHead>
            <TableHead>Issued</TableHead>
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
                No invoices yet.
              </TableCell>
            </TableRow>
          )}
          {data?.map((inv) => {
            const status = inv.status as InvoiceStatus;
            const nextStatuses = ALLOWED_STATUS_TRANSITIONS[status] ?? [];
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">
                  {status === "DRAFT" ? (
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">
                      #{inv.number}
                    </Link>
                  ) : (
                    <span>#{inv.number}</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={inv.status} />
                </TableCell>
                <TableCell>
                  {inv.currency} {inv.amountDue.toLocaleString()}
                  {inv.amountDue !== inv.totalAmount && (
                    <span className="ml-1.5 text-xs text-muted-foreground line-through">
                      {inv.totalAmount.toLocaleString()}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <AdvanceBadge status={inv.advanceStatus} />
                </TableCell>
                <TableCell>
                  {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          More
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/api/invoices/${inv.id}/pdf?download=1`}>Download PDF</a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateMutation.mutate(inv.id)}>
                          Duplicate
                        </DropdownMenuItem>
                        {nextStatuses.map((next) => (
                          <DropdownMenuItem
                            key={next}
                            onClick={() =>
                              setPendingStatusChange({ id: inv.id, number: inv.number, status: next })
                            }
                          >
                            Mark as {STATUS_STYLE[next].label}
                          </DropdownMenuItem>
                        ))}
                        {status === "DRAFT" && (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(inv.id)}
                          >
                            Delete draft
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark invoice #{pendingStatusChange?.number} as {pendingStatusChange && STATUS_STYLE[pendingStatusChange.status].label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatusChange?.status === "VOID"
                ? "This invoice will be marked void and can no longer be edited or transitioned. This is logged in the audit trail."
                : "This status change is logged in the audit trail."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatusChange) statusMutation.mutate(pendingStatusChange);
                setPendingStatusChange(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
