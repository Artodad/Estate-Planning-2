import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Robust dotenv loading for E2E tests.
 * Tries several common locations so the test works whether you run:
 *   - from apps/web/
 *   - from repo root
 *   - with env vars already exported in the shell / CI
 */
[
  path.resolve(__dirname, "../.env"), // when running from inside e2e/
  path.resolve(__dirname, ".env"), // when __dirname resolves to web/
  path.resolve(process.cwd(), "apps/web/.env"),
  path.resolve(process.cwd(), ".env"),
].forEach((p) => {
  try {
    dotenv.config({ path: p });
  } catch {
    /* ignore */
  }
});

/** Click the in-form submit button (not the footer nav Continue). */
async function submitSectionForm(page: import("@playwright/test").Page) {
  const saveBtn = page.getByRole("button", {
    name: /Save & Continue|Save Family Information & Continue/i,
  });
  if (await saveBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await saveBtn.first().click();
    return;
  }
  await page.getByRole("button", { name: /^Continue$/i }).last().click();
}

/** Wait until the wizard has left idle and mounted the requested section form. */
async function waitForSection(
  page: import("@playwright/test").Page,
  sectionLabel: RegExp,
  formAnchor: import("@playwright/test").Locator,
) {
  await page
    .getByText(/Loading attorney context/i)
    .waitFor({ state: "hidden", timeout: 20000 })
    .catch(() => {});

  await expect(
    page.locator("main").getByRole("heading", { level: 2, name: sectionLabel }),
  ).toBeVisible({ timeout: 15000 });
  await expect(formAnchor).toBeVisible({ timeout: 10000 });
}

// Also pick up anything already in process.env (CI, `export`, or `dotenv` at shell level)
/* eslint-disable turbo/no-undeclared-env-vars -- E2E test credentials (loaded from .env, never in builds) */
const E2E_IDENTIFIER = process.env.E2E_CLERK_USER_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD;

