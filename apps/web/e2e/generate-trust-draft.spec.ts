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
 * Proves the intake UI exposes one "Generate Trust draft" button that calls
 * generateDocumentForIntake (not the 8-doc ZIP / scaffold banner).
 *
 * Fresh intakes have empty answers, so the action returns a structured error.
 * That error is the proof the real Server Action ran.
 */
test.describe("Generate Trust draft — intake UI calls generateDocumentForIntake", () => {
  const hasE2ECredentials = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

  if (!hasE2ECredentials) {
    test.skip(
      true,
      "E2E Clerk credentials (E2E_CLERK_USER_IDENTIFIER + PASSWORD) are not present in environment",
    );
  }

  test("intake page button calls generateDocumentForIntake (empty-answers error, not scaffold)", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/dashboard/clients", { waitUntil: "domcontentloaded" });
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: E2E_IDENTIFIER!,
        password: E2E_PASSWORD!,
      },
    });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.goto("/dashboard/clients", { waitUntil: "networkidle" });

    if (page.url().includes("/sign-in")) {
      throw new Error("Still on sign-in after clerk.signIn — check E2E Clerk credentials / org membership.");
    }

    const uniqueSuffix = Date.now().toString(36).slice(2, 8);
    const displayName = `Trust Draft Client ${uniqueSuffix}`;
    const email = `e2e-trust-draft-${uniqueSuffix}@test.local`;

    const newClientBtn = page.getByRole("button", { name: /^\+ New Client$/ }).first();
    await expect(newClientBtn).toBeVisible({ timeout: 12000 });
    await newClientBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.locator("#displayName").fill(displayName);
    await page.locator("#email").fill(email);
    await page.locator("#firstName").fill("Trust");
    await page.locator("#lastName").fill("Draft");
    await page.getByRole("button", { name: /Create Client/i }).click();
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    await expect(page.locator("tr", { hasText: displayName })).toBeVisible({
      timeout: 15000,
    });

    const intakeBtn = page
      .locator("tr", { hasText: displayName })
      .getByRole("button", { name: /^Intake$/i });
    await expect(intakeBtn).toBeVisible({ timeout: 8000 });
    await intakeBtn.click();
    await expect(page).toHaveURL(/\/dashboard\/intakes\//, { timeout: 15000 });

    const generateBtn = page.getByRole("button", { name: /Generate Trust draft/i });
    await expect(generateBtn).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Generate Full Estate Plan/i })).toHaveCount(0);

    await generateBtn.click();

    await expect(
      page.getByText(/Intake has no answers yet|No template fileKey available|Active firm context required/i),
    ).toBeVisible({ timeout: 20000 });

    await expect(page.getByText(/SCAFFOLD ACTION/i)).toHaveCount(0);
    await expect(page.getByText(/Full Estate Plan Package generated/i)).toHaveCount(0);
  });
});
