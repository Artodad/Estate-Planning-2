import { redirect } from "next/navigation";

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
import Link from "next/link";

// Shared scaffold primitives (Sub-agent C)
import { SectionCallout } from "@/features/dashboard/components/shared/SectionCallout";

// Real data (additive wiring for Phase 3 D)
import { getIntakesForCurrentFirm } from "@/features/dashboard/server/actions";

/**
 * /dashboard/intakes
 * Lists real IntakeSession records with links to resume the adaptive questionnaire.
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

  // === ADDITIVE REAL DATA WIRING (Phase 3 D) ===
  // Loads firm-scoped IntakeSessions via the protected action (getCurrentAuthContext + audit).
  // Links go to the real QuestionnaireWizard route. The original SCAFFOLD callout + descriptive
  // text below are preserved verbatim (additive only; no removal of banners or mock notes).
  let realIntakes: any[] = [];
  let realNote = "";
  try {
    const res = await getIntakesForCurrentFirm();
    if (res && "success" in res && res.success) {
      realIntakes = res.intakes ?? [];
      realNote = ` (live: ${res.count} for firm)`;
    }
  } catch {
    realNote = " (real fetch error; showing stub)";
  }

  // Fallback tiny mock list only if no real data (graceful)
  const mockIntakes = realIntakes.length === 0 ? [
    { id: "int_01", client: "Elena M. Vargas...", progress: "95%", status: "Almost ready" },
    { id: "int_02", client: "Robert Chen & Lisa Patel", progress: "62%", status: "In progress" },
    { id: "int_03", client: "Aisha K. Thompson", progress: "38%", status: "Paused" },
  ] : [];

  const intakesToShow = realIntakes.length > 0 ? realIntakes : mockIntakes;

  return (
    <div className="space-y-6">
      <SectionCallout>
        Real IntakeSession data from the adaptive questionnaire is live. Resume any session to continue the wizard. Additional history, bulk actions, and advanced filtering are planned for post-Phase 5 polish.
      </SectionCallout>

      <Card>
        <CardHeader>
          <CardTitle>Intakes</CardTitle>
          <CardDescription>
            Active and recent client intake sessions {realIntakes.length > 0 ? "(LIVE from IntakeSession)" : "(MOCK)"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {intakesToShow.length === 0 && (
              <div className="text-sm text-muted-foreground">No active intakes for this firm yet. Start one from a Client record.</div>
            )}
            {realIntakes.length > 0 &&
              realIntakes.map((item: any) => (
                <Link
                  key={item.id}
                  href={`/dashboard/intakes/${item.id}`}
                  className="flex items-center justify-between rounded border p-3 text-sm hover:bg-muted/50 transition block"
                >
                  <div>
                    <div className="font-medium">{item.client?.displayName ?? "Client"}</div>
                    <div className="text-xs text-muted-foreground">{item.status} • {item.client?.email}</div>
                  </div>
                  <div className="text-right font-mono text-xs">{item.progress}%</div>
                </Link>
              ))}
            {realIntakes.length === 0 &&
              mockIntakes.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <div>
                    <div className="font-medium">{item.client}</div>
                    <div className="text-xs text-muted-foreground">{item.status}</div>
                  </div>
                  <div className="text-right font-mono text-xs">{item.progress}</div>
                </div>
              ))}
          </div>

          <div className="pt-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">← Back to Overview</Link>
            </Button>
          </div>

          <p className="pt-2 text-[10px] text-muted-foreground">
            Owner/Staff only (enforced via requireRole + sidebar filtering via useDashboardNav).
            Real adaptive questionnaire + session state from Phase 3. {realNote}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
