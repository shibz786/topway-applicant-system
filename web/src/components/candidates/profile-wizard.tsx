"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
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
import { checkBlacklistMatch, type BlacklistMatch } from "@/lib/actions/blacklist";
import {
  personalDetailsSchema,
  experienceSkillsSchema,
  MARITAL_STATUS_OPTIONS,
  type PersonalDetailsInput,
  type ExperienceSkillsInput,
  type WorkforceModule,
  SKILL_OPTIONS,
  GENERAL_SKILL_OPTIONS,
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
import { TriangleAlert } from "lucide-react";
import type { WorkerCategory } from "@prisma/client";

const STEPS = ["Personal Details", "Experience & Skills", "Documents", "Review"] as const;

export function ProfileWizard({
  candidateId: initialCandidateId,
  workforceModule = "DOMESTIC",
}: {
  candidateId?: string;
  // C1/C2 share this exact wizard (spec: "Reuse the Domestic CV template,
  // swapping job-relevant skills"). C3/C4 use BasicInfoForm instead, not
  // this component at all - no generated CV, so the 4-step flow doesn't
  // apply to them.
  workforceModule?: WorkforceModule;
}) {
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

  // Editing an existing candidate always uses ITS OWN saved module, never
  // whatever the route happened to be reached with - the module isn't
  // something a later edit should be able to silently change.
  const effectiveModule = existing?.workforceModule ?? workforceModule;
  const skillOptions = effectiveModule === "GENERAL" ? GENERAL_SKILL_OPTIONS : SKILL_OPTIONS;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WizardStepper current={step} />

      {step === 0 && (
        <PersonalDetailsStep
          candidateId={candidateId}
          existing={existing}
          workforceModule={effectiveModule}
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
          skillOptions={skillOptions}
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
  workforceModule,
  onDone,
}: {
  candidateId?: string;
  existing?: CandidateDetail;
  workforceModule: WorkforceModule;
  onDone: (id: string) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PersonalDetailsInput>({
    resolver: zodResolver(personalDetailsSchema),
    defaultValues: {
      fullName: "",
      nationality: "",
      dateOfBirth: "",
      passportNumber: "",
      passportExpiry: "",
      idNumber: "",
      phone: "",
      address: "",
      religion: "",
      heightCm: undefined,
      weightKg: undefined,
      maritalStatus: "",
      childrenCount: undefined,
      passportIssueDate: "",
      passportIssuePlace: "",
      educationGrade: "",
      educationYear: undefined,
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
        idNumber: existing.idNumber ?? "",
        phone: existing.phone ?? "",
        address: existing.address ?? "",
        religion: existing.religion ?? "",
        heightCm: existing.heightCm ?? undefined,
        weightKg: existing.weightKg ?? undefined,
        maritalStatus: (existing.maritalStatus as (typeof MARITAL_STATUS_OPTIONS)[number] | null) ?? "",
        childrenCount: existing.childrenCount ?? undefined,
        passportIssueDate: existing.passportIssueDate
          ? new Date(existing.passportIssueDate).toISOString().slice(0, 10)
          : "",
        passportIssuePlace: existing.passportIssuePlace ?? "",
        educationGrade: existing.educationGrade ?? "",
        educationYear: existing.educationYear ?? undefined,
      });
    }
  }, [existing, reset]);

  // Blacklist check: per the user's request, whoever is entering a new
  // application should see immediately if this candidate (matched by
  // passport or ID number, since a repeat candidate can resurface under a
  // renewed passport) already has dispute history, and which agent handled
  // it. Debounced on either field, not blocking — see checkBlacklistMatch()
  // in lib/actions/blacklist.ts for why this only warns, never prevents
  // saving.
  const passportNumber = watch("passportNumber");
  const idNumber = watch("idNumber");
  const [blacklistMatches, setBlacklistMatches] = useState<BlacklistMatch[]>([]);
  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!passportNumber?.trim() && !idNumber?.trim()) {
        setBlacklistMatches([]);
        return;
      }
      const res = await checkBlacklistMatch({
        passportNumber,
        idNumber,
        excludeCandidateId: candidateId,
      });
      setBlacklistMatches(res.ok ? res.data : []);
    }, 600);
    return () => clearTimeout(handle);
  }, [passportNumber, idNumber, candidateId]);

  async function onSubmit(values: PersonalDetailsInput) {
    const res = candidateId
      ? await updateCandidatePersonal(candidateId, values)
      : await createCandidateDraft(values, workforceModule);
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
          <Field label="Passport date of issue" error={errors.passportIssueDate?.message}>
            <Input type="date" {...register("passportIssueDate")} />
          </Field>
          <Field label="Passport place of issue">
            <Input {...register("passportIssuePlace")} />
          </Field>
          <Field label="ID number">
            <Input {...register("idNumber")} />
          </Field>
          <Field label="Phone">
            <Input {...register("phone")} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Textarea rows={2} {...register("address")} />
          </Field>
          <Field label="Height (cm)" error={errors.heightCm?.message}>
            <Input type="number" {...register("heightCm", { valueAsNumber: true })} />
          </Field>
          <Field label="Weight (kg)" error={errors.weightKg?.message}>
            <Input type="number" {...register("weightKg", { valueAsNumber: true })} />
          </Field>
          <div className="space-y-2">
            <Label>Marital status</Label>
            <Controller
              control={control}
              name="maritalStatus"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    {MARITAL_STATUS_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Field label="Children (No.)" error={errors.childrenCount?.message}>
            <Input type="number" {...register("childrenCount", { valueAsNumber: true })} />
          </Field>
          <Field label="Educational qualification — Grade">
            <Input {...register("educationGrade")} />
          </Field>
          <Field label="Educational qualification — Year" error={errors.educationYear?.message}>
            <Input type="number" placeholder="e.g. 2015" {...register("educationYear", { valueAsNumber: true })} />
          </Field>

          {blacklistMatches.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              {blacklistMatches.map((m) => (
                <div
                  key={m.candidateId}
                  className="flex items-start gap-2.5 rounded-md border border-critical/40 bg-critical/10 px-3 py-2.5 text-sm"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                  <p>
                    <span className="font-medium text-critical">Blacklist match:</span>{" "}
                    <strong>{m.fullName}</strong> already has {m.disputeCount}{" "}
                    {m.disputeCount === 1 ? "dispute" : "disputes"} on record
                    {m.hasUnresolvedDispute ? " (unresolved)" : ""}, matched by {m.matchedOn === "passport" ? "passport number" : "ID number"}.
                    {m.mostRecentAgentName
                      ? ` Most recently handled by ${m.mostRecentAgentName}.`
                      : " No agent on record for the most recent dispute."}{" "}
                    Check the{" "}
                    <a href="/blacklist" target="_blank" rel="noreferrer" className="underline">
                      Blacklist
                    </a>{" "}
                    before continuing.
                  </p>
                </div>
              ))}
            </div>
          )}

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
  skillOptions,
  onBack,
  onDone,
}: {
  candidateId: string;
  existing?: CandidateDetail;
  skillOptions: string[];
  onBack: () => void;
  onDone: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ExperienceSkillsInput>({
    resolver: zodResolver(experienceSkillsSchema),
    defaultValues: {
      category: "FIRST_TIMER",
      skills: [],
      languages: [],
      yearsExperience: 0,
      contractDuration: 24,
      workHistory: [],
    },
  });

  const { fields: workFields, append: appendWork, remove: removeWork } = useFieldArray({
    control,
    name: "workHistory",
  });

  useEffect(() => {
    if (existing) {
      reset({
        category: existing.category,
        skills: existing.skills,
        languages: existing.languages,
        yearsExperience: existing.yearsExperience,
        contractDuration: existing.contractDuration,
        workHistory: existing.workHistory.map((w) => ({
          id: w.id,
          country: w.country,
          role: w.role ?? "",
          years: w.years,
        })),
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

          <CheckboxGroup control={control} name="skills" label="Skills" options={skillOptions} />
          <CheckboxGroup control={control} name="languages" label="Languages" options={LANGUAGE_OPTIONS} />

          <div className="space-y-2">
            <Label>Previous overseas employment</Label>
            <p className="text-xs text-muted-foreground">
              Country and duration of any prior overseas placements. Shows on the CV; left off entirely if empty.
            </p>
            <div className="space-y-2">
              {workFields.map((field, index) => (
                <div key={field.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.2fr_1fr_0.7fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Country</Label>
                    <Input {...register(`workHistory.${index}.country`)} />
                    {errors.workHistory?.[index]?.country && (
                      <p className="text-xs text-destructive">{errors.workHistory[index]?.country?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role (optional)</Label>
                    <Input {...register(`workHistory.${index}.role`)} placeholder="e.g. Housemaid" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Years</Label>
                    <Input
                      type="number"
                      min={0}
                      {...register(`workHistory.${index}.years`, { valueAsNumber: true })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeWork(index)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendWork({ country: "", role: "", years: 0 })}
            >
              + Add prior placement
            </Button>
          </div>

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
