"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { useFirm } from "../use-firm";
import { createFirmFromClerkOrganization, type CreateFirmResult } from "../server/create-firm-from-clerk";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCallout } from "@/components/ui/callouts";

interface OnboardingFormProps {
  clerkOrgId: string;
  name: string;
  slug?: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Creating your firm profile..." : "Create Firm Profile & Continue"}
    </Button>
  );
}

export function OnboardingForm({ clerkOrgId, name, slug }: OnboardingFormProps) {
  const router = useRouter();
  const { hydrate } = useFirm();

  const [state, formAction] = useActionState<CreateFirmResult | null, FormData>(
    async (_prevState, formData) => {
      return await createFirmFromClerkOrganization(formData);
    },
    null
  );

  // After successful creation, re-hydrate the global store (from the create action response if needed)
  // and navigate to dashboard. The GlobalFirmHydrator + header will pick up the new firm on next load/navigation.
  useEffect(() => {
    if (state && "success" in state && state.success) {
      // The create action already returns the firm profile; hydrate is best-effort here.
      router.push("/dashboard");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="clerkOrgId" value={clerkOrgId} />
      {slug && <input type="hidden" name="slug" value={slug} />}

      <div className="space-y-2">
        <Label htmlFor="firm-name">Firm name</Label>
        <Input
          id="firm-name"
          name="name"
          defaultValue={name}
          required
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          You can update this anytime in Firm Settings. It becomes the default across your templates and client matters.
        </p>
      </div>

      {state && "error" in state && (
        <ErrorCallout role="alert">{state.error}</ErrorCallout>
      )}

      <SubmitButton />
    </form>
  );
}