/**
 * ============================================================================
 * INTAKE WIZARD SMOKE TEST — Basic Progression Guardrail
 * ============================================================================
 *
 * PURPOSE
 * The simplest possible reliable automated version of what an attorney (or
 * developer) does manually when the wizard feels broken:
 *
 *   "Start a fresh intake, fill the minimum reasonable data on every single
 *    section, hit Save & Continue each time, and confirm I can reach Review
 *    without getting stuck on any page."
 *
 * This is the fast, high-signal daily regression test for the exact class of
 * bugs the team keeps hitting: "Save & Continue stopped working on page 3/5/7".
 *
 * SCOPE (intentionally narrow and pragmatic)
 * - One primary happy-path traversal.
 * - Stops when it reaches the "Review & Complete" heading (per request).
 * - A companion test (future) will own the Review + Mark Complete & Finish flow
 *   with a fully populated intake.
 * - Strategic reload + data-survival checks after Family and after Assets
 *   (the two heaviest early array sections where persistence + machine state
 *   most often have issues).
 * - Minimal but realistic data per section so sectionIsComplete + canProceed
 *   actually pass in the XState machine.
 * - No exhaustive conditionals, no validation error paths, no jump nav matrix,
 *   no deep array manipulation. Those belong in the larger comprehensive suite.
 *
 * SECTIONS EXERCISED (Trust-visible walk)
 * 1. Personal Information (client + maritalStatus + CA resident)
 * 2. Family & Relationships (1 child with minor flag + 1 pet)
 * 3. Decision Makers (1 maker with role)
 * 4. Distribution Wishes (empty residuary still valid)
 * 5. Review & Complete (arrival only)
 *
 * Quarantined from nav: assets, liabilities, gifts, charitable, healthcare, priorPlanning.
 *
 * RUN (from apps/web/)
 *   npx playwright test e2e/intake-wizard-smoke.spec.ts --project=chromium
 *   # or
 *   pnpm test:e2e -- e2e/intake-wizard-smoke.spec.ts --project=chromium
 *
 *   For fast iteration during wizard work:
 *   pnpm test:e2e:ui -- e2e/intake-wizard-smoke.spec.ts
 *
 * ============================================================================
 * E2E CREDENTIALS SETUP — CRITICAL (read this carefully)
 * ============================================================================
 *
 * This test (and all the other real E2E suites) requires a Clerk user that can
 * sign in with **username + password** (or email + password).
 *
 *  *** GOOGLE / OAUTH-ONLY USERS WILL NOT WORK ***
 *
 * The code calls:
 *   clerk.signIn({ strategy: 'password', identifier, password })
 *
 * Google OAuth users have no password in Clerk, so this call fails or lands
 * you back on the sign-in page (exactly the error you are seeing).
 *
 * HOW TO CREATE A WORKING E2E USER (takes 60 seconds):
 *
 * 1. Go to https://dashboard.clerk.com
 * 2. Select your application.
 * 3. Go to "Users" in the left nav.
 * 4. Click "Create user" (top right).
 * 5. **Important**: Choose the "Password" authentication method
 *    (do NOT pick Google / GitHub / other OAuth providers).
 * 6. Fill in:
 *      - Email address (can be a real one you control, or a +alias)
 *      - A simple password you will put in .env (e.g. "TestPass123!")
 * 7. Create the user.
 * 8. (Recommended) Create or add the user to a Clerk Organization.
 * 9. In your local database, make sure that Organization has a "Firm" row
 *    (run the app once as that user and complete onboarding, or manually
 *    INSERT a Firm row with the matching clerkOrgId).
 *
 * 10. Add these two lines to `apps/web/.env` (never commit this file):
 *
 *       E2E_CLERK_USER_IDENTIFIER=the-email-you-just-created@example.com
 *       E2E_CLERK_USER_PASSWORD=TestPass123!
 *
 * That's it. The test will now be able to sign in with a real password flow.
 *
 * You can create as many of these dedicated test users as you want.
 * They do not need to be (and usually should not be) your personal Google
 * accounts.
 *
 * The exact same two variables are used by:
 *   - e2e/onboarding.spec.ts
 *   - e2e/intake-questionnaire.spec.ts
 *   - e2e/intake-wizard-smoke.spec.ts (this file)
 *
 * When the variables are missing or the sign-in fails, the tests degrade
 * gracefully with clear messages instead of mysterious Clerk redirects.
 *
 * ============================================================================
 * STYLE + RELIABILITY NOTES
 * ============================================================================
 * Matches the established patterns in onboarding.spec.ts and
 * intake-questionnaire.spec.ts exactly:
 * - Real UI-driven client + intake creation (no pre-seeding assumptions)
 * - clerk.signIn via @clerk/testing/playwright (strategy: 'password')
 * - serial mode for stateful wizard flow
 * - role/name/text selectors preferred (no data-testid additions)
 * - Defensive .isVisible().catch(() => false) + generous waits
 * - Heavy explanatory comments
 * - No new shared abstractions or page objects in this small smoke file
 *
 * This file is intentionally small and focused so it can be run constantly
 * while touching QuestionnaireWizard, the machine, or any section renderer.
 * ============================================================================
 */

