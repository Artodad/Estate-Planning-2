/**
 * Trust-draft download with confirm stamp (revocable_trust only).
 *
 * GET /api/documents/download streams stored bytes as-is — Documents / client
 * downloads stay on that route. This path loads the stored Trust draft, injects
 * the confirm phrase as an extra header line, and returns those bytes.
 * Does not persist. Never ZIP. Does not call generateDocument.
 */

import { NextRequest } from "next/server";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { checkOwnerOrStaff } from "@/features/auth/server/rbac";
import { logAuditEvent } from "@/features/auth/server/audit";
import { leftoverCountFromFillReport, trustDraftDownloadConfirmPhrase } from "@/features/dashboard/components/trust-draft-download-confirm";
import { TRUST_DRAFT_DOCUMENT_TYPE } from "@/features/dashboard/components/generate-trust-draft";
import { stampTrustDraftConfirmPhrase } from "@/features/documents/draft-watermark-module";
import { parseStoredFillReport } from "@/features/documents/fill-report";
import { getFileBuffer } from "@/features/documents/storage";
import type { PartialIntake } from "@/features/intake/schemas/intake";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return new Response(check.error || "Forbidden", { status: 403 });
  }

  const firmId = check.context.currentFirm?.id;
  if (!firmId) {
    return new Response("Active firm context required", { status: 400 });
  }

  const fileKey = request.nextUrl.searchParams.get("fileKey");
  if (!fileKey || typeof fileKey !== "string") {
    return new Response("fileKey query parameter is required", { status: 400 });
  }

  if (fileKey.includes("..")) {
    return new Response("Invalid file key", { status: 400 });
  }

  if (fileKey.toLowerCase().endsWith(".zip")) {
    return new Response("Trust draft download returns .docx only", { status: 400 });
  }

  if (!fileKey.toLowerCase().endsWith(".docx")) {
    return new Response("Trust draft download returns .docx only", { status: 400 });
  }

  const record = await prisma.generatedDocument.findFirst({
    where: {
      firmId,
      fileKey,
      documentType: TRUST_DRAFT_DOCUMENT_TYPE,
    },
    select: {
      fileKey: true,
      fillReport: true,
      intakeSession: { select: { answers: true } },
    },
  });

  if (!record) {
    return new Response("Trust draft not found or not accessible for this firm", { status: 404 });
  }

  const leftoverCount = leftoverCountFromFillReport(
    parseStoredFillReport(record.fillReport),
    (record.intakeSession?.answers ?? null) as PartialIntake | null,
  );
  const phrase = trustDraftDownloadConfirmPhrase(leftoverCount);

  try {
    const stored = await getFileBuffer(fileKey);
    const stamped = stampTrustDraftConfirmPhrase(stored, phrase);

    const actorClerkId = check.context.userId;
    logAuditEvent({
      firmId,
      actorClerkId,
      action: "document.downloaded",
      targetType: "generatedDocument",
      targetId: fileKey,
      metadata: { trustDraftConfirm: true, leftoverCount },
    });

    const filename = fileKey.split("/").pop() || "trust-draft.docx";

    return new Response(stamped as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": stamped.length.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    console.warn("[documents/download-trust-draft] failed for key (redacted):", fileKey.slice(0, 60));
    return new Response("File not found or not accessible for this firm", { status: 404 });
  }
}
