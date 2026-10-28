"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Demo logins: real seeded accounts, shown openly rather than left for a
// prospect to guess at. "Try the demo" fills the form (doesn't auto-submit
// - the person should see what they're about to sign in as, same reason
// a real login form never auto-submits). The agent demo reuses one of the
// existing dummy foreign-agency accounts rather than a dedicated throwaway
// one - it's already real, clean demo data, not a reason to add a 7th
// agency.
const DEMO_LOGINS = [
  { role: "Admin", username: "admin", password: "ChangeMe-Admin-1!", blurb: "Full access: candidates, agents, invoices, staff." },
  { role: "Staff", username: "staff1", password: "ChangeMe-Staff-1!", blurb: "Permission-gated day-to-day operations." },
  { role: "Agent", username: "boom", password: "DemoAgent-2026!", blurb: "Cedar Link Overseas — the mobile-first Agent Portal." },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  function fillDemo(username: string, password: string) {
    setValue("username", username);
    setValue("password", password);
  }

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    // The exact same loginSchema already validated this client-side; the
    // server re-validates it independently rather than trusting this pass.
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json();
    if (!data.ok) {
      setServerError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel — the mark's own gradient, its pillar form echoed
          faintly in the background. Hidden below lg: the form is what
          matters on a phone, not the scenery. */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#1c4a56] via-[#20525f] to-[#2b6f80] p-12 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-end justify-center gap-6 opacity-[0.14]">
          <div className="h-[38%] w-14 rounded-t-md bg-gradient-to-t from-transparent to-white" />
          <div className="h-[62%] w-14 rounded-t-md bg-gradient-to-t from-transparent to-white" />
          <div className="h-[38%] w-14 rounded-t-md bg-gradient-to-t from-transparent to-white" />
        </div>

        <Image src="/logo.png" alt="" width={132} height={91} priority className="relative brightness-0 invert" />

        <div className="relative space-y-3 text-white">
          <p className="max-w-md font-heading text-2xl font-semibold leading-snug text-balance">
            One record, from placement to contract close.
          </p>
          <p className="max-w-sm text-sm text-white/70">
            Candidate profiles, visa pipeline, and agent placements, tracked in one place instead
            of a folder of spreadsheets.
          </p>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
        <Image
          src="/logo.png"
          alt="Topway Private Limited"
          width={112}
          height={77}
          priority
          className="lg:hidden"
        />

        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center lg:text-left">
            <h1 className="font-heading text-xl font-semibold">Sign in</h1>
            <p className="text-sm text-muted-foreground">Enter your Topway credentials to continue.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                aria-invalid={!!errors.username}
                {...register("username")}
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            {serverError && (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium">Just want to look around?</p>
            <p className="text-xs text-muted-foreground">
              These are real, live demo accounts — pick one to fill the form above.
            </p>
            <div className="space-y-1.5 pt-1">
              {DEMO_LOGINS.map((d) => (
                <button
                  key={d.username}
                  type="button"
                  onClick={() => fillDemo(d.username, d.password)}
                  className="flex w-full items-start justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{d.role}</span>
                    <span className="block text-muted-foreground">{d.blurb}</span>
                  </span>
                  <span className="shrink-0 self-center font-mono text-[10px] text-muted-foreground">
                    {d.username}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Topway Private Limited — Recruitment Operations Platform</p>
      </div>
    </div>
  );
}
