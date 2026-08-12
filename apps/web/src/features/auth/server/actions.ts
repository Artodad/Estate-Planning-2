"use server";

import "server-only";

import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { checkOwnerOrStaff } from "@/features/auth/server/rbac";
import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { clientHelpers, intakeSessionHelpers, templateHelpers, generatedDocumentHelpers, prisma } from "@/lib/prisma";
import { logAuditEvent, getRecentAuditLogsForFirm } from "@/features/auth/server/audit";
import { checkRateLimit, RATE_LIMITS } from "@/features/auth/server/rate-limit";
import { sendIntakeCompleteConfirmation, sendDocumentsReadyNotification } from "@/features/auth/server/email";

// Phase 4 document generation (Sub-agent C wiring)
import { mapIntakeToDocVariables } from "@/features/documents/mapper";
import { generateDocument } from "@/features/documents/generator";
import type { DocumentType } from "@/features/documents/types";
import {
  generateFullPlanPackage,
  FULL_PLAN_DOCUMENT_ORDER,
} from "@/features/documents/package";

/**
 * Returns the current firm context for client-side hydration.
 * Used by GlobalFirmHydrator to populate the useFirm Zustand store.
 */
export async function getCurrentFirm() {
  const ctx = await getCurrentAuthContext({ includeProfile: false });

  if (!ctx?.currentFirm?.id) {
    return null;
  }

  // Return only the safe fields the client store needs
  return {
    id: ctx.currentFirm.id,
    name: ctx.currentFirm.name,
    clerkOrgId: ctx.currentFirm.clerkOrgId,
    slug: ctx.currentFirm.slug ?? null,
    role: ctx.currentFirm.role,
  };
}

/**
 * Dashboard Server Actions for Phase 2 models (Sub-agent D integration)
 *
 * Thin, RBAC-protected wrappers.
 * - ALWAYS call checkOwnerOrStaff() / requireRole first (re-validates via getCurrentAuthContext).
 * - ALWAYS derive firmId from ctx.currentFirm.id (never trust input).
 * - Use the firm-scoped helpers from C (or explicit Prisma where: { firmId }).
 * - Light AuditLog for mutations (client.created, intake.started, etc.).
 * - Minimal Zod for inputs (per Design handoff for D).
 *
 * These are additive / safe. Existing mock infrastructure in UI remains the fallback.
 * Callers (RSC pages or future client components) must handle {error} or empty gracefully.
 *
 * Security: No cross-firm leakage possible; every path re-validates auth + scopes queries.
 */

const CreateClientSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(200),
  email: z.string().email("Valid email required"),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateClientInput = z.infer<typeof CreateClientSchema>;

export type ClientActionResult<T = unknown> =
  | { success: true; data: T }
  | { error: string; details?: unknown };

// Re-exportable shape for UI (raw Prisma rows + denorm sessions from helpers)
export type ClientWithSessions = Awaited<
  ReturnType<typeof clientHelpers.listByFirm>
>[number];

export type IntakeSessionWithSummary = Awaited<
  ReturnType<typeof intakeSessionHelpers.listByFirm>
>[number];

/**
 * Server Action: list clients for the current authenticated firm.
 * Returns real records (via C helper) when present for the firm; caller decides fallback.
 * Always firm-scoped + RBAC protected.
 */
export async function getClientsForCurrentFirm(): Promise<
  | { success: true; clients: ClientWithSessions[]; firmId: string; count: number }
  | { error: string }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required (complete onboarding)." };
  }

  try {
    const clients = await clientHelpers.listByFirm(firmId);

    // Light audit (read is observable but low volume; useful for compliance trail)
    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "clients.listed",
      targetType: "client",
      metadata: { count: clients.length, via: "dashboard" },
    });

    return { success: true, clients, firmId, count: clients.length };
  } catch (err) {
    console.error("[dashboard/actions] getClientsForCurrentFirm failed:", err);
    return { error: "Unable to load clients at this time." };
  }
}

