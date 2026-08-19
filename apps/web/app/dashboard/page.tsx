import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { OWNER_STAFF } from "@/features/auth";
import { RoleGuard } from "@/features/auth/components/role-guard";
import { getOverviewStatsForCurrentFirm } from "@/features/dashboard/server/actions";
import { OverviewStats } from "@/features/dashboard/components/overview/OverviewStats";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * /dashboard
 *
 * Attorney overview: live firm counts, recent activity, and links into
 * clients / intakes / documents. Empty firms show zeros and an empty state —
 * never mock matters.
 */
export default async function DashboardOverviewPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  const snapshot = await getOverviewStatsForCurrentFirm();
  const stats =
    "success" in snapshot && snapshot.success
      ? snapshot.stats
      : {
          totalClients: 0,
          intakesInProgress: 0,
          documentsGenerated: 0,
          recentPackages: 0,
        };
  const recentActivity =
    "success" in snapshot && snapshot.success ? snapshot.recentActivity : [];

  return (
    <div className="space-y-6">
      <OverviewStats
        totalClients={stats.totalClients}
        intakesInProgress={stats.intakesInProgress}
        documentsGenerated={stats.documentsGenerated}
      />

      <RoleGuard allowed={OWNER_STAFF}>
        <div className="space-y-6">
          {stats.totalClients === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>No clients yet</CardTitle>
                <CardDescription>
                  Create a client to start an intake, then Generate Trust draft.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href="/dashboard/clients">Go to Clients</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Firm Activity</CardTitle>
              <CardDescription>Latest actions in this firm.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="space-y-2">
                  {recentActivity.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4 text-sm">
                      <span>{item.summary}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Open a working surface for this firm.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/clients">Clients</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/intakes">Intakes</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard/documents">Documents</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </RoleGuard>
    </div>
  );
}
