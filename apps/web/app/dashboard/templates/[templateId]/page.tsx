import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { templateHelpers } from "@/lib/prisma";
import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import { TemplateNormalizePunch } from "@/features/dashboard/components/templates/TemplateNormalizePunch";
import { Button } from "@/components/ui/button";

/**
 * /dashboard/templates/[templateId]
 *
 * Owner-only Trust template detail. Punch reads the persisted normalize report
 * so tagged vs leftover holes survive reload.
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
  if (!template) {
    notFound();
  }

  const report = parseStoredNormalizeReport(template.normalizeReport);

  return (
    <div className="space-y-6 rounded-lg bg-[#f4f1ea] p-6 text-[#2c3338]">
      <div>
        <p className="text-xs uppercase tracking-wide text-[#5c6570]">Trust template</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{template.name}</h1>
        <p className="mt-1 font-mono text-xs text-[#5c6570]">{template.documentType}</p>
        {template.description ? (
          <p className="mt-2 text-sm text-[#5c6570]">{template.description}</p>
        ) : null}
      </div>

      <div className="rounded-xl bg-white/60 p-4 ring-1 ring-[#2c3338]/10">
        <h2 className="mb-3 text-sm font-semibold">Leftover punch</h2>
        <TemplateNormalizePunch report={report} />
      </div>

      <Button asChild variant="outline">
        <Link href="/dashboard/templates">← Back to templates</Link>
      </Button>
    </div>
  );
}
