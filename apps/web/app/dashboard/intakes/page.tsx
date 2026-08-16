import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { OWNER_STAFF } from "@/features/auth";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getIntakesForCurrentFirm } from "@/features/dashboard/server/actions";

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
 * /dashboard/intakes
 * Lists firm intake sessions with links to resume the questionnaire.
 */
export default async function IntakesPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole([...OWNER_STAFF], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Intakes section is available to owners and staff only.",
  });

  let realIntakes: any[] = [];
  try {
    const res = await getIntakesForCurrentFirm();
    if (res && "success" in res && res.success) {
      realIntakes = res.intakes ?? [];
    }
  } catch {
    realIntakes = [];
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Intake sessions</CardTitle>
          <CardDescription>
            {realIntakes.length === 0
              ? "No intakes yet. Start one from a client record."
              : "Active and recent client intake sessions. Open a session to continue the questionnaire."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {realIntakes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-lg font-semibold tracking-tight">No intakes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start an intake from a client record.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/dashboard/clients">Go to Clients</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {realIntakes.map((item: any) => (
                <Link
                  key={item.id}
                  href={`/dashboard/intakes/${item.id}`}
                  className="flex items-center justify-between rounded-md border p-3 text-sm transition hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{item.client?.displayName ?? "Client"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatIntakeStatus(item.status)}
                      {item.client?.email ? ` · ${item.client.email}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {item.progress}%
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">← Back to Overview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
