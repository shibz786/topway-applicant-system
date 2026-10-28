"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changeOwnPassword } from "@/lib/actions/account";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/account";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A2 bug fix: there was no self-service "change/reset my password" UI
// anywhere - every role reaches this (ADMIN, STAFF, AGENT), same "self-
// service regardless of role" precedent as MySessionsCard.
export function ChangePasswordCard() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ChangePasswordInput) {
    const res = await changeOwnPassword(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Password changed. You've been signed out of every other device.");
    reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Changing your password signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-sm gap-4" noValidate>
          <div className="space-y-2">
            <Label>Current password</Label>
            <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
            {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" autoComplete="new-password" {...register("newPassword")} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Confirm new password</Label>
            <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Changing…" : "Change Password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
