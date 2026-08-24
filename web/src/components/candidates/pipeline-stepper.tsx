"use client";

import { useState } from "react";
import { PIPELINE_STEPS, type PipelineStepKey } from "@/lib/business/tracking";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TrackingDates = Partial<Record<PipelineStepKey, Date | string | null>>;

// Horizontal stepper — completed stages filled, current stage highlighted,
// upcoming stages outlined. Clicking a completed-or-current stage opens an
// inline date picker (CLAUDE.md UI requirement). Read-only for agents (no
// onSetDate handler passed = no click affordance at all, not just disabled
// buttons — matches "Pipeline stages are read-only for agents").
export function PipelineStepper({
  tracking,
  onSetDate,
}: {
  tracking: TrackingDates;
  onSetDate?: (step: PipelineStepKey, date: string | null) => void;
}) {
  const dateFor = (key: PipelineStepKey): Date | null => {
    const v = tracking[key];
    if (!v) return null;
    return v instanceof Date ? v : new Date(v);
  };

  const firstIncompleteIndex = PIPELINE_STEPS.findIndex((s) => !dateFor(s.key));

  return (
    <div className="flex w-full items-center gap-0 overflow-x-auto py-2">
      {PIPELINE_STEPS.map((step, i) => {
        const date = dateFor(step.key);
        const isCompleted = !!date;
        const isCurrent = !isCompleted && i === firstIncompleteIndex;
        const clickable = !!onSetDate && (isCompleted || isCurrent);

        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <StepBubble
              label={step.label}
              date={date}
              isCompleted={isCompleted}
              isCurrent={isCurrent}
              clickable={clickable}
              onSetDate={onSetDate ? (d) => onSetDate(step.key, d) : undefined}
            />
            {i < PIPELINE_STEPS.length - 1 && (
              <div className={cn("mx-1 h-0.5 flex-1 rounded", isCompleted ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepBubble({
  label,
  date,
  isCompleted,
  isCurrent,
  clickable,
  onSetDate,
}: {
  label: string;
  date: Date | null;
  isCompleted: boolean;
  isCurrent: boolean;
  clickable: boolean;
  onSetDate?: (date: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const bubble = (
    <div className="flex flex-col items-center gap-1 whitespace-nowrap px-1">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
          isCompleted && "border-primary bg-primary text-primary-foreground",
          isCurrent && !isCompleted && "border-primary bg-background text-primary",
          !isCompleted && !isCurrent && "border-border bg-background text-muted-foreground",
          clickable && "cursor-pointer hover:opacity-80",
        )}
      >
        {isCompleted ? "✓" : ""}
      </div>
      <span className={cn("text-xs", isCompleted || isCurrent ? "font-medium" : "text-muted-foreground")}>
        {label}
      </span>
      {date && <span className="text-[10px] text-muted-foreground">{date.toLocaleDateString()}</span>}
    </div>
  );

  if (!clickable) return bubble;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button">{bubble}</button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => {
            onSetDate?.(d ? d.toISOString().slice(0, 10) : null);
            setOpen(false);
          }}
        />
        {date && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onSetDate?.(null);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
