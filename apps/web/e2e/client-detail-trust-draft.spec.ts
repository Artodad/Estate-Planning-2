import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
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
 * Client-detail revocable_trust download: same stamp confirm as Documents (#32).
 * No punch list / JUMP_TO on this page. Other types stay ungated.
 */
test.describe("Client detail — Trust draft stamp confirm", () => {
  const hasE2ECredentials = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

  if (!hasE2ECredentials) {
    test.skip(
      true,
      "E2E Clerk credentials (E2E_CLERK_USER_IDENTIFIER + PASSWORD) are not present in environment",
    );
  }

  test("stored revocable_trust download N matches leftoverCount; other types stay ungated", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: E2E_IDENTIFIER!,
        password: E2E_PASSWORD!,
      },
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    if (page.url().includes("/sign-in")) {
      throw new Error("Still on sign-in after clerk.signIn — check E2E Clerk credentials / org membership.");
    }

    let firmId = "";
    try {
      await expect(page.getByText(/Firm ID:/i)).toBeVisible({ timeout: 5000 });
      firmId = ((await page.locator('div:has-text("Firm ID:") code').first().textContent()) || "").trim();
    } catch {
      test.skip(true, "Could not scrape Firm ID for client-detail Trust-draft test");
    }
    if (!firmId) {
      test.skip(true, "No Firm ID on dashboard");
    }

    const { prisma, generatedDocumentHelpers } = await import("../src/lib/prisma");
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Client-Trust ${stamp}`,
        email: `client-trust-${stamp}@test.local`,
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
    const leftoverKey = `generated/e2e-client-trust-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    const cleanKey = `generated/e2e-client-trust-clean-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    const otherKey = `generated/e2e-client-hc-${stamp}/Ada-Lovelace-Healthcare-DRAFT.docx`;
    const zipKey = `generated/e2e-client-pkg-${stamp}/Ada-Lovelace-Full-Estate-Plan-Package-DRAFT.zip`;
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: session.id,
      documentType: "revocable_trust",
      fileKey: leftoverKey,
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
      documentType: "revocable_trust",
      fileKey: cleanKey,
      status: "generated",
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
      await page.goto(`/dashboard/clients/${client.id}`);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const leftoverDownload = page.locator(
        `[data-testid="trust-draft-download"][data-leftover-count="2"]`,
      );
      const cleanDownload = page.locator(
        `[data-testid="trust-draft-download"][data-leftover-count="0"]`,
      );
      const otherRow = page.locator('[data-document-type="healthcare_directive"]').first();

      await expect(leftoverDownload).toBeVisible({ timeout: 15000 });
      await expect(cleanDownload).toBeVisible();
      await expect(otherRow).toBeVisible();
      await expect(page.getByText(zipKey)).toHaveCount(0);
      await expect(page.locator('[data-document-type="pour_over_will"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Download Full ZIP/i })).toHaveCount(0);

      await expect(leftoverDownload).toHaveAttribute(
        "href",
        `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(leftoverKey)}`,
      );
      await expect(cleanDownload).toHaveAttribute(
        "href",
        `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(cleanKey)}`,
      );

      const otherDownload = otherRow.getByRole("link", { name: /Download DRAFT/ });
      await expect(otherDownload).toHaveAttribute(
        "href",
        `/api/documents/download?fileKey=${encodeURIComponent(otherKey)}`,
      );

      await leftoverDownload.click();
      const confirm = page.getByTestId("trust-draft-download-confirm");
      await expect(confirm).toBeVisible();
      await expect(confirm).toHaveAttribute("data-leftover-count", "2");
      await expect(page.getByText("2 leftovers, download anyway")).toBeVisible();
      await expect(page.getByTestId("trust-draft-download-confirm-proceed")).toHaveAttribute(
        "href",
        `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(leftoverKey)}`,
      );

      await page.getByRole("button", { name: /^Cancel$/ }).click();
      await expect(confirm).toHaveCount(0);

      await expect(page.getByTestId("trust-draft-punch-list")).toHaveCount(0);
      await expect(page.getByTestId("trust-draft-fill-report")).toHaveCount(0);
      await expect(otherRow.getByTestId("trust-draft-download")).toHaveCount(0);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: { firmId, fileKey: { in: [leftoverKey, cleanKey, otherKey, zipKey] } },
      });
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });
});
