import { test, expect } from "@playwright/test";
import { signInE2E } from "./clerk-e2e-signin";
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
 * Client-detail: generate Trust when this matter has an intake and no Trust,
 * then the #37 punch list + stamp confirm once a Trust row exists.
 * Has-trust: same GenerateTrustDraftCta island in the newest Trust row
 * Download cell, labeled Regenerate — not a second card.
 * Other types stay ungated Download DRAFT.
 */
test.describe("Client detail — Trust draft punch list + stamp confirm", () => {
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
    test.setTimeout(90_000);

    await signInE2E(page);
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
      await expect(page.getByRole("button", { name: /Generate Trust draft/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Download Full ZIP/i })).toHaveCount(0);

      const regenerate = page.getByTestId("trust-draft-generate-cta");
      await expect(regenerate).toHaveCount(1);
      await expect(regenerate).toHaveAttribute("data-mode", "regenerate");
      await expect(regenerate).toHaveText("Regenerate");
      await expect(cleanDownload.locator("xpath=ancestor::td[1]").getByTestId("trust-draft-generate-cta")).toHaveCount(1);
      await expect(leftoverDownload.locator("xpath=ancestor::td[1]").getByTestId("trust-draft-generate-cta")).toHaveCount(0);

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

      const punch = page.getByTestId("trust-draft-punch-list");
      await expect(punch).toBeVisible();
      await expect(punch.getByText(/Needs attention\s*\(2\)/)).toBeVisible();
      await expect(punch.locator('[data-tag="is_ca_resident"]')).toHaveCount(0);
      await expect(punch.locator('[data-tag="unresolved_blank"]')).toHaveCount(1);
      await expect(punch.locator('[data-tag="young_person_retention_age"]')).toHaveCount(1);
      await expect(punch.locator('[data-tag="unresolved_blank"]')).toHaveAttribute(
        "data-punch-door",
        "none",
      );
      await expect(punch.locator('[data-tag="young_person_retention_age"]')).toHaveAttribute(
        "data-punch-door",
        "field",
      );
      await expect(punch.getByText("Still in the draft")).toBeVisible();
      await expect(punch.getByText("Go to field")).toBeVisible();

      const ageLink = punch.locator('[data-tag="young_person_retention_age"]');
      await expect(ageLink).toHaveAttribute(
        "href",
        `/dashboard/intakes/${session.id}?section=distribution&field=youngPersonRetentionAge#intake-wizard`,
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

      await expect(page.getByTestId("trust-draft-fill-report")).toHaveCount(1);
      await expect(otherRow.getByTestId("trust-draft-fill-report")).toHaveCount(0);
      await expect(otherRow.getByTestId("trust-draft-download")).toHaveCount(0);
      await expect(otherRow.getByTestId("trust-draft-generate-cta")).toHaveCount(0);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: { firmId, fileKey: { in: [leftoverKey, cleanKey, otherKey, zipKey] } },
      });
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });

  test("has Trust: Regenerate on newest row (empty-answers reuses generate error); no above-table Generate", async ({
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
      await expect(page.getByText(/Firm ID:/i)).toBeVisible({ timeout: 5000 });
      firmId = ((await page.locator('div:has-text("Firm ID:") code').first().textContent()) || "").trim();
    } catch {
      test.skip(true, "Could not scrape Firm ID for client-detail Trust-regenerate test");
    }
    if (!firmId) {
      test.skip(true, "No Firm ID on dashboard");
    }

    const { prisma, generatedDocumentHelpers } = await import("../src/lib/prisma");
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Client-Trust-Regen ${stamp}`,
        email: `client-trust-regen-${stamp}@test.local`,
      },
    });
    const session = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId,
        status: "in_progress",
        progress: 10,
        answers: {},
      },
    });
    const leftoverKey = `generated/e2e-client-regen-${stamp}/Ada-Lovelace-Trust-DRAFT.docx`;
    await generatedDocumentHelpers.createForFirm(firmId, {
      intakeSessionId: session.id,
      documentType: "revocable_trust",
      fileKey: leftoverKey,
      status: "generated",
      fillReport: {
        filledScalars: [],
        emptyOptionals: [],
        leftoverBraces: ["unresolved_blank"],
        loopCounts: {},
      },
    });

    try {
      await page.goto(`/dashboard/clients/${client.id}`);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      await expect(page.getByRole("button", { name: /Generate Trust draft/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Download Full ZIP/i })).toHaveCount(0);

      const regenerate = page.getByTestId("trust-draft-generate-cta");
      await expect(regenerate).toBeVisible({ timeout: 15000 });
      await expect(regenerate).toHaveAttribute("data-mode", "regenerate");
      await expect(regenerate).toHaveText("Regenerate");
      await expect(page.getByTestId("trust-draft-download")).toBeVisible();
      await expect(page.getByTestId("trust-draft-punch-list")).toHaveCount(1);

      const clientUrl = page.url();
      await regenerate.click();

      await expect(
        page.getByText(/Intake has no answers yet|No template fileKey available|Active firm context required/i),
      ).toBeVisible({ timeout: 20000 });

      expect(page.url()).toBe(clientUrl);
      await expect(page.getByRole("button", { name: /Generate Trust draft/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByTestId("trust-draft-generate-cta")).toHaveCount(1);
      await expect(page.getByTestId("trust-draft-punch-list")).toHaveCount(1);
      await expect(page.getByTestId("trust-draft-fill-report")).toHaveCount(1);
      await expect(page.getByText(/SCAFFOLD ACTION/i)).toHaveCount(0);

      const trustRows = await prisma.generatedDocument.count({
        where: { firmId, intakeSessionId: session.id, documentType: "revocable_trust" },
      });
      expect(trustRows).toBe(1);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: { firmId, fileKey: leftoverKey },
      });
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });

  test("intake + no docs: Generate Trust draft, no bounce-to-intake copy", async ({
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
      await expect(page.getByText(/Firm ID:/i)).toBeVisible({ timeout: 5000 });
      firmId = ((await page.locator('div:has-text("Firm ID:") code').first().textContent()) || "").trim();
    } catch {
      test.skip(true, "Could not scrape Firm ID for client-detail Trust-generate empty-docs test");
    }
    if (!firmId) {
      test.skip(true, "No Firm ID on dashboard");
    }

    const { prisma } = await import("../src/lib/prisma");
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Client-Trust-Empty ${stamp}`,
        email: `client-trust-empty-${stamp}@test.local`,
      },
    });
    const session = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId,
        status: "in_progress",
        progress: 0,
        answers: {},
      },
    });

    try {
      await page.goto(`/dashboard/clients/${client.id}`);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      await expect(page.getByText(/No Trust draft yet\. Open the intake/i)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Trust draft/i })).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId("trust-draft-generate-cta")).toHaveAttribute("data-mode", "generate");
      await expect(page.getByRole("button", { name: /^Regenerate$/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
    } finally {
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });

  test("intake + no Trust: Generate Trust draft (same action errors); leftover .docx stay ungated", async ({
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
      await expect(page.getByText(/Firm ID:/i)).toBeVisible({ timeout: 5000 });
      firmId = ((await page.locator('div:has-text("Firm ID:") code').first().textContent()) || "").trim();
    } catch {
      test.skip(true, "Could not scrape Firm ID for client-detail Trust-generate test");
    }
    if (!firmId) {
      test.skip(true, "No Firm ID on dashboard");
    }

    const { prisma, generatedDocumentHelpers } = await import("../src/lib/prisma");
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        firmId,
        displayName: `E2E-Client-Trust-Gen ${stamp}`,
        email: `client-trust-gen-${stamp}@test.local`,
      },
    });
    const session = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId,
        status: "in_progress",
        progress: 10,
        answers: {},
      },
    });
    const otherKey = `generated/e2e-client-gen-hc-${stamp}/Ada-Lovelace-Healthcare-DRAFT.docx`;
    const zipKey = `generated/e2e-client-gen-pkg-${stamp}/Ada-Lovelace-Full-Estate-Plan-Package-DRAFT.zip`;
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

      await expect(page.getByText(/No Trust draft yet\. Open the intake/i)).toHaveCount(0);
      const generateBtn = page.getByRole("button", { name: /Generate Trust draft/i });
      await expect(generateBtn).toBeVisible({ timeout: 15000 });
      await expect(generateBtn).toHaveAttribute("data-mode", "generate");
      await expect(page.getByRole("button", { name: /^Regenerate$/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Download Full ZIP/i })).toHaveCount(0);

      const otherRow = page.locator('[data-document-type="healthcare_directive"]').first();
      await expect(otherRow).toBeVisible();
      const otherDownload = otherRow.getByRole("link", { name: /Download DRAFT/ });
      await expect(otherDownload).toHaveAttribute(
        "href",
        `/api/documents/download?fileKey=${encodeURIComponent(otherKey)}`,
      );
      await expect(page.getByText(zipKey)).toHaveCount(0);
      await expect(page.locator('[data-document-type="pour_over_will"]')).toHaveCount(0);
      await expect(page.getByTestId("trust-draft-punch-list")).toHaveCount(0);

      await generateBtn.click();

      await expect(
        page.getByText(/Intake has no answers yet|No template fileKey available|Active firm context required/i),
      ).toBeVisible({ timeout: 20000 });

      await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Download Full ZIP/i })).toHaveCount(0);
      await expect(otherRow.getByRole("link", { name: /Download DRAFT/ })).toBeVisible();
      await expect(otherRow.getByTestId("trust-draft-download")).toHaveCount(0);
      await expect(page.getByTestId("trust-draft-punch-list")).toHaveCount(0);
      await expect(page.getByTestId("trust-draft-fill-report")).toHaveCount(0);
      await expect(page.getByText(/SCAFFOLD ACTION/i)).toHaveCount(0);
      await expect(page.getByText(/Full Estate Plan Package generated/i)).toHaveCount(0);
    } finally {
      await prisma.generatedDocument.deleteMany({
        where: { firmId, fileKey: { in: [otherKey, zipKey] } },
      });
      await prisma.intakeSession.delete({ where: { id: session.id } }).catch(() => {});
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    }
  });
});
