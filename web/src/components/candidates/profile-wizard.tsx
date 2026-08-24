"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createCandidateDraft,
  updateCandidatePersonal,
  updateCandidateExperience,
  getCandidate,
  type CandidateDetail,
} from "@/lib/actions/candidates";
import {
  personalDetailsSchema,
  experienceSkillsSchema,
  type PersonalDetailsInput,
  type ExperienceSkillsInput,
  SKILL_OPTIONS,
  LANGUAGE_OPTIONS,
} from "@/lib/validation/candidate";
import { WORKER_CATEGORY_LABELS } from "@/lib/business/tracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentUpload } from "./document-upload";
import type { WorkerCategory } from "@prisma/client";

const STEPS = ["Personal Details", "Experience & Skills", "Documents", "Review"] as const;

export function ProfileWizard({ candidateId: initialCandidateId }: { candidateId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [candidateId, setCandidateId] = useState<string | undefined>(initialCandidateId);

  const { data: existing } = useQuery({
    queryKey: ["candidate", initialCandidateId],
    queryFn: async () => {
      const res = await getCandidate(initialCandidateId!);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: !!initialCandidateId,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WizardStepper current={step} />

      {step === 0 && (
        <PersonalDetailsStep
          candidateId={candidateId}
          existing={existing}
          onDone={(id) => {
            setCandidateId(id);
            setStep(1);
          }}
        />
      )}
      {step === 1 && candidateId && (
        <ExperienceSkillsStep
          candidateId={candidateId}
          existing={existing}
          onBack={() => setStep(0)}
          onDone={() => setStep(2)}
        />
      )}
      {step === 2 && candidateId && (
        <DocumentsStep candidateId={candidateId} onBack={() => setStep(1)} onDone={() => setStep(3)} />
      )}
      {step === 3 && candidateId && (
        <ReviewStep candidateId={candidateId} onBack={() => setStep(2)} onFinish={() => router.push("/admin/candidates")} />
      )}
    </div>
  );
}

function WizardStepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-xs ${i === current ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
          {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}

function PersonalDetailsStep({
  candidateId,
  existing,
  onDone,
}: {
  candidateId?: string;
  existing?: CandidateDetail;
  onDone: (id: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonalDetailsInput>({
    resolver: zodResolver(personalDetailsSchema),
    defaultValues: {
      fullName: "",
      nationality: "",
      dateOfBirth: "",
      passportNumber: "",
      passportExpiry: "",
      phone: "",
      address: "",
      religion: "",
    },
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
        religion: existing.religion ?? "",
      });
    }
  }, [existing, reset]);

  async function onSubmit(values: PersonalDetailsInput) {
    const res = candidateId
      ? await updateCandidatePersonal(candidateId, values)
      : await createCandidateDraft(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved");
    onDone(candidateId ?? (res.data as { id: string }).id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Details</CardTitle>
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
          <Field label="Religion">
            <Input {...register("religion")} />
          </Field>
          <Field label="Passport number" error={errors.passportNumber?.message}>
            <Input {...register("passportNumber")} />
          </Field>
          <Field label="Passport expiry" error={errors.passportExpiry?.message}>
            <Input type="date" {...register("passportExpiry")} />
          </Field>
          <Field label="Phone">
            <Input {...register("phone")} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} {...register("address")} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save & Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ExperienceSkillsStep({
  candidateId,
  existing,
  onBack,
  onDone,
}: {
  candidateId: string;
  existing?: CandidateDetail;
  onBack: () => void;
  onDone: () => void;
}) {
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<ExperienceSkillsInput>({
    resolver: zodResolver(experienceSkillsSchema),
    defaultValues: {
      category: "FIRST_TIMER",
      skills: [],
      languages: [],
      yearsExperience: 0,
      contractDuration: 24,
    },
  });

  useEffect(() => {
    if (existing) {
      reset({
        category: existing.category,
        skills: existing.skills,
        languages: existing.languages,
        yearsExperience: existing.yearsExperience,
        contractDuration: existing.contractDuration,
      });
    }
  }, [existing, reset]);

  async function onSubmit(values: ExperienceSkillsInput) {
    const res = await updateCandidateExperience(candidateId, values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved");
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Experience & Skills</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(WORKER_CATEGORY_LABELS) as WorkerCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {WORKER_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Years of experience</Label>
              <Controller
                control={control}
                name="yearsExperience"
                render={({ field }) => (
                  <Input
                    type="number"
                    min={0}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Contract duration (months)</Label>
              <Controller
                control={control}
                name="contractDuration"
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                )}
              />
            </div>
          </div>

          <CheckboxGroup control={control} name="skills" label="Skills" options={SKILL_OPTIONS} />
          <CheckboxGroup control={control} name="languages" label="Languages" options={LANGUAGE_OPTIONS} />

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save & Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function CheckboxGroup({
  control,
  name,
  label,
  options,
}: {
  control: ReturnType<typeof useForm<ExperienceSkillsInput>>["control"];
  name: "skills" | "languages";
  label: string;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.map((opt) => {
              const checked = (field.value as string[]).includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const current = field.value as string[];
                      field.onChange(v ? [...current, opt] : current.filter((x) => x !== opt));
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        )}
      />
    </div>
  );
}

function DocumentsStep({
  candidateId,
  onBack,
  onDone,
}: {
  candidateId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DocumentUpload candidateId={candidateId} canEdit />
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onDone}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewStep({
  candidateId,
  onBack,
  onFinish,
}: {
  candidateId: string;
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Profile saved. You can export a PDF now or come back to make further edits any time from
          the candidate table.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/candidates/${candidateId}/pdf`} target="_blank" rel="noreferrer">
              View PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/candidates/${candidateId}/pdf?download=1`}>Download PDF</a>
          </Button>
        </div>
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onFinish}>
            Finish
          </Button>
        </div>
      </CardContent>
    </Card>
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
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