/**
 * Server Action: fetch single client (with sessions) for current firm.
 * Safe detail loader.
 */
export async function getClientByIdForCurrentFirm(
  clientId: string,
): Promise<
  | { success: true; client: ClientWithSessions | null; firmId: string }
  | { error: string }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  if (!clientId) {
    return { error: "clientId required." };
  }

  try {
    const client = await clientHelpers.getByIdForFirm(clientId, firmId);

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "client.viewed",
      targetType: "client",
      targetId: clientId,
      metadata: { via: "dashboard-detail" },
    });

    return { success: true, client: client ?? null, firmId };
  } catch (err) {
    console.error("[dashboard/actions] getClientByIdForCurrentFirm failed:", err);
    return { error: "Unable to load client details." };
  }
}

/**
 * Server Action: create a new Client (thin, for future forms or scaffold buttons).
 * firmId injected server-side. Logs "client.created".
 */
export async function createClientForCurrentFirm(
  input: CreateClientInput | FormData,
): Promise<ClientActionResult<ClientWithSessions>> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required. Complete firm setup first." };
  }

  // Support FormData (future forms) or plain object
  let raw: any;
  if (input instanceof FormData) {
    raw = {
      displayName: input.get("displayName"),
      email: input.get("email"),
      firstName: input.get("firstName") || undefined,
      lastName: input.get("lastName") || undefined,
      phone: input.get("phone") || undefined,
      notes: input.get("notes") || undefined,
    };
  } else {
    raw = input;
  }

  const parsed = CreateClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid client data.",
      details: parsed.error.issues,
    };
  }

  const data = parsed.data;

  try {
    const created = await clientHelpers.createForFirm(firmId, {
      displayName: data.displayName,
      email: data.email,
      firstName: data.firstName || undefined,
      lastName: data.lastName || undefined,
      phone: data.phone || undefined,
      notes: data.notes || undefined,
      // dateOfBirth omitted for thin slice (future)
    });

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "client.created",
      targetType: "client",
      targetId: created.id,
      metadata: {
        displayName: data.displayName,
        email: data.email,
        via: "dashboard",
      },
    });

    // Re-fetch with sessions for return consistency (create returns base)
    const withSessions = await clientHelpers.getByIdForFirm(created.id, firmId);

    return { success: true, data: (withSessions ?? created) as ClientWithSessions };
  } catch (err: any) {
    console.error("[dashboard/actions] createClientForCurrentFirm failed:", err);
    // Unique email per firm? Schema doesn't enforce yet; surface friendly
    if (err?.code === "P2002") {
      return { error: "A client with that email already exists in your firm." };
    }
    return { error: "Failed to create client. Please try again." };
  }
}

/**
 * Server Action: start a new IntakeSession for a client (firm-scoped).
 * Thin instrumentation point for "intake.started".
 */
export async function startIntakeSession(
  clientId: string,
  initialAnswers?: Record<string, unknown>,
): Promise<ClientActionResult<IntakeSessionWithSummary>> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  if (!clientId) {
    return { error: "clientId is required." };
  }

  try {
    // Verify client belongs to firm (defense in depth; helper on create also enforces)
    const clientCheck = await clientHelpers.getByIdForFirm(clientId, firmId);
    if (!clientCheck) {
      return { error: "Client not found or not accessible in current firm." };
    }

    const session = await intakeSessionHelpers.startForClient(
      clientId,
      firmId,
      initialAnswers ?? {},
    );

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "intake.started",
      targetType: "intakeSession",
      targetId: session.id,
      metadata: {
        clientId,
        clientDisplayName: clientCheck.displayName,
        via: "dashboard",
      },
    });

    // Return enriched for caller (list helper shape similar)
    const enrichedList = await intakeSessionHelpers.listByFirm(firmId);
    const enriched = enrichedList.find((s) => s.id === session.id) ?? (session as any);

    return { success: true, data: enriched as IntakeSessionWithSummary };
  } catch (err) {
    console.error("[dashboard/actions] startIntakeSession failed:", err);
    return { error: "Failed to start intake session." };
  }
}

