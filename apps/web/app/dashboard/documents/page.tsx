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

  let realDocs: any[] = [];
  try {
    if (authContext?.currentFirm?.id) {
      realDocs = await generatedDocumentHelpers.listByFirm(authContext.currentFirm.id, 20);
    }
  } catch {
    realDocs = [];
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Draft estate plan packages generated for this firm.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {realDocs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-lg font-semibold tracking-tight">No documents yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a draft package from a client record.
              </p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/dashboard/clients">Go to Clients</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {realDocs.map((d: any) => (
                <div
                  key={d.id}
                  className="flex flex-col gap-1 rounded border p-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {d.documentType} — {d.template?.name ?? "Custom"}
                    </div>
                    <div className="break-all text-xs text-muted-foreground font-mono">
                      {d.fileKey}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right text-xs">
                    <div>
                      <div className="font-medium text-emerald-700 dark:text-emerald-400">
                        {d.status}
                      </div>
                      <div className="text-muted-foreground">
                        {d.generatedAt ? new Date(d.generatedAt).toLocaleDateString() : ""}
                      </div>
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
