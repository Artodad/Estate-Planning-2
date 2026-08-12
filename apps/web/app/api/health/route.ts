import { NextResponse } from "next/server";

/**
 * Public health check endpoint for production readiness (Wave C / Phase 6).
 *
 * - No auth (intentionally public for load balancers, uptime monitors, k8s probes).
 * - Lightweight: returns status + timestamp.
 * - Optional non-blocking DB ping (via Prisma $queryRaw) — safe, no PII.
 * - Used by: Vercel, monitoring, deployment pipelines.
 *
 * Per PHASE-6-7-COMPLETION-PLAN.md and original phase-6 checklist.
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  let dbStatus: "connected" | "unavailable" = "unavailable";

  try {
    // Dynamic import to avoid top-level Prisma cost if not needed; non-blocking best-effort.
    const { prisma } = await import("@/lib/prisma");
    // Tiny SELECT 1 equivalent via Prisma (works with any provider).
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (err) {
    // Non-fatal for health probe itself; log at debug level only.
    // In production this surfaces via Sentry if configured at edge.
    console.warn("[/api/health] DB ping failed (non-fatal for probe):", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp,
      db: dbStatus,
      service: "estate-planning-engine",
    },
    { status: 200 }
  );
}
