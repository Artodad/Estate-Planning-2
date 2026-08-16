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

  const sampleIntakes =
    realIntakes.length === 0
      ? [
          { id: "int_01", client: "Elena M. Vargas", progress: "95%", status: "Almost ready" },
          { id: "int_02", client: "Robert Chen & Lisa Patel", progress: "62%", status: "In progress" },
          { id: "int_03", client: "Aisha K. Thompson", progress: "38%", status: "Paused" },
        ]
      : [];

  const showingSample = realIntakes.length === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Intake sessions</CardTitle>
          <CardDescription>
            {showingSample
              ? "No intakes for this firm yet. Sample sessions below show how matters will appear. Start one from a client record."
              : "Active and recent client intake sessions. Open a session to continue the questionnaire."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {realIntakes.length > 0 &&
              realIntakes.map((item: any) => (
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
            {showingSample &&
              sampleIntakes.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{item.client}</div>
                    <div className="text-xs text-muted-foreground">{item.status}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {item.progress}
                  </div>
                </div>
              ))}
          </div>

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
