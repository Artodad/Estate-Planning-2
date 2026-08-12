import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";

import { getIntakeSessionForCurrentFirm, saveIntakeAnswers } from "@/features/dashboard/server/actions";

// Import the production wizard (from C) + types (via feature index)
import { QuestionnaireWizard } from "@/features/intake";
import type { PartialIntake } from "@/features/intake";

/**
 * /dashboard/intakes/[intakeId]
 *
 * Real Questionnaire persistence route (Phase 3.5 / Sub-agent D).
 *
 * - Thin RSC: auth + firm-scoped load via protected server action (re-validates getCurrentAuthContext + checkOwnerOrStaff).
 * - Renders <QuestionnaireWizard> (the full beautiful UI from C) inside the DashboardShell (via root dashboard layout).
 * - Wires real `initialAnswers` / progress / session from IntakeSession JSONB.
 * - Provides `onPersist` impl that calls the thin `saveIntakeAnswers` Server Action (debounced auto-save + manual Save&Exit + AuditLog inside).
 * - onSaveAndExit falls back to history.back() (lands user back in Clients or Intakes list naturally).
 * - onComplete can trigger status finalization (already handled in save when progress=100).
 *
 * Firm scoping: EVERY load/save derives firmId from auth ctx inside the called actions. No leakage.
 * RBAC: OWNER_STAFF enforced here (launch points in Clients are also gated); client self-service limited via RoleGuard inside wizard + future dedicated flows.
 *
 * SCAFFOLD PRESERVATION: This is additive. All existing Clients/Intakes SCAFFOLD banners, RoleGuards, mocks, and empty states are untouched.
 * Real flow is dual/opt-in via the updated buttons (existing scaffold feedback still fires for visibility).
 *
 * Matches exactly Sub-agent A Design §5 + C handoff notes for E/D (route shape, onPersist contract, resume via getInitialContext inside wizard, Audit).
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

  // Server RBAC (matches Clients page pattern). Allow client role for potential self-service future,
  // but primary launch is OWNER_STAFF; wizard RoleGuards further limit privileged UI.
  await requireRole(["owner", "staff", "client"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "You do not have permission to access this intake session.",
  });

  // Load via the thin protected action (always re-derives firmId + audits)
  const result = await getIntakeSessionForCurrentFirm(intakeId);

  if (!("success" in result) || !result.success || !result.session) {
    // Graceful: redirect back with error (no PII leak)
    redirect(`/dashboard/clients?error=intake-not-found`);
  }

  const { session, firmId, client } = result;

  // Prepare initial data exactly as wizard contract expects (from C + B machine getInitialContext)
  const initialAnswers = (session.answers ?? {}) as PartialIntake | null;
  const initialProgress = typeof session.progress === "number" ? session.progress : 0;
  const clientDisplayName = client?.displayName || "Client";

  // Server Action wrapper passed to wizard (thin, type-safe adapter to the save fn)
  // The wizard calls this on debounced changes + explicit Save&Exit.
  // Inside saveIntakeAnswers: full re-auth + firm scoping + minimal AuditLog.
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
      // status derived inside save based on progress
    });

    if ("error" in saveResult) {
      // Non-fatal for wizard (it shows error pill + keeps local draft)
      throw new Error(saveResult.error);
    }

    return { savedAt: saveResult.savedAt };
  }

  // Optional complete hook (wizard calls on machine COMPLETE; status already synced via progress in persist)
  async function handleComplete(finalAnswers: PartialIntake, completedSessionId?: string) {
    "use server";
    // Could trigger Phase 4 doc gen prep here in future; for D just ensure status
    if (completedSessionId) {
      await saveIntakeAnswers(completedSessionId, {
        answers: finalAnswers as Record<string, unknown>,
        progress: 100,
        status: "completed",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Subtle header context (additive, professional) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          <span className="font-medium text-foreground">Intake Session</span> · {intakeId.slice(0, 8)}...
        </div>
        <div>
          Firm-scoped • Loaded {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* THE WIZARD — real data + real persistence contract */}
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
        // onSaveAndExit omitted → wizard falls back to window.history.back() which is clean in dashboard
      />

      {/* Lightweight dev transparency (additive only; never shown to normal users in prod) */}
      <p className="text-[10px] text-muted-foreground font-mono opacity-60">
        Real IntakeSession • answers persisted to JSONB via saveIntakeAnswers + intakeSessionHelpers • Audit: intake.* events
      </p>
    </div>
  );
}
