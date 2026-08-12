import "server-only";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/prisma";

/**
 * Thin, type-safe AuditLog service for The Estate Planning Engine.
 *
 * Per Design Document in progress-phase-1-webhooks-auditlog.md §4:
 * - Non-fatal: every log call is wrapped in try/catch; failures only console.error.
 * - Firm-scoped at write time (callers must provide firmId from validated auth ctx).
 * - Minimal metadata only (no PII dumps, no client answers, no document content).
 * - Action strings are free-form but documented in call sites (e.g. "invitation.created").
 *
 * Location chosen per design rec: feature-sliced under auth/server (colocated with
 * invite-client, create-firm, etc.). Can be promoted to src/lib/audit.ts later.
 *
 * Do not import from client components.
 */

export type AuditEventInput = {
  firmId: string;
  actorClerkId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        firmId: input.firmId,
        actorClerkId: input.actorClerkId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        // Only include metadata when present (avoids Prisma Json null typing issues with
        // NullableJsonNullValueInput | InputJsonValue; omitted => DB NULL per design).
        // 'as any' cast is the minimal workaround for strict generated InputJsonValue recursion.
        ...(input.metadata ? { metadata: input.metadata as any } : {}),
      },
    });
  } catch (error) {
    // Audit must never break business flows or expose details
    console.error("[audit] logAuditEvent failed (non-fatal):", {
      action: input.action,
      firmId: input.firmId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Wave B5: Manual Sentry capture for observability on swallowed non-fatal (tagged)
    Sentry.captureException(error, {
      tags: { area: "audit", nonFatal: "true" },
      extra: { action: input.action, firmId: input.firmId },
    });
  }
}

// Optional convenience for common queries (used by future admin UI / compliance)
export async function getRecentAuditLogsForFirm(firmId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { firmId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
