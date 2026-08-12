"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { inviteClient, type InviteClientResult } from "../server/invite-client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCallout, SuccessCallout } from "@/components/ui/callouts";
import { toast } from "sonner";

/**
 * Client Component: InviteClientForm
 *
 * Minimal, accessible form for owners/staff to invite a client.
 * Uses React Hook Form + Zod (as specified).
 * Calls the secure `inviteClient` Server Action.
 *
 * Shows success message + (in dev/sandbox) the magic link for immediate testing.
 * Wrapped by <RoleGuard allowed={OWNER_STAFF}> at the call site.
 *
 * Security: The real enforcement is inside the Server Action via checkOwnerOrStaff + getCurrentAuthContext.
 * This component is purely presentational / UX.
 */

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
});

export type InviteFormData = z.infer<typeof inviteSchema>;

export function InviteClientForm() {
  const [result, setResult] = useState<InviteClientResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
    },
  });

  async function onSubmit(data: InviteFormData) {
    setIsSubmitting(true);
    setResult(null);

    try {
      // Direct call to Server Action (works seamlessly from Client Components in Next.js)
      const response = await inviteClient(data);
      setResult(response);

      if ("success" in response && response.success) {
        toast.success("Client invitation sent successfully.");
        // Keep the form filled in case they want to send another, or reset for UX:
        // reset(); // commented — many attorneys send several in a row
      }
    } catch (err) {
      setResult({ error: "Unexpected error sending invitation. Please try again." });
      console.error("[InviteClientForm] submit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name (optional)</Label>
            <Input
              id="firstName"
              placeholder="Jane"
              {...register("firstName")}
              disabled={isSubmitting}
            />
            {errors.firstName && (
              <p className="text-xs text-destructive">{errors.firstName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last name (optional)</Label>
            <Input
              id="lastName"
              placeholder="Doe"
              {...register("lastName")}
              disabled={isSubmitting}
            />
            {errors.lastName && (
              <p className="text-xs text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Client email address *</Label>
          <Input
            id="email"
            type="email"
            placeholder="client@example.com"
            required
            {...register("email")}
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            A magic link will be sent to this address. It expires in 7 days and is single-use.
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Sending invitation..." : "Send Client Invitation"}
        </Button>
      </form>

      {/* Result / Feedback - standardized via Wave B callouts */}
      {result && "error" in result && (
        <ErrorCallout role="alert">{result.error}</ErrorCallout>
      )}

      {result && "success" in result && (
        <SuccessCallout role="status" className="p-4">
          {/* Rich success content preserved (devLink etc.); base styling from callout */}
          <p className="font-medium text-emerald-800 dark:text-emerald-200">
            {result.message}
          </p>
          {result.devLink && (
            <div className="mt-3 border-t border-emerald-200 pt-3 dark:border-emerald-900/60">
              <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Development / sandbox only — magic link
              </p>
              <a
                href={result.devLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all font-mono text-xs text-emerald-700 underline hover:no-underline dark:text-emerald-300"
              >
                {result.devLink}
              </a>
              <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                (In production this link is delivered only via the Resend email.)
              </p>
            </div>
          )}
        </SuccessCallout>
      )}
    </div>
  );
}
