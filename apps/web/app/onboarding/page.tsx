import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { OnboardingForm } from "@/features/auth/components/onboarding-form";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OnboardingPage() {
  const authContext = await getCurrentAuthContext();

  if (!authContext) {
    redirect("/sign-in");
  }

  const { currentFirm } = authContext;

  // If user has no Clerk organization at all
  if (!currentFirm) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Select or Create a Firm Workspace</CardTitle>
            <CardDescription>
              Use the workspace switcher in the header to select an existing firm or create a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Once selected, you’ll complete a quick one-time profile setup.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If they already have a linked Firm in our database → send them to dashboard
  if (currentFirm.id) {
    redirect("/dashboard");
  }

  // Main case: Clerk org exists but no internal Firm record yet.
  // Show a clean onboarding form.
  return (
    <div className="min-h-[calc(100vh-4rem)] pt-16">
      <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Set up your firm profile
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your Clerk workspace is ready. Create your firm profile to begin preparing coordinated estate plans with full control over every document.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{currentFirm.name}</CardTitle>
          <CardDescription>
            This is the name that will appear on all your documents, reports, and client workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm
            clerkOrgId={currentFirm.clerkOrgId}
            name={currentFirm.name}
            slug={currentFirm.slug}
          />

          <p className="mt-4 text-center text-xs text-muted-foreground">
            This securely links your workspace to the Engine. You are the owner and retain full control over all templates, documents, and client data.
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
  );
}
