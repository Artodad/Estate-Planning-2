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
 * Intakes list paints leftoverCountFromFillReport on the existing row.
 * Trust + CA answers + 3 leftover braces → "2 leftovers". Clean Trust → "clean".
 * No Trust (HC only) stays quiet. A later Will must not hide Trust N.
 */
test.describe("Intakes list — leftover N on the existing row", () => {
  const hasE2ECredentials = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

  if (!hasE2ECredentials) {
    test.skip(
      true,
      "E2E Clerk credentials (E2E_CLERK_USER_IDENTIFIER + PASSWORD) are not present in environment",
    );
  }

  test("Trust leftovers paint N; clean is clean; no Trust stays quiet; click opens review", async ({
    page,
  }) => {
    test.setTimeout(90_000);

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
    const leftoverClient = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Intakes-Leftover ${stamp}`,
        email: `intakes-leftover-${stamp}@test.local`,
      },
    });
    const cleanClient = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Intakes-Clean ${stamp}`,
        email: `intakes-clean-${stamp}@test.local`,
      },
    });
    const hcClient = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Intakes-HC ${stamp}`,
        email: `intakes-hc-${stamp}@test.local`,
      },
    });

    const caAnswers = {
      personal: {
        client: { firstName: "Ada", lastName: "Lovelace" },
        maritalStatus: "single",
        isCAResident: true,
      },
    };

    const leftoverSession = await prisma.intakeSession.create({
      data: {
        clientId: leftoverClient.id,
        firmId,
        status: "completed",
        progress: 100,
        answers: caAnswers,
      },
    });
    const cleanSession = await prisma.intakeSession.create({
      data: {
        clientId: cleanClient.id,
        firmId,
        status: "completed",
        progress: 100,
        answers: caAnswers,
      },
    });
    const hcSession = await prisma.intakeSession.create({
      data: {
        clientId: hcClient.id,
        firmId,
        status: "in_progress",
        progress: 40,
        answers: caAnswers,
      },
    });

    const leftoverTrustKey = `generated/e2e-intakes-leftover-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    const leftoverWillKey = `generated/e2e-intakes-will-${stamp}/Ada-Lovelace-Will-DRAFT.docx`;
    const cleanTrustKey = `generated/e2e-intakes-clean-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    const hcKey = `generated/e2e-intakes-hc-${stamp}/Ada-Lovelace-Healthcare-DRAFT.docx`;

    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: leftoverSession.id,
      documentType: "revocable_trust",
      fileKey: leftoverTrustKey,
      status: "generated",
      fillReport: {
        filledScalars: ["client_first_name"],
        emptyOptionals: [],
        leftoverBraces: ["is_ca_resident", "unresolved_blank", "young_person_retention_age"],
        loopCounts: {},
      },
    });
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: leftoverSession.id,
      documentType: "pour_over_will",
      fileKey: leftoverWillKey,
      status: "generated",
    });
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: cleanSession.id,
      documentType: "revocable_trust",
      fileKey: cleanTrustKey,
      status: "generated",
      fillReport: {
        filledScalars: ["client_first_name"],
        emptyOptionals: [],
        leftoverBraces: [],
        loopCounts: {},
      },
    });
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: hcSession.id,
      documentType: "healthcare_directive",
      fileKey: hcKey,
      status: "generated",
    });

    try {
      await page.goto("/dashboard/intakes");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const leftoverRow = page.locator(`[data-intake-id="${leftoverSession.id}"]`);
      const cleanRow = page.locator(`[data-intake-id="${cleanSession.id}"]`);
      const hcRow = page.locator(`[data-intake-id="${hcSession.id}"]`);

      await expect(leftoverRow).toBeVisible({ timeout: 15000 });
      await expect(cleanRow).toBeVisible();
      await expect(hcRow).toBeVisible();

      const leftoverN = leftoverRow.getByTestId("intake-leftover");
      await expect(leftoverN).toBeVisible();
      await expect(leftoverN).toHaveAttribute("data-leftover-count", "2");
      await expect(leftoverN).toHaveText("2 leftovers");

      const cleanN = cleanRow.getByTestId("intake-leftover");
      await expect(cleanN).toBeVisible();
      await expect(cleanN).toHaveAttribute("data-leftover-count", "0");
      await expect(cleanN).toHaveText("clean");

      await expect(hcRow.getByTestId("intake-leftover")).toHaveCount(0);
      await expect(hcRow.getByText(/leftover/i)).toHaveCount(0);
      await expect(hcRow.getByText(/^clean$/)).toHaveCount(0);

      await leftoverRow.click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/intakes/${leftoverSession.id}`));
      const punch = page.getByTestId("trust-draft-punch-list");
      await expect(punch).toBeVisible({ timeout: 15000 });
      await expect(punch.getByText(/Needs attention\s*\(2\)/)).toBeVisible();

      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await expect(page.getByRole("heading", { name: /leftover/i })).toHaveCount(0);
      await expect(page.getByTestId("intake-leftover")).toHaveCount(0);
      await expect(page.getByText(/2 leftovers/)).toHaveCount(0);

      await page.goto("/dashboard/clients");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await expect(page.getByText(leftoverClient.displayName)).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("intake-leftover")).toHaveCount(0);
      await expect(page.getByText(/2 leftovers/)).toHaveCount(0);

      await page.goto("/dashboard/documents");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const trustRow = page.locator('[data-document-type="revocable_trust"]').first();
      await expect(trustRow).toBeVisible({ timeout: 15000 });
      await expect(page.locator("th", { hasText: /leftover/i })).toHaveCount(0);
      await expect(page.getByTestId("intake-leftover")).toHaveCount(0);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: {
          firmId,
          fileKey: { in: [leftoverTrustKey, leftoverWillKey, cleanTrustKey, hcKey] },
        },
      });
      await prisma.intakeSession.deleteMany({
        where: { id: { in: [leftoverSession.id, cleanSession.id, hcSession.id] } },
      }).catch(() => {});
      await prisma.client.deleteMany({
        where: { id: { in: [leftoverClient.id, cleanClient.id, hcClient.id] } },
      }).catch(() => {});
    }
  });
});