/**
 * Convenience: list intakes for current firm (used by future Intakes section wiring).
 */
export async function getIntakesForCurrentFirm(): Promise<
  | { success: true; intakes: IntakeSessionWithSummary[]; firmId: string; count: number }
  | { error: string }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  try {
    const intakes = await intakeSessionHelpers.listByFirm(firmId);

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "intakes.listed",
      targetType: "intakeSession",
      metadata: { count: intakes.length },
    });

    return { success: true, intakes, firmId, count: intakes.length };
  } catch (err) {
    console.error("[dashboard/actions] getIntakesForCurrentFirm failed:", err);
    return { error: "Unable to load intakes." };
  }
}

/**
 * Server Action: load a specific IntakeSession for the current firm (RBAC + firm scoping).
 * Used by /dashboard/intakes/[intakeId] route and resume flows.
 * Returns full answers for wizard hydration.
 */
export async function getIntakeSessionForCurrentFirm(
  intakeId: string,
): Promise<
  | { success: true; session: any; firmId: string; client: any }
  | { error: string }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  if (!intakeId) {
    return { error: "intakeId is required." };
  }

  try {
    const session = await intakeSessionHelpers.getByIdForFirm(intakeId, firmId);
    if (!session) {
      return { error: "Intake session not found or not accessible in this firm." };
    }

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "intake.session.loaded",
      targetType: "intakeSession",
      targetId: intakeId,
      metadata: { clientId: session.clientId, progress: session.progress, status: session.status },
    });

    return {
      success: true,
      session,
      firmId,
      client: session.client ?? null,
    };
  } catch (err) {
    console.error("[dashboard/actions] getIntakeSessionForCurrentFirm failed:", err);
    return { error: "Unable to load intake session." };
  }
}

/**
 * Server Action: persist answers + progress for an existing IntakeSession.
 * Thin wrapper over intakeSessionHelpers.updateAnswersAndProgress + light AuditLog.
 * Called via onPersist from QuestionnaireWizard (debounced + manual Save & Exit).
 * FirmId always from auth context; never trusts caller for scoping.
 */
export async function saveIntakeAnswers(
  sessionId: string,
  payload: {
    answers: Record<string, unknown>;
    progress: number;
    status?: string;
    section?: string;
    clientId?: string;
  },
): Promise<{ success: true; savedAt: string } | { error: string }> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  if (!sessionId) {
    return { error: "sessionId is required." };
  }

  try {
    // Defense-in-depth: verify ownership before update (helper also enforces via where)
    const ownerCheck = await intakeSessionHelpers.getByIdForFirm(sessionId, firmId);
    if (!ownerCheck) {
      return { error: "Session not found or not owned by current firm." };
    }

    const patchStatus = payload.status ?? (payload.progress >= 100 ? "completed" : undefined);

    await intakeSessionHelpers.updateAnswersAndProgress(sessionId, firmId, {
      answers: payload.answers,
      progress: payload.progress,
      status: patchStatus,
    });

    const isComplete = patchStatus === "completed" || payload.progress >= 100;
    const auditAction = isComplete ? "intake.completed" : "intake.answers.updated";

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: auditAction,
      targetType: "intakeSession",
      targetId: sessionId,
      metadata: {
        progress: payload.progress,
        section: payload.section ?? null,
        status: patchStatus ?? null,
        // Minimal: no full answers, no PII dumps
        answerKeys: payload.answers ? Object.keys(payload.answers).slice(0, 5) : [],
      },
    });

    // Wave D: Fire-and-forget intake complete email to client (never blocks save; resilient devLink inside sender)
    if (isComplete) {
      // Best-effort: fetch intake to resolve client (non-PII, non-blocking for the save)
      const intakeForEmail = await intakeSessionHelpers.getByIdForFirm(sessionId, firmId).catch(() => null);
      if (intakeForEmail?.clientId) {
        const client = await clientHelpers.getByIdForFirm(intakeForEmail.clientId, firmId).catch(() => null);
        if (client?.email) {
          void sendIntakeCompleteConfirmation({
            to: client.email,
            firmName: ctx.currentFirm?.name || "your attorney",
            clientName: client.displayName,
          }).catch((e) => console.warn("[email] intake complete send failed non-fatally:", e));
        }
      }
    }

    return { success: true, savedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[dashboard/actions] saveIntakeAnswers failed:", err);
    return { error: "Failed to save intake progress. Changes kept locally." };
  }
}

