import { test, expect } from "@playwright/test";
import { resolveE2EFirmId, signInE2E } from "./clerk-e2e-signin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

[
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, ".env"),
  path.resolve(process.cwd(), "apps/web/.env"),
  path.resolve(process.cwd(), ".env"),
].forEach((p) => {
  try {
    dotenv.config({ path: p });
  } catch {
    /* ignore */
  }
});

/* eslint-disable turbo/no-undeclared-env-vars -- E2E test credentials (loaded from .env, never in builds) */
const E2E_IDENTIFIER = process.env.E2E_CLERK_USER_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD;

/**
 * Documents row for revocable_trust: same punch list + stamp confirm as intake.
 * Other types stay on ungated GET /api/documents/download.
 */
test.describe("Documents — Trust draft punch list + stamp confirm", () => {
  const hasE2ECredentials = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

  if (!hasE2ECredentials) {
    test.skip(
      true,
      "E2E Clerk credentials (E2E_CLERK_USER_IDENTIFIER + PASSWORD) are not present in environment",
    );
  }

  test("revocable_trust row shows punch list, prefixed JUMP_TO, and stamp confirm; other types stay ungated", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await signInE2E(page);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    if (page.url().includes("/sign-in")) {
      throw new Error("Still on sign-in after clerk.signIn — check E2E Clerk credentials / org membership.");
    }

    let firmId = "";
    try {
      firmId = await resolveE2EFirmId(page);
    } catch {
      test.skip(true, "Could not resolve e2e firm id (set E2E_FIRM_ID or map the Clerk org to a Firm).");
    }
    if (!firmId) {
      test.skip(true, "No e2e firm id (E2E_FIRM_ID unset and dashboard has no Firm ID).");
    }

    const { prisma, generatedDocumentHelpers } = await import("../src/lib/prisma");
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Docs-Trust ${stamp}`,
        email: `docs-trust-${stamp}@test.local`,
      },
    });
    const session = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId,
        status: "completed",
        progress: 100,
        answers: {
          personal: {
            client: { firstName: "Ada", lastName: "Lovelace" },
            maritalStatus: "single",
            isCAResident: true,
          },
        },
      },
    });
    const trustKey = `generated/e2e-docs-trust-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    const otherKey = `generated/e2e-docs-hc-${stamp}/Ada-Lovelace-Healthcare-DRAFT.docx`;
    const zipKey = `generated/e2e-docs-pkg-${stamp}/Ada-Lovelace-Full-Estate-Plan-Package-DRAFT.zip`;
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: session.id,
      documentType: "revocable_trust",
      fileKey: trustKey,
      status: "generated",
      fillReport: {
        filledScalars: ["client_first_name"],
        emptyOptionals: [],
        leftoverBraces: ["is_ca_resident", "unresolved_blank", "young_person_retention_age"],
        loopCounts: {},
      },
    });
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: session.id,
      documentType: "healthcare_directive",
      fileKey: otherKey,
      status: "generated",
    });
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: session.id,
      documentType: "pour_over_will",
      fileKey: zipKey,
      status: "generated",
    });

    try {
      await page.goto("/dashboard/documents");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const trustRow = page.locator('[data-document-type="revocable_trust"]').first();
      const otherRow = page.locator('[data-document-type="healthcare_directive"]').first();
      await expect(trustRow).toBeVisible({ timeout: 15000 });
      await expect(otherRow).toBeVisible();
      await expect(page.getByText(zipKey)).toHaveCount(0);

      const punch = trustRow.getByTestId("trust-draft-punch-list");
      await expect(punch).toBeVisible();
      await expect(punch.getByText(/Needs attention/)).toBeVisible();
      await expect(punch.locator('[data-tag="is_ca_resident"]')).toHaveCount(0);
      await expect(punch.locator('[data-tag="unresolved_blank"]')).toHaveCount(1);
      await expect(punch.locator('[data-tag="young_person_retention_age"]')).toHaveCount(1);

      const ageLink = punch.locator('[data-tag="young_person_retention_age"]');
      await expect(ageLink).toHaveAttribute(
        "href",
        `/dashboard/intakes/${session.id}?section=distribution&field=youngPersonRetentionAge#intake-wizard`,
      );

      const trustDownload = trustRow.getByTestId("trust-draft-download");
      await expect(trustDownload).toHaveAttribute("data-leftover-count", "2");
      await expect(trustDownload).toHaveAttribute(
        "href",
        `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(trustKey)}`,
      );

      const otherDownload = otherRow.getByRole("link", { name: /^Download$/ });
      await expect(otherDownload).toHaveAttribute(
        "href",
        `/api/documents/download?fileKey=${encodeURIComponent(otherKey)}`,
      );

      await trustDownload.click();
      const confirm = page.getByTestId("trust-draft-download-confirm");
      await expect(confirm).toBeVisible();
      await expect(confirm).toHaveAttribute("data-leftover-count", "2");
      await expect(page.getByText("2 leftovers, download anyway")).toBeVisible();
      await expect(page.getByTestId("trust-draft-download-confirm-proceed")).toHaveAttribute(
        "href",
        `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(trustKey)}`,
      );

      await expect(otherRow.getByTestId("trust-draft-fill-report")).toHaveCount(0);
      await expect(otherRow.getByTestId("trust-draft-download")).toHaveCount(0);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: { firmId, fileKey: { in: [trustKey, otherKey, zipKey] } },
      });
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });
});
