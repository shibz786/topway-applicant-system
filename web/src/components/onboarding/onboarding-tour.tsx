"use client";

import { useState } from "react";
import { markOnboardingSeen } from "@/lib/actions/onboarding";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import type { SessionUser } from "@/lib/auth/session";

type Slide = { title: string; body: React.ReactNode; cta?: { label: string; href: string } };

function slidesFor(user: SessionUser): Slide[] {
  const isAgent = user.role === "AGENT";

  const slides: Slide[] = [
    {
      title: `Welcome, ${user.name.split(" ")[0]}`,
      body: (
        <p>
          A quick look at where things live before you dive in. Four stops, then you&apos;re on
          your own — this won&apos;t show again.
        </p>
      ),
    },
    isAgent
      ? {
          title: "My Applications & Databank",
          body: (
            <p>
              <strong>My Applications</strong> is every candidate currently placed with your
              agency. If you have databank access, <strong>Databank</strong> lists candidates
              available for assignment — requesting one just notifies Topway staff, it&apos;s not
              self-service.
            </p>
          ),
        }
      : {
          title: "Candidates, in 4 workforce categories",
          body: (
            <p>
              <strong>Candidates</strong> and the new <strong>Applications</strong> view both cover
              all four: Domestic, General, Skilled &amp; Technical, and Professional Workforce.
              Domestic and General generate a CV; Skilled and Professional store the candidate&apos;s
              own CV and certificates instead.
            </p>
          ),
        },
    {
      title: "The Blacklist",
      body: (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-critical">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="font-medium">This is the one page worth knowing by heart.</span>
          </div>
          <p>
            Every candidate with a recorded dispute shows here, with which agency handled them at
            the time — shared across every company on the platform, so a problem with one
            placement doesn&apos;t repeat with another. Check it before onboarding a candidate you
            don&apos;t recognize.
          </p>
        </div>
      ),
      cta: { label: "Open the Blacklist", href: "/blacklist" },
    },
    {
      title: "Settings",
      body: (
        <p>
          Change your password any time, and — for staff and agents — set the default logo (or
          company name, or nothing) that prints on generated CVs.
        </p>
      ),
      cta: { label: "Go to Settings", href: "/settings" },
    },
  ];

  return slides;
}

export function OnboardingTour({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const slides = slidesFor(user);
  const isLast = step === slides.length - 1;

  // Setting `open` false here ALSO fires Radix's own onOpenChange below
  // (it reacts to the prop change, not just external close triggers) - so
  // this is the one place that actually marks the tour seen and navigates;
  // onOpenChange only needs to keep `open` in sync for closes it initiates
  // itself (Escape, outside click, the X), never call this again itself.
  //
  // Navigation uses window.location, not next/navigation's router -
  // markOnboardingSeen() is a Server Action, and a Server Action triggers
  // Next's own implicit refresh of the CURRENT route once it resolves.
  // That refresh can race a client-side router.push() called right after
  // it (even with the push issued first) and win, silently stranding the
  // user back where they started. Confirmed live, repeatedly: reordering
  // the calls and removing the await both failed to fix it - only a real
  // full-page navigation sidesteps the race entirely, since it isn't
  // subject to the SPA router's own pending-navigation state at all.
  //
  // markOnboardingSeen() IS awaited before that navigation, deliberately -
  // a fire-and-forget call here loses the race against window.location's
  // own page teardown (confirmed live: the write got silently cancelled
  // mid-flight, so the tour kept coming back on every login). The brief
  // wait before the page unloads is the correct tradeoff for a write that
  // actually needs to land.
  async function dismiss(navigateTo?: string) {
    setOpen(false);
    await markOnboardingSeen();
    if (navigateTo) window.location.href = navigateTo;
  }

  const slide = slides[step]!;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && open && dismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{slide.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="pt-1 text-sm text-foreground">{slide.body}</div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-1">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-5 rounded-full ${i === step ? "bg-primary" : "bg-muted"}`}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => dismiss()}>
              Skip
            </Button>
            {slide.cta && (
              <Button variant="outline" size="sm" onClick={() => dismiss(slide.cta!.href)}>
                {slide.cta.label}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
