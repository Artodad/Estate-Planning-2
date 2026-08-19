"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";

/**
 * OverviewStats
 *
 * Firm counts for the Overview page. Numbers come from the live snapshot
 * (getOverviewStatsForCurrentFirm). Empty firms show zeros — never mock caseload.
 */
export function OverviewStats({
  totalClients = 0,
  documentsGenerated = 0,
  intakesInProgress = 0,
}: {
  totalClients?: number;
  documentsGenerated?: number;
  intakesInProgress?: number;
}) {
  return (
    <RoleGuard
      allowed={OWNER_STAFF}
      fallback={
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Limited client view — your personal matters will appear here in a future release.
          </CardContent>
        </Card>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular-nums">{totalClients}</div>
            <div className="text-sm text-muted-foreground">Total Clients</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular-nums">{documentsGenerated}</div>
            <div className="text-sm text-muted-foreground">Documents Generated</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-semibold tabular-nums">{intakesInProgress}</div>
            <div className="text-sm text-muted-foreground">Intakes In Progress</div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
