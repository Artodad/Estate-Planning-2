/**
 * Secure download route for generated DRAFT documents and packages (Phase 4 D).
 *
 * Thin, RBAC-protected endpoint so attorneys can actually retrieve the ZIPs and individual .docx files
 * produced by generateDocumentForIntake and generateFullPlanPackageForIntake.
 *
 * Usage:
 *   /api/documents/download?fileKey=generated/2026-05-26/Smith-John-Full-Estate-Plan-Package-DRAFT-2026-05-26.zip
 *   /api/documents/download?fileKey=generated/.../Some-Client-Revocable-Trust-DRAFT-....docx
 *
 * Security:
 * - Requires authenticated owner/staff for the current firm (via checkOwnerOrStaff + getCurrentAuthContext).
 * - No public access. No guessing keys without valid firm session.
 * - Storage keys are opaque; the route never trusts client input for authorization.
 * - Works for both dev FS storage and future Supabase/S3 (same getFileBuffer abstraction).
 *
 * Content-Type and filename are derived safely from the key extension.
 */

import { NextRequest } from "next/server";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { checkOwnerOrStaff } from "@/features/auth/server/rbac";
import { logAuditEvent } from "@/features/auth/server/audit";
import { getFileBuffer } from "@/features/documents/storage";

export async function GET(request: NextRequest) {
  // Auth + RBAC (defense in depth — same primitive used by all generation actions)
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return new Response(check.error || "Forbidden", { status: 403 });
  }

  const fileKey = request.nextUrl.searchParams.get("fileKey");
  if (!fileKey || typeof fileKey !== "string") {
    return new Response("fileKey query parameter is required", { status: 400 });
  }

  // Basic traversal guard (storage implementation also hardens this)
  if (fileKey.includes("..")) {
    return new Response("Invalid file key", { status: 400 });
  }

  try {
    const buffer = await getFileBuffer(fileKey);

    const isZip = fileKey.toLowerCase().endsWith(".zip");

    // Audit the successful access (highest-priority compliance gap from Phase 6 research).
    // Non-fatal, minimal metadata, firm-scoped exactly like all other call sites.
    const firmId = check.context.currentFirm?.id;
    const actorClerkId = check.context.userId;
    if (firmId) {
      logAuditEvent({
        firmId,
        actorClerkId,
        action: "document.downloaded",
        targetType: isZip ? "package" : "generatedDocument",
        targetId: fileKey,
        metadata: { isZip },
      });
    }

    const contentType = isZip
      ? "application/zip"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // Safe filename for the browser (last path segment)
    const filename = fileKey.split("/").pop() || "download";

    // Buffer is fine at runtime in Next.js route handlers; cast to satisfy strict BodyInit types
    return new Response(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "private, max-age=60", // short private cache is fine for attorney downloads
      },
    });
  } catch (err) {
    // Do not leak storage details
    console.warn("[documents/download] failed for key (redacted):", fileKey.slice(0, 60));
    return new Response("File not found or not accessible for this firm", { status: 404 });
  }
}
