import { notFound, redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { templateHelpers } from "@/lib/prisma";
import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import { TemplateNormalizePunch } from "@/features/dashboard/components/templates/TemplateNormalizePunch";
import { TRUST_DRAFT_DOCUMENT_TYPE } from "@/features/dashboard/components/generate-trust-draft";
import { templateDisplayFileName } from "@/features/dashboard/components/normalize-report-punch-list";
import { TemplateUploadForm } from "@/features/dashboard/components/templates/TemplateUploadForm";

/**
 * /dashboard/templates/[templateId]
 *
 * Same Trust instrument as the list page. Punch reads persisted normalizeReport.
 */
export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole(["owner"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Templates management is restricted to firm owners.",
  });

  const { templateId } = await params;
  const firmId = authContext.currentFirm?.id;
  if (!firmId) {
    notFound();
  }

  const template = await templateHelpers.getByIdForFirm(templateId, firmId);
  if (!template || template.documentType !== TRUST_DRAFT_DOCUMENT_TYPE) {
    notFound();
  }

  const report = parseStoredNormalizeReport(template.normalizeReport);
  const fileName = templateDisplayFileName(template.fileKey, report?.sourceFileName);

  return (
    <div className="bg-[#f4f1ea] px-2 py-4 text-[#2c3338] sm:px-4">
      <div className="mx-auto max-w-xl space-y-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Trust template.</h1>
          <p className="mt-2 text-[#5c6570]">{fileName}</p>
        </div>

        {report && !report.skipped ? <TemplateNormalizePunch report={report} /> : null}

        <details className="text-sm text-[#5c6570]">
          <summary className="cursor-pointer hover:text-[#2c3338]">Replace Trust .docx</summary>
          <div className="mt-4">
            <TemplateUploadForm />
          </div>
        </details>
      </div>
    </div>
  );
}