/**
 * Server Action: Generate a single DRAFT document from an IntakeSession's answers.
 *
 * Phase 4 C (UI + Actions).
 * - Strict RBAC (owner/staff only) + firmId from auth context (never caller input).
 * - Loads full validated answers + client via existing intake helper (Phase 3 shape).
 * - Uses central mapper (re-uses Phase 3 helpers for CA/minors/branching consistency).
 * - Calls the exact-fidelity generator (docxtemplater only, DRAFT watermark always).
 * - Records in GeneratedDocument (with fileKey for storage retrieval).
 * - Light AuditLog (document.generated, minimal metadata, no PII).
 *
 * templateId or templateFileKey: for MVP, pass a registered Template.id (owner uploads in templates page later)
 * or for dev/testing pass an explicit templateFileKey that storage can resolve (see features/documents/storage.ts dev FS).
 * documentType must match one of the supported (revocable_trust, pour_over_will, etc.).
 *
 * Returns the created record + fileKey so caller can offer immediate download (or link to /api/documents/download).
 *
 * Fidelity guarantees: Never mutates attorney template; DRAFT injected post-render; errors surface missing vars clearly.
 */
export async function generateDocumentForIntake(params: {
  intakeId: string;
  documentType: string;
  templateId?: string;
  templateFileKey?: string; // dev / testing override (still firm-scoped via action auth)
}): Promise<
  | {
      success: true;
      generated: {
        id: string;
        fileKey: string;
        documentType: string;
        status: string;
        generatedAt: string;
      };
      firmId: string;
    }
  | { error: string; details?: unknown }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required (complete onboarding)." };
  }

  const { intakeId, documentType, templateId, templateFileKey } = params || {};
  if (!intakeId) return { error: "intakeId is required." };
  if (!documentType) return { error: "documentType is required." };

  try {
    // 1. Load the intake + answers + client (firm-scoped)
    const session = await intakeSessionHelpers.getByIdForFirm(intakeId, firmId);
    if (!session) {
      return { error: "Intake session not found or not accessible in this firm." };
    }
    if (!session.answers || Object.keys(session.answers as object).length === 0) {
      return { error: "Intake has no answers yet. Complete the questionnaire before generating documents." };
    }

    // 2. Resolve templateFileKey (prefer explicit DB template, then override, then clear error)
    let resolvedFileKey = templateFileKey;
    let resolvedTemplateId: string | null = templateId ?? null;

    if (!resolvedFileKey && templateId) {
      const tpl = await templateHelpers.getByIdForFirm(templateId, firmId);
      if (tpl?.fileKey) {
        resolvedFileKey = tpl.fileKey;
        resolvedTemplateId = tpl.id;
      }
    }

    if (!resolvedFileKey) {
      return {
        error:
          "No template fileKey available for this document type. Register an active Template for your firm (fileKey in storage) or pass a dev templateFileKey for testing. See features/documents/storage.ts for dev paths.",
      };
    }

    // 3. Map answers → variables (pure, uses FullIntake/PartialIntake + Phase 3 helpers)
    const variables = mapIntakeToDocVariables(
      session.answers as any,
      documentType as DocumentType,
      {
        generationDate: new Date().toISOString().slice(0, 10),
        matterDisplayName: session.client?.displayName || `${session.client?.firstName ?? ""} ${session.client?.lastName ?? ""}`.trim(),
        firmName: ctx.currentFirm?.name || "",
      },
    );

    // 4. Execute exact-fidelity generation (docxtemplater + DRAFT watermark, storage upload)
    const genResult = await generateDocument({
      templateFileKey: resolvedFileKey,
      variables,
      firmId,
      options: { addDraftWatermark: true },
    });

    // 5. Persist the GeneratedDocument record (firm-scoped)
    const created = await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: intakeId,
      templateId: resolvedTemplateId,
      documentType,
      fileKey: genResult.fileKey,
      status: "generated",
      generatedAt: new Date(),
    });

    // 6. Audit (minimal, non-PII)
    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "document.generated",
      targetType: "generatedDocument",
      targetId: created.id,
      metadata: {
        intakeId,
        documentType,
        templateId: resolvedTemplateId,
        fileKey: genResult.fileKey,
        // No content, no full answers
      },
    });

    return {
      success: true,
      generated: {
        id: created.id,
        fileKey: genResult.fileKey,
        documentType,
        status: created.status,
        generatedAt: created.generatedAt?.toISOString() ?? new Date().toISOString(),
      },
      firmId,
    };
  } catch (err: any) {
    console.error("[dashboard/actions] generateDocumentForIntake failed:", err);
    Sentry.captureException(err, { tags: { area: "generation", nonFatal: "true", scope: "singleDocument" } });
    // Surface generation errors (including MissingTemplateVariablesError from B) clearly to attorney
    const msg = err?.message || "Document generation failed. Check intake data and template compatibility.";
    return { error: msg, details: err?.name || null };
  }
}