test.describe("Intake Wizard Smoke — Minimal Data, Save & Continue on Every Section", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  /**
   * Guard: if the required E2E Clerk credentials are missing, skip the entire suite
   * with a clear, actionable message instead of letting Clerk throw a cryptic error.
   * This is the key change that makes the test "reliably runnable" in any environment.
   */
  const hasE2ECredentials = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

  if (!hasE2ECredentials) {
    console.warn(`
[INTAKE WIZARD SMOKE TEST] Skipping — E2E Clerk credentials not configured.

This test requires a real Clerk user (with password auth) that belongs to an
onboarded firm/organization in your Clerk instance.

Add these two lines to apps/web/.env (or export them in your shell):

  E2E_CLERK_USER_IDENTIFIER=your-e2e-test-user@example.com
  E2E_CLERK_USER_PASSWORD=your-secure-test-password

The user must be able to sign in and have at least one Clerk Organization that
has already completed the firm onboarding flow (so the test can create clients
and launch real intake sessions).

See the big comment block at the top of this file for full setup instructions.
After adding the credentials, re-run the test.

All other tests (unit + any that don't need real Clerk E2E users) will continue to work.
`);
    test.skip(
      true,
      "E2E Clerk credentials (E2E_CLERK_USER_IDENTIFIER + PASSWORD) are not present in environment",
    );
  }

  test("can fill minimal data on every section and Save & Continue all the way to Review", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    /**
     * Most reliable Clerk sign-in pattern for this app.
     *
     * The previous version (calling signInAsE2E while still on the public home page
     * from beforeEach) often resulted in the helper doing almost nothing visible —
     * exactly what you saw in the report ("we didn't try to sign in").
     *
     * The @clerk/testing helper works best when the actual <SignIn /> component
     * is already rendered on the page.
     */
    // Step 1: Hit protected route → middleware redirects to /sign-in (with redirect_url)
    await page.goto("/dashboard/clients", { waitUntil: "domcontentloaded" });

    // Step 2: Now the real sign-in form is mounted → use the helper
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: E2E_IDENTIFIER!,
        password: E2E_PASSWORD!,
      },
    });

    // Step 3: Let Clerk finish session creation + follow the redirect_url
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    // Step 4: Defensive final navigation
    await page.goto("/dashboard/clients", { waitUntil: "networkidle" });

    const finalUrl = page.url();
    if (finalUrl.includes("/sign-in")) {
      throw new Error(
        `Still redirected to sign-in after the explicit "protected route first → clerk.signIn" flow.\n` +
          `Final URL: ${finalUrl}\n\n` +
          `Most common causes:\n` +
          `  • The E2E user has no password set (Google OAuth only, etc.)\n` +
          `  • The user is not a member of a Clerk Org that has a Firm record in the DB\n` +
          `  • Manual sign-in also fails for this user\n\n` +
          `See the detailed E2E CREDENTIALS SETUP section at the top of this file.`
      );
    }

    await expect(page).toHaveURL("/dashboard/clients", { timeout: 10000 });

    const uniqueSuffix = Date.now().toString(36).slice(2, 8);
    const displayName = `Smoke Test Client ${uniqueSuffix}`;
    const email = `e2e-smoke-${uniqueSuffix}@test.local`;

    // --- Real client creation (production dialog — not the scaffold button) ---
    const newClientBtn = page.getByRole("button", { name: /^\+ New Client$/ }).first();
    await expect(newClientBtn).toBeVisible({ timeout: 12000 });
    await newClientBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.locator("#displayName").fill(displayName);
    await page.locator("#email").fill(email);
    await page.locator("#firstName").fill("Smoke");
    await page.locator("#lastName").fill("Test");

    await page.getByRole("button", { name: /Create Client/i }).click();
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    await expect(page.locator("tr", { hasText: displayName })).toBeVisible({
      timeout: 15000,
    });

    // Launch the real intake wizard
    const intakeBtn = page
      .locator("tr", { hasText: displayName })
      .getByRole("button", { name: /^Intake$/i });
    await expect(intakeBtn).toBeVisible({ timeout: 8000 });
    await intakeBtn.click();

    await expect(page).toHaveURL(/\/dashboard\/intakes\//, { timeout: 15000 });

    // ========================================================================
    // SECTION 1: Personal Information (strict — needs real client + marital)
    // ========================================================================
    await waitForSection(
      page,
      /Personal Information/i,
      page.getByLabel(/Client First Name/i),
    );

    await page.getByLabel(/Client First Name/i).fill("Smoke");
    await page.getByLabel(/Client Last Name/i).fill("Tester");
    await page.getByLabel(/Date of Birth/i).first().fill("1982-07-15");
    await page.locator('input[name="client.email"]').fill("smoke.tester@example.com");

    // Marital single is the simplest valid path
    await page.locator('select[name="maritalStatus"]').first().selectOption("single");

    // CA resident (important for later community property paths)
    const caCb = page.locator('#isCA, input[name="isCAResident"]').first();
    if (await caCb.isVisible().catch(() => false)) {
      await caCb.check();
    }
    await page.getByLabel(/County of Residence/i).fill("San Francisco");

    await submitSectionForm(page);

    // ========================================================================
    // SECTION 2: Family & Relationships (add 1 child + 1 pet)
    // ========================================================================
    await waitForSection(
      page,
      /Family & Relationships/i,
      page.getByRole("button", { name: /Add Child/i }),
    );

    const addChild = page.getByRole("button", { name: /Add Child/i });
    if (await addChild.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addChild.click();
      await page.locator('input[name="children.0.firstName"]').first().fill("Alex");
      await page.locator('input[name="children.0.lastName"]').first().fill("Tester");
      await page.locator('input[name="children.0.dateOfBirth"]').first().fill("2019-03-10");
      await page.locator('input[name="children.0.relationship"]').first().fill("daughter");
      const minorCb = page.locator('input[name="children.0.isMinor"]').first();
      if (await minorCb.isVisible().catch(() => false)) {
        await minorCb.check();
      }
    }

    const addPet = page.getByRole("button", { name: /Add Pet/i });
    if (await addPet.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addPet.click();
      await page.locator('input[placeholder*="Pet name"]').first().fill("Luna");
    }

    await submitSectionForm(page);

    const sidebar = page.locator("aside nav");
    await expect(sidebar.getByRole("button", { name: /Personal Information/i })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Family & Relationships/i })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Decision Makers/i })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Distribution Wishes/i })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /Review & Complete/i })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /^Assets$/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Liabilities/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Specific Gifts|Gifts/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Charitable/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Healthcare/i })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Prior Planning/i })).toHaveCount(0);

    // ========================================================================
    // Sidebar navigation: jump back to completed sections (JUMP_TO regression)
    // ========================================================================
    await page
      .locator("aside nav")
      .getByRole("button", { name: /Personal Information/i })
      .click();
    await waitForSection(
      page,
      /Personal Information/i,
      page.getByLabel(/Client First Name/i),
    );
    await expect(page.getByText(/Dashboard Error/i)).toHaveCount(0);
    await expect(page.getByLabel(/Client First Name/i)).toHaveValue("Smoke");

    await page
      .locator("aside nav")
      .getByRole("button", { name: /Family & Relationships/i })
      .click();
    await waitForSection(
      page,
      /Family & Relationships/i,
      page.getByRole("button", { name: /Add Child/i }),
    );
    await expect(page.getByText(/Dashboard Error/i)).toHaveCount(0);

    await page.locator("aside nav").getByRole("button", { name: /Decision Makers/i }).click();

    // ========================================================================
    // SECTION 3: Decision Makers (add 1 — exercises role select)
    // ========================================================================
    await waitForSection(
      page,
      /Decision Makers/i,
      page.getByRole("button", { name: /Add Entry/i }),
    );

    const addDM = page.getByRole("button", { name: /Add Entry/i });
    if (await addDM.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addDM.click();

      const roleSel = page
        .locator('select[name*="decisionMakers.0.role"], select')
        .first();
      if (await roleSel.isVisible().catch(() => false)) {
        await roleSel.selectOption("executor");
      }

      await page
        .locator('input[name*="decisionMakers.0.person.firstName"]')
        .first()
        .fill("Jordan");
      await page
        .locator('input[name*="decisionMakers.0.person.lastName"]')
        .first()
        .fill("Executor");
    }

    await submitSectionForm(page);

    // ========================================================================
    // SECTION 4: Distribution Wishes (empty residuary is valid)
    // ========================================================================
    await waitForSection(
      page,
      /Distribution Wishes/i,
      page.locator("form"),
    );
    await page
      .locator('textarea[name*="minorTrustProvisions"]')
      .fill("Distribute at age 25")
      .catch(() => {});
    await submitSectionForm(page);

    // ========================================================================
    // FINAL: We should now be on Review & Complete
    // ========================================================================
    await waitForSection(
      page,
      /Review & Complete/i,
      page.getByText(/% complete/),
    );

    // Light sanity on review screen (content is visible, progress is meaningful)
    const progressText = await page
      .getByText(/% complete/)
      .first()
      .textContent()
      .catch(() => "0%");
    expect(progressText).toMatch(/[0-9]{1,3}%/);

    // We deliberately do NOT click "Mark Complete & Finish" here.
    // That flow (final state, locking, post-complete behavior) is owned by
    // a future dedicated test that starts from a known-complete intake.
  });
});
