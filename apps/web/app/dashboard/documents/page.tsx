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

// Phase 4 real data (C wiring)
import { generatedDocumentHelpers } from "@/lib/prisma";

/**
 * /dashboard/documents
 * Shows real GeneratedDocument rows + secure downloads.
 * Full coordinated package generation is launched from the Clients section.
 */
export default async function DocumentsPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole([...OWNER_STAFF], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Documents section is available to owners and staff only.",
  });

  const mockDocs = [
    { name: "Vargas RLT + Pour-Over + POAs", date: "May 20", status: "Ready (v1.2)" },
    { name: "Morrison Family Trust Package", date: "May 18", status: "Regen needed" },
    { name: "Ruiz Community Property Docs", date: "May 15", status: "Ready (v2.0)" },
  ];

  // Real Phase 4 data (when GeneratedDocument rows exist for the firm via generateDocumentForIntake action)
  let realDocs: any[] = [];
  let realFirmId: string | null = null;
  try {
    const auth = await getCurrentAuthContext();
    if (auth?.currentFirm?.id) {
      realFirmId = auth.currentFirm.id;
      realDocs = await generatedDocumentHelpers.listByFirm(auth.currentFirm.id, 20);
    }
  } catch (e) {
    // Non-fatal in scaffold; real errors surface in generation action
  }

  return (
    <div className="space-y-6">
      <SectionCallout>
        Real GeneratedDocument rows and full coordinated packages (8-doc ZIPs with DRAFT on every page) are live. Generate from any Client record (list or detail page). Secure downloads work for both individual documents and packages. Mocks preserved for demos.
      </SectionCallout>

      {/* Real generated documents (Phase 4) */}
      {realDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Documents (Live)</CardTitle>
            <CardDescription>
              Exact-fidelity DRAFTs produced from IntakeSession.answers for this firm. File keys point to secure storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {realDocs.map((d: any) => (
              <div key={d.id} className="flex flex-col gap-1 rounded border p-3 text-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{d.documentType} — {d.template?.name ?? "Custom"}</div>
                  <div className="text-xs text-muted-foreground font-mono break-all">{d.fileKey}</div>
                </div>
                <div className="flex items-center gap-3 text-right text-xs">
                  <div>
                    <div className="font-medium text-emerald-700 dark:text-emerald-400">{d.status}</div>
                    <div className="text-muted-foreground">{d.generatedAt ? new Date(d.generatedAt).toLocaleDateString() : ""}</div>
                  </div>
                  <a
                    href={`/api/documents/download?fileKey=${encodeURIComponent(d.fileKey)}`}
                    className="rounded border px-3 py-1 font-medium hover:bg-muted"
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground pt-2">Download route live at /api/documents/download?fileKey=... (works for both individual DRAFT docs and the full-plan ZIP). Use generateDocumentForIntake or the new generateFullPlanPackageForIntake from Client detail or intakes.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>History of generated estate plan packages (MOCK + real when present).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {mockDocs.map((d, i) => (
              <div key={i} className="flex justify-between rounded border p-3 text-sm">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.date}</div>
                </div>
                <div className="text-right text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {d.status}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">← Back to Overview</Link>
            </Button>
          </div>

          <p className="pt-2 text-[10px] text-muted-foreground">
            Generate full coordinated 8-document packages (with DRAFT on every page) from the <Link href="/dashboard/clients" className="underline">Clients</Link> section. Real single-document regeneration and advanced history coming in later polish. Downloads use the secure route.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
