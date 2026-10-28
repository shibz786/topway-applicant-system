"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBasicCandidate,
  updateBasicCandidate,
  getCandidate,
} from "@/lib/actions/candidates";
import { basicInfoSchema, type BasicInfoInput, WORKFORCE_MODULE_LABELS } from "@/lib/validation/candidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DocumentUpload } from "./document-upload";
import { CertificateUpload } from "./certificate-upload";

// C3/C4: Skilled & Technical / Professional Workforce. "No generated CV.
// Upload the candidate's own CV (PDF) + basic candidate info + attached
// qualification/trade certificates" - a single page, not a 4-step wizard,
// since there's no CV to build up to. Candidate record is created on
// first save (same "draft saved to DB" pattern as the Domestic wizard,
// just one step instead of four) so the upload sections have an id.
export function BasicInfoForm({
  module,
  candidateId: initialCandidateId,
}: {
  module: "SKILLED" | "PROFESSIONAL";
  candidateId?: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BasicInfoInput>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      fullName: "",
      nationality: "",
      dateOfBirth: "",
      passportNumber: "",
      passportExpiry: "",
      phone: "",
      address: "",
      trade: "",
      yearsExperience: undefined,
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["candidate", initialCandidateId],
    queryFn: async () => {
      const res = await getCandidate(initialCandidateId!);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!initialCandidateId,
  });

  useEffect(() => {
    if (existing) {
      reset({
        fullName: existing.fullName,
        nationality: existing.nationality,
        dateOfBirth: new Date(existing.dateOfBirth).toISOString().slice(0, 10),
        passportNumber: existing.passportNumber,
        passportExpiry: new Date(existing.passportExpiry).toISOString().slice(0, 10),
        phone: existing.phone ?? "",
        address: existing.address ?? "",
        trade: existing.skills[0] ?? "",
        yearsExperience: existing.yearsExperience,
      });
    }
  }, [existing, reset]);

  async function onSubmit(values: BasicInfoInput) {
    const res = initialCandidateId
      ? await updateBasicCandidate(initialCandidateId, values)
      : await createBasicCandidate(values, module);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved");
    if (!initialCandidateId) {
      router.push(`/admin/candidates/${(res.data as { id: string }).id}/edit?module=${module}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{WORKFORCE_MODULE_LABELS[module]}</CardTitle>
          <CardDescription>Basic candidate info. No CV is generated for this module.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Full name" error={errors.fullName?.message}>
              <Input {...register("fullName")} />
            </Field>
            <Field label="Nationality" error={errors.nationality?.message}>
              <Input {...register("nationality")} />
            </Field>
            <Field label="Date of birth" error={errors.dateOfBirth?.message}>
              <Input type="date" {...register("dateOfBirth")} />
            </Field>
            <Field label="Trade / Role">
              <Input {...register("trade")} placeholder="e.g. Electrician, Civil Engineer" />
            </Field>
            <Field label="Passport number" error={errors.passportNumber?.message}>
              <Input {...register("passportNumber")} />
            </Field>
            <Field label="Passport expiry" error={errors.passportExpiry?.message}>
              <Input type="date" {...register("passportExpiry")} />
            </Field>
            <Field label="Years of experience" error={errors.yearsExperience?.message}>
              <Input type="number" {...register("yearsExperience", { valueAsNumber: true })} />
            </Field>
            <Field label="Phone">
              <Input {...register("phone")} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea rows={2} {...register("address")} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {initialCandidateId && (
        <Card>
          <CardHeader>
            <CardTitle>CV &amp; Certificates</CardTitle>
            <CardDescription>Upload the candidate&apos;s own CV and any qualification/trade certificates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <DocumentUpload candidateId={initialCandidateId} canEdit types={["own_cv"]} />
            <CertificateUpload candidateId={initialCandidateId} canEdit />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
