"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCompanySettings, updateCompanySettings } from "@/lib/actions/company-settings";
import { companySettingsSchema, type CompanySettingsInput } from "@/lib/validation/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const FIELDS: { name: keyof CompanySettingsInput; label: string }[] = [
  { name: "bankName", label: "Bank name" },
  { name: "accountName", label: "Account name" },
  { name: "accountNo", label: "Account number" },
  { name: "swiftCode", label: "SWIFT code" },
  { name: "email", label: "Company email" },
  { name: "phone", label: "Phone" },
  { name: "fax", label: "Fax" },
  { name: "website", label: "Website" },
  { name: "address", label: "Address" },
];

export function CompanySettingsForm() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const res = await getCompanySettings();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanySettingsInput>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (data) {
      reset({
        bankName: data.bankName ?? "",
        accountNo: data.accountNo ?? "",
        accountName: data.accountName ?? "",
        swiftCode: data.swiftCode ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        fax: data.fax ?? "",
        address: data.address ?? "",
        website: data.website ?? "",
      });
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: async (values: CompanySettingsInput) => {
      const res = await updateCompanySettings(values);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Bank details updated");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank details & company info</CardTitle>
        <CardDescription>
          Shown on every generated invoice PDF. Admin-only, per the security spec.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          {FIELDS.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input id={f.name} {...register(f.name)} />
              {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
