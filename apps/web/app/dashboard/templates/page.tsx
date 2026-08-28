import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { templateHelpers } from "@/lib/prisma";
import { TemplateUploadForm } from "@/features/dashboard/components/templates/TemplateUploadForm";
import { templatePunchFromStoredReport } from "@/features/dashboard/components/normalize-report-punch-list";
import { TemplateNormalizePunch } from "@/features/dashboard/components/templates/TemplateNormalizePunch";

/**
 * /dashboard/templates
 *
 * Owner-only Trust .docx upload. Leftover punch (tagged vs still-blank)
 * is read from the persisted Template.normalizeReport so it survives reload.
 */
export default async function TemplatesPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole(["owner"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Templates management is restricted to firm owners.",
  });

  let templates: Awaited<ReturnType<typeof templateHelpers.listActiveByFirm>> = [];
  try {
    if (authContext?.currentFirm?.id) {
      templates = await templateHelpers.listActiveByFirm(authContext.currentFirm.id);
    }
  } catch {
    // non-fatal; page still renders the upload form
  }

  return (
    <div className="space-y-6 rounded-lg bg-[#f4f1ea] p-6 text-[#2c3338]">
      <Card className="bg-white/70 text-[#2c3338] ring-[#2c3338]/10">
        <CardHeader>
          <CardTitle>Upload Trust template</CardTitle>
          <CardDescription className="text-[#5c6570]">
            Upload the firm’s Revocable Living Trust .docx. Confirm any soft blanks
            before it is saved. Leftover punch stays on this page after reload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateUploadForm />
        </CardContent>
      </Card>

      <Card className="bg-white/70 text-[#2c3338] ring-[#2c3338]/10">
        <CardHeader>
          <CardTitle>Your templates</CardTitle>
          <CardDescription className="text-[#5c6570]">
            Active Trust templates for this firm ({templates.length}). Punch is
            tagged vs still-blank leftover — not “Active • Ready”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((t) => {
                const punch = templatePunchFromStoredReport(t.normalizeReport);
                return (
                  <div
                    key={t.id}
                    data-testid="template-row"
                    data-template-id={t.id}
                    data-leftover-count={
                      punch.report && !punch.report.skipped
                        ? String(punch.leftoverCount)
                        : undefined
                    }
                    className="rounded border border-[#2c3338]/12 p-3 text-sm"
                  >
                    <div className="flex justify-between gap-3">
                      <div>
                        <Link
                          href={`/dashboard/templates/${t.id}`}
                          className="font-medium text-[#2c3338] underline-offset-2 hover:underline"
                        >
                          {t.name}
                        </Link>
                        <div className="font-mono text-xs text-[#5c6570]">{t.documentType}</div>
                        {t.description ? (
                          <div className="mt-0.5 text-xs text-[#5c6570]">{t.description}</div>
                        ) : null}
                      </div>
                      <div className="text-right text-xs tabular-nums text-[#5c6570]">
                        {punch.punchLabel ? (
                          <div data-testid="template-leftover" data-leftover-count={String(punch.leftoverCount)}>
                            {punch.punchLabel}
                          </div>
                        ) : t.fileKey ? (
                          "Active • Ready"
                        ) : (
                          "Missing file"
                        )}
                      </div>
                    </div>
                    {punch.report && !punch.report.skipped ? (
                      <div className="mt-3 border-t border-[#2c3338]/10 pt-3">
                        <TemplateNormalizePunch report={punch.report} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-[#5c6570]">
              No Trust template yet. Upload a Revocable Living Trust .docx above.
            </div>
          )}

          <div className="pt-3">
            <Button asChild variant="outline">
              <Link href="/dashboard">← Back to Overview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
