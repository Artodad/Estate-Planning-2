import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";

import { templateHelpers } from "@/lib/prisma";
import { TemplateUploadForm } from "@/features/dashboard/components/templates/TemplateUploadForm";
import { TemplateNormalizePunch } from "@/features/dashboard/components/templates/TemplateNormalizePunch";
import { TRUST_DRAFT_DOCUMENT_TYPE } from "@/features/dashboard/components/generate-trust-draft";
import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import { templateDisplayFileName } from "@/features/dashboard/components/normalize-report-punch-list";

/**
 * /dashboard/templates
 *
 * Owner-only Trust instrument. After persist, leftover punch is read from
 * Template.normalizeReport so holes survive reload.
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

  const trust = templates.find((t) => t.documentType === TRUST_DRAFT_DOCUMENT_TYPE);
  const report = trust ? parseStoredNormalizeReport(trust.normalizeReport) : null;
  const fileName = trust
    ? templateDisplayFileName(trust.fileKey, report?.sourceFileName)
    : null;

  return (
    <div className="bg-[#f4f1ea] px-2 py-4 text-[#2c3338] sm:px-4">
      <div className="mx-auto max-w-xl space-y-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Trust template.</h1>
          {fileName ? <p className="mt-2 text-[#5c6570]">{fileName}</p> : null}
        </div>

        {trust && report && !report.skipped ? (
          <TemplateNormalizePunch report={report} />
        ) : null}

        {trust ? (
          <details className="text-sm text-[#5c6570]">
            <summary className="cursor-pointer hover:text-[#2c3338]">Replace Trust .docx</summary>
            <div className="mt-4">
              <TemplateUploadForm />
            </div>
          </details>
        ) : (
          <TemplateUploadForm />
        )}
      </div>
    </div>
  );
}