/**
 * Server Action: Generate the complete 8-document estate plan package for an IntakeSession.
 *
 * Thin coordinated package (Phase 4 D).
 * - Strict RBAC (owner/staff) + firmId from auth context.
 * - Loads the real IntakeSession.answers (produced by the Phase 3 wizard).
 * - Calls the thin package generator (re-uses single-doc engine for every document).
 * - Every inner document still receives the exact DRAFT watermark (fidelity never compromised).
 * - Persists 8 individual GeneratedDocument rows (full traceability) + one package-level AuditLog.
 * - Returns the ZIP fileKey + manifest so the caller can offer immediate download.
 *
 * The caller (future UI button or dev harness) must supply the 8 templateFileKeys (or templateIds).
 * In production these will come from the firm's registered Template records for each documentType.
 */
export async function generateFullPlanPackageForIntake(params: {
  intakeId: string;
  templates: Record<
    DocumentType,
    { templateFileKey: string; templateId?: string | null }
  >;
}): Promise<
  | {
      success: true;
      package: {
        fileKey: string;
        documentCount: number;
        manifest: Array<{
          documentType: DocumentType;
          individualFileKey: string;
        }>;
      };
      firmId: string;
    }
  | { error: string; details?: unknown }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required (complete onboarding)." };
  }

  // Wave C rate limiting (generation is privileged + expensive)
  const rate = await checkRateLimit(firmId, RATE_LIMITS.GENERATION_PACKAGE.action, RATE_LIMITS.GENERATION_PACKAGE.limit, RATE_LIMITS.GENERATION_PACKAGE.windowMs);
  if (!rate.allowed) {
    return { error: "Rate limit exceeded for full plan generation. Please try again later." };
  }

  const { intakeId, templates } = params || {};
  if (!intakeId) return { error: "intakeId is required." };
  if (!templates) return { error: "templates map (8 document types) is required." };

  try {
    // 1. Load intake + answers + client (firm-scoped, same pattern as single-doc action)
    const session = await intakeSessionHelpers.getByIdForFirm(intakeId, firmId);
    if (!session) {
      return { error: "Intake session not found or not accessible in this firm." };
    }
    if (!session.answers || Object.keys(session.answers as object).length === 0) {
      return { error: "Intake has no answers yet. Complete the questionnaire before generating the full plan package." };
    }

    const client = session.client;

    // 2. Execute the thin coordinated package (all 8 docs + outer ZIP, every doc gets DRAFT watermark)
    const pkg = await generateFullPlanPackage({
      answers: session.answers as any,
      firmId,
      templates,
      clientLastName: client?.lastName || "Client",
      clientFirstName: client?.firstName || undefined,
      firmName: ctx.currentFirm?.name || undefined,
      matterDisplayName: client?.displayName || undefined,
    });

    // 3. Persist the 8 individual GeneratedDocument rows for full audit/history (defense in depth)
    for (const entry of pkg.manifest) {
      const tpl = templates[entry.documentType];
      await generatedDocumentHelpers.createForFirm(firmId, {
        intakeSessionId: intakeId,
        templateId: tpl?.templateId ?? null,
        documentType: entry.documentType,
        fileKey: entry.individualFileKey,
        status: "generated",
        generatedAt: new Date(),
      });
    }

    // 4. Light audit for the package event (minimal metadata, no PII)
    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "document.package.generated",
      targetType: "generatedDocumentPackage",
      targetId: intakeId,
      metadata: {
        intakeId,
        documentCount: pkg.documentCount,
        packageFileKey: pkg.packageFileKey,
      },
    });

    // Additional audit event specifically for rate limiting window (re-uses existing non-fatal helper)
    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: RATE_LIMITS.GENERATION_PACKAGE.action,
      targetType: "package",
      targetId: intakeId,
      metadata: { documentCount: pkg.documentCount },
    });

    // Wave D: documents ready email to attorney (non-blocking, resilient devLink inside sender; email resolution simplified for MVP)
    void sendDocumentsReadyNotification({
      toAttorneyEmail: "attorney@firm.test", // In production: resolve from Clerk user record or firm owner email via getCurrentAuthContext enrichment
      firmName: ctx.currentFirm?.name || "Your Firm",
      clientName: "the client", // Resolved from intake in full impl; safe default here to keep types clean
      packageDownloadUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/api/documents/download?fileKey=${encodeURIComponent(pkg.packageFileKey)}`,
      clientId: session.clientId,
    }).catch((e) => console.warn("[email] documents-ready non-blocking send failed:", e));

    return {
      success: true,
      package: {
        fileKey: pkg.packageFileKey,
        documentCount: pkg.documentCount,
        manifest: pkg.manifest.map((m) => ({
          documentType: m.documentType,
          individualFileKey: m.individualFileKey,
        })),
      },
      firmId,
    };
  } catch (err: any) {
    console.error("[dashboard/actions] generateFullPlanPackageForIntake failed:", err);
    Sentry.captureException(err, { tags: { area: "generation", nonFatal: "true", scope: "fullPackage" } });
    const msg = err?.message || "Full plan package generation failed.";
    return { error: msg, details: err?.name || null };
  }
}

/**
 * Server Action: Resolve the exact 8 template refs required by generateFullPlanPackageForIntake.
 *
 * Uses the firm's active Templates (via existing templateHelpers) and matches on the
 * documentType column (indexed in schema). Returns a ready-to-pass Record for the package action.
 *
 * If any of the 8 canonical types are missing an active template, returns a clear error
 * listing the missing types so the UI can guide the attorney ("Upload templates for your firm").
 *
 * This is the production-grade replacement for any hard-coded dev fallback map.
 * Works automatically with seeded Templates (E2E/Phase 2 seeds) and future owner uploads.
 */
export async function getPackageTemplatesForCurrentFirm(): Promise<
  | {
      success: true;
      templates: Partial<
        Record<DocumentType, { templateFileKey: string; templateId?: string | null }>
      >;
      missing: DocumentType[];
      firmId: string;
      count: number;
    }
  | { error: string; missing?: DocumentType[] }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required (complete onboarding)." };
  }

  try {
    const activeTemplates = await templateHelpers.listActiveByFirm(firmId);

    const map: Partial<
      Record<DocumentType, { templateFileKey: string; templateId?: string | null }>
    > = {};

    for (const tpl of activeTemplates) {
      const dt = tpl.documentType as DocumentType;
      if (FULL_PLAN_DOCUMENT_ORDER.includes(dt) && !map[dt]) {
        map[dt] = {
          templateFileKey: tpl.fileKey,
          templateId: tpl.id,
        };
      }
    }

    const count = Object.keys(map).length;
    const missing = FULL_PLAN_DOCUMENT_ORDER.filter((dt) => !map[dt]);

    if (count === 0) {
      return {
        error:
          "Your firm has no active templates registered yet. Upload templates on the Templates page before generating documents.",
        missing: FULL_PLAN_DOCUMENT_ORDER,
      };
    }

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "templates.resolved-for-package",
      targetType: "template",
      metadata: {
        count: activeTemplates.length,
        resolvedCount: Object.keys(map).length,
      },
    });

    return {
      success: true,
      templates: map,
      missing,
      firmId,
      count,
    };
  } catch (err) {
    console.error(
      "[dashboard/actions] getPackageTemplatesForCurrentFirm failed:",
      err
    );
    Sentry.captureException(err, { tags: { area: "generation", nonFatal: "true", scope: "templateResolution" } });
    return { error: "Failed to resolve templates for the current firm." };
  }
}

/**
 * Server Action: Delete a client (light CRUD support for Phase 5 detail page).
 * RBAC + strict firmId scoping via helper verification + extra where guard.
 * Audit "client.deleted". Related intakes/documents are expected to cascade per schema.
 */
export async function deleteClientForCurrentFirm(
  clientId: string
): Promise<ClientActionResult<{ id: string }>> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  if (!clientId) {
    return { error: "clientId is required." };
  }

  try {
    // Defense-in-depth: confirm ownership before delete
    const owned = await clientHelpers.getByIdForFirm(clientId, firmId);
    if (!owned) {
      return { error: "Client not found or not accessible in current firm." };
    }

    await prisma.client.delete({
      where: { id: clientId, firmId },
    });

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "client.deleted",
      targetType: "client",
      targetId: clientId,
      metadata: { displayName: owned.displayName },
    });

    return { success: true, data: { id: clientId } };
  } catch (err) {
    console.error("[dashboard/actions] deleteClientForCurrentFirm failed:", err);
    return { error: "Failed to delete client. It may have related records preventing deletion." };
  }
}

/**
 * Lightweight update schema for notes / core fields (Phase 5 edit support).
 */
const UpdateClientSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/**
 * Server Action: Thin update for a client (notes, name fields, etc.).
 * Used by Client detail page for light edit. RBAC + firm scoping + audit.
 */
export async function updateClientForCurrentFirm(
  clientId: string,
  patch: Partial<z.infer<typeof UpdateClientSchema>>
): Promise<ClientActionResult<ClientWithSessions>> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId || !clientId) {
    return { error: "clientId and firm context required." };
  }

  const parsed = UpdateClientSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid update data.",
      details: parsed.error.issues,
    };
  }

  try {
    const owned = await clientHelpers.getByIdForFirm(clientId, firmId);
    if (!owned) {
      return { error: "Client not found or not accessible in current firm." };
    }

    const data: Record<string, unknown> = {};
    const p = parsed.data;
    if (p.displayName !== undefined) data.displayName = p.displayName;
    if (p.email !== undefined) data.email = p.email;
    if (p.firstName !== undefined) data.firstName = p.firstName || null;
    if (p.lastName !== undefined) data.lastName = p.lastName || null;
    if (p.phone !== undefined) data.phone = p.phone || null;
    if (p.notes !== undefined) data.notes = p.notes || null;

    if (Object.keys(data).length === 0) {
      return { error: "No changes supplied." };
    }

    await prisma.client.update({
      where: { id: clientId, firmId },
      data,
    });

    const refreshed = await clientHelpers.getByIdForFirm(clientId, firmId);

    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "client.updated",
      targetType: "client",
      targetId: clientId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return { success: true, data: (refreshed ?? owned) as ClientWithSessions };
  } catch (err: any) {
    console.error("[dashboard/actions] updateClientForCurrentFirm failed:", err);
    if (err?.code === "P2002") {
      return { error: "A client with that email already exists in your firm." };
    }
    return { error: "Failed to update client." };
  }
}

// ============================================================================
// Phase 5 Slice 2 — Overview Real Stats + Audit Activity (additive, minimal)
// ============================================================================

export interface OverviewStats {
  totalClients: number;
  intakesInProgress: number;
  documentsGenerated: number; // total GeneratedDocument rows for the firm
  recentPackages: number; // count of "document.package.generated" events in last 30d
}

export interface RecentActivityItem {
  id: string;
  createdAt: string; // ISO
  action: string;
  summary: string; // Human-friendly, minimal non-PII
  targetType?: string | null;
  targetId?: string | null;
}

export async function getOverviewStatsForCurrentFirm(): Promise<
  | { success: true; stats: OverviewStats; recentActivity: RecentActivityItem[] }
  | { error: string }
> {
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  if (!firmId) {
    return { error: "Active firm context required." };
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);

    // Real counts using existing firm-scoped helpers where possible
    const [clients, intakes, docs, recentPackageEvents, recentAudit] = await Promise.all([
      clientHelpers.listByFirm(firmId), // we only need length; helper already scopes
      intakeSessionHelpers.listByFirm(firmId),
      generatedDocumentHelpers.listByFirm(firmId, 1000), // light cap; we only need length + recent filter
      // Count package generations in last 30d via direct prisma (light)
      prisma.auditLog.count({
        where: {
          firmId,
          action: "document.package.generated",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Recent activity — use the canonical shared helper (Phase 6 Wave A: stop duplicating queries)
      getRecentAuditLogsForFirm(firmId, 8),
    ]);

    const totalClients = clients.length;

    const intakesInProgress = intakes.filter(
      (i: any) => i.status === "IN_PROGRESS" || (i.progress > 0 && i.progress < 100 && !i.completedAt)
    ).length;

    const documentsGenerated = docs.length;

    const recentActivity: RecentActivityItem[] = recentAudit.map((log) => {
      let summary = log.action;
      if (log.action === "client.created") summary = "New client added";
      else if (log.action === "document.package.generated") summary = "Full estate plan package generated";
      else if (log.action === "document.generated") summary = "Document generated";
      else if (log.action === "intake.started") summary = "Intake started";
      else if (log.action === "intake.completed") summary = "Intake completed";
      else if (log.action === "invitation.created") summary = "Client invitation sent";

      if (log.metadata && typeof log.metadata === "object") {
        const m = log.metadata as Record<string, unknown>;
        if (m.clientName) summary = `${summary} — ${m.clientName}`;
        if (m.displayName) summary = `${summary} — ${m.displayName}`;
      }

      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        action: log.action,
        summary,
        targetType: log.targetType,
        targetId: log.targetId,
      };
    });

    return {
      success: true,
      stats: {
        totalClients,
        intakesInProgress,
        documentsGenerated,
        recentPackages: recentPackageEvents,
      },
      recentActivity,
    };
  } catch (err: any) {
    console.error("[dashboard/actions] getOverviewStatsForCurrentFirm failed:", err);
    return { error: "Failed to load overview stats." };
  }
}
