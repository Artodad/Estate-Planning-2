import "server-only";

import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

/**
 * Reusable per-firm rate limiter (Wave C / Phase 6).
 *
 * Extracted from the inline logic in invite-client.ts (20/hr).
 * Simple, DB-backed count in sliding window. No external infra (Inngest etc. deferred).
 *
 * Contract:
 * - checkRateLimit(firmId, action, limit, windowMs) → { allowed: boolean }
 * - On limit hit: returns allowed:false (caller returns friendly error + optional audit/Sentry)
 * - Non-fatal on query failure (proceed, warn + Sentry tagged low severity)
 * - Minimal, no PII in logs.
 *
 * Tuned conservatively for generation (expensive CPU + privileged).
 * Can be made configurable via env or admin table post-MVP.
 */
export async function checkRateLimit(
  firmId: string,
  action: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; count?: number }> {
  const since = new Date(Date.now() - windowMs);

  try {
    const count = await prisma.auditLog.count({
      where: {
        firmId,
        action,
        createdAt: { gte: since },
      },
    });

    if (count >= limit) {
      return { allowed: false, count };
    }
    return { allowed: true, count };
  } catch (err) {
    // Best-effort only; do not block privileged flows on limiter outage
    console.warn("[rate-limit] check failed (proceeding):", {
      firmId,
      action,
      error: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err, {
      tags: { area: "rate-limit", severity: "low" },
      extra: { firmId, action, limit },
    });
    return { allowed: true }; // fail-open for resilience
  }
}

/**
 * Convenience presets for common sensitive actions.
 * Generation limit intentionally low (5-10/hr/firm) because full package is CPU-heavy + privileged.
 */
export const RATE_LIMITS = {
  INVITE: { limit: 20, windowMs: 60 * 60 * 1000, action: "invitation.created" },
  // Use a dedicated action for generation rate limiting (logged on success path)
  GENERATION_PACKAGE: { limit: 8, windowMs: 60 * 60 * 1000, action: "document.package.generated" },
  GENERATION_SINGLE: { limit: 20, windowMs: 60 * 60 * 1000, action: "document.generated" },
} as const;
