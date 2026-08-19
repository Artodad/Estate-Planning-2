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

// Shared scaffold primitives (Sub-agent C)
import { SectionCallout } from "@/features/dashboard/components/shared/SectionCallout";

// Real template upload + list (owner only)
import { templateHelpers } from "@/lib/prisma";
import { TemplateUploadForm } from "@/features/dashboard/components/templates/TemplateUploadForm";

/**
 * /dashboard/templates
 *
 * Owner-only page for uploading and managing the firm's .docx templates.
 * Uploaded templates are immediately available to the generation resolver
 * (getPackageTemplatesForCurrentFirm + single document actions) via documentType matching.
 *
 * Non-negotiable: only owners see this (enforced server-side + nav).
 */
export default async function TemplatesPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  // Strict owner-only (matches nav item + existing Owner Settings card)
  await requireRole(["owner"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Templates management is restricted to firm owners.",
  });

  let templates: any[] = [];
  try {
    if (authContext?.currentFirm?.id) {
      templates = await templateHelpers.listActiveByFirm(authContext.currentFirm.id);
    }
  } catch (e) {
    // non-fatal; page still renders the upload form
  }

  return (
    <div className="space-y-6">
      <SectionCallout>
        Owner-only. Upload your firm’s actual .docx templates here. They power Trust draft generation
        (exact fidelity via docxtemplater — zero rewriting of your language). Templates become available
        immediately after upload.
      </SectionCallout>

      {/* Upload form (client island) */}
      <Card>
        <CardHeader>
          <CardTitle>Upload New Template</CardTitle>
          <CardDescription>
            Upload a firm .docx template. Your original formatting, headers, footers, numbering,
            and California-specific provisions are preserved exactly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateUploadForm />
        </CardContent>
      </Card>

      {/* Current registered templates */}
      <Card className="border-amber-200 dark:border-amber-900/50">
        <CardHeader>
          <CardTitle>Your Templates</CardTitle>
          <CardDescription>
            Active templates for this firm ({templates.length}). These are matched by documentType when
            generating from any client intake.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length > 0 ? (
            <div className="space-y-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.documentType}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Active • {t.fileKey ? "Ready" : "Missing file"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No templates registered yet for this firm. Use the form above to upload your first .docx
              template. Trust draft generation uses your revocable trust template.
            </div>
          )}

          <div className="pt-3 border-t text-[10px] text-muted-foreground">
            Any templates you upload here become immediately available for Trust draft generation.
            See the Template Preparation Guide for the exact variable names.
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard">← Back to Overview</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/docs/template-preparation-guide.md" target="_blank" rel="noopener">
                Template variable reference ↗
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
