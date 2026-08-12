"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import { MOCK_CLIENTS } from "../clients/MockClientData";

/**
 * OverviewStats
 *
 * Lightweight top-of-Overview stat cards (added in Sub-agent C polish).
 * Uses the same MOCK_CLIENTS for a "live" feeling count while staying 100% scaffold.
 *
 * Clearly labeled. Uses RoleGuard for differentiated views (clients see limited stats).
 *
 * Easy to replace later with real aggregated counts from Phase 2 queries.
 */
export function OverviewStats() {
  const totalClients = MOCK_CLIENTS.length;
  const readyDocs = MOCK_CLIENTS.filter((c) => c.documentsStatus === "ready").length;
  const inProgress = MOCK_CLIENTS.filter(
    (c) => c.intakeProgress > 0 && c.intakeProgress < 100
  ).length;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="text-2xl font-semibold tabular-nums">{totalClients}</div>
          <div className="text-sm text-muted-foreground">Total Clients (MOCK)</div>
          <div className="mt-1 text-[10px] text-amber-600">Demo data</div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="text-2xl font-semibold tabular-nums">{readyDocs}</div>
          <div className="text-sm text-muted-foreground">Document Packages Ready</div>
          <div className="mt-1 text-[10px] text-amber-600">Demo data</div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="text-2xl font-semibold tabular-nums">{inProgress}</div>
          <div className="text-sm text-muted-foreground">Intakes In Progress</div>
          <div className="mt-1 text-[10px] text-amber-600">Demo data</div>
        </CardContent>
      </Card>

      <RoleGuard
        allowed={OWNER_STAFF}
        fallback={
          <Card className="border-dashed opacity-60">
            <CardContent className="pt-4 text-sm text-muted-foreground">
              Limited client view — your personal matters will appear here in a future release.
            </CardContent>
          </Card>
        }
      >
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular-nums">3</div>
            <div className="text-sm text-muted-foreground">Active Matters (You)</div>
            <div className="mt-1 text-[10px] text-amber-600">Demo — real assignment later</div>
          </CardContent>
        </Card>
      </RoleGuard>
    </div>
  );
}
