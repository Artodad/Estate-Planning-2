import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";

import { getIntakeSessionForCurrentFirm, saveIntakeAnswers } from "@/features/dashboard/server/actions";
import { GenerateTrustDraftButton } from "@/features/dashboard/components/GenerateTrustDraftButton";
import { trustDraftFromStoredDocuments } from "@/features/dashboard/components/stored-trust-draft";
import { generatedDocumentHelpers } from "@/lib/prisma";

import { QuestionnaireWizard } from "@/features/intake";
import type { PartialIntake } from "@/features/intake";

function formatIntakeStatus(status: string | null | undefined): string {
  const key = (status ?? "").toLowerCase();
  if (key === "in_progress") return "In progress";
  if (key === "completed") return "Complete";
  if (key === "paused") return "Paused";
  if (key === "not_started") return "Not started";
  if (!status) return "In progress";
  return status.replace(/_/g, " ");
}

/**
 * /dashboard/intakes/[intakeId]
 *
 * Thin RSC: auth + firm-scoped load via protected server action.
 * Renders the questionnaire, then the Trust draft generate step.
 * Persistence contract: handlePersist + handleComplete call saveIntakeAnswers.
 */
export default async function IntakeWizardPage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;

  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole(["owner", "staff", "client"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "You do not have permission to access this intake session.",
  });

  const result = await getIntakeSessionForCurrentFirm(intakeId);

  if (!("success" in result) || !result.success || !result.session) {
    redirect(`/dashboard/clients?error=intake-not-found`);
  }

  const { session, firmId, client } = result;
  const storedTrustDraft = trustDraftFromStoredDocuments(
    await generatedDocumentHelpers.listByIntakeForFirm(session.id, firmId),
  );

  const initialAnswers = (session.answers ?? {}) as PartialIntake | null;
  const initialProgress = typeof session.progress === "number" ? session.progress : 0;
  const clientDisplayName = client?.displayName || "Client";

  async function handlePersist(payload: {
    answers: PartialIntake;
    progress: number;
    section?: string;
    sessionId?: string;
    firmId: string;
    clientId: string;
  }) {
    "use server";

    const saveResult = await saveIntakeAnswers(session.id, {
      answers: payload.answers as Record<string, unknown>,
      progress: payload.progress,
      section: payload.section,
    });

    if ("error" in saveResult) {
      throw new Error(saveResult.error);
    }

    return { savedAt: saveResult.savedAt };
  }

  async function handleComplete(finalAnswers: PartialIntake, completedSessionId?: string) {
    "use server";
    if (completedSessionId) {
      await saveIntakeAnswers(completedSessionId, {
        answers: finalAnswers as Record<string, unknown>,
        progress: 100,
        status: "completed",
      });
    }
  }

  return (
    <div className="space-y-8">
      <header className="border-b pb-5">
        <Link
          href="/dashboard/intakes"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← All intakes
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {clientDisplayName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Intake · {formatIntakeStatus(session.status)} · {initialProgress}% complete
            </p>
          </div>
        </div>
      </header>

      <QuestionnaireWizard
        clientId={session.clientId}
        firmId={firmId}
        sessionId={session.id}
        initialAnswers={initialAnswers}
        initialProgress={initialProgress}
        initialCurrentSection={session.status === "completed" ? "review" : undefined}
        clientDisplayName={clientDisplayName}
        onPersist={handlePersist}
        onComplete={handleComplete}
      />

      <GenerateTrustDraftButton intakeId={session.id} initialDraft={storedTrustDraft} />
    </div>
  );
}
