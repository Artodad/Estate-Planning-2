/* eslint-disable turbo/no-undeclared-env-vars -- E2E test credentials (loaded from .env, never in builds) */
import { expect, test } from "@playwright/test";

import { signInE2E } from "./clerk-e2e-signin";

const SUBLINE = "Intake and review for estate planning matters.";

const KILLED_COPY = [
  /Phase 0/i,
  /Create account/i,
  /You are signed in/i,
  /Multi-tenant/i,
  /SaaS/i,
  /XState/i,
  /docxtemplater/i,
  /Firm-ready auth/i,
  /Adaptive intake/i,
  /Document fidelity/i,
];

test.describe("signed-out homepage door", () => {
  test("shows quiet copy, paper door, and Sign in to /sign-in", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      SUBLINE,
    );

    await expect(
      page.getByRole("heading", { name: "Trust drafts", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(SUBLINE)).toBeVisible();
    await expect(page.getByText("Estate Planning Engine")).toBeVisible();

    const signInLinks = page.getByRole("link", { name: "Sign in" });
    await expect(signInLinks).toHaveCount(2);
    await expect(signInLinks.first()).toHaveAttribute("href", "/sign-in");
    await expect(signInLinks.last()).toHaveAttribute("href", "/sign-in");

    await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign up/i })).toHaveCount(0);

    for (const pattern of KILLED_COPY) {
      await expect(page.getByText(pattern)).toHaveCount(0);
    }

    await expect(page.locator("[data-slot='card']")).toHaveCount(0);

    const door = page.locator("main").locator("xpath=..");
    await expect(door).toHaveCSS("background-color", "rgb(244, 241, 234)");
    await expect(signInLinks.last()).toHaveCSS(
      "background-color",
      "rgb(154, 123, 50)",
    );
    await expect(signInLinks.last()).toHaveCSS("color", "rgb(244, 241, 234)");

    await signInLinks.last().click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("signed-out header has Sign in only; /sign-up still exists", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header.getByRole("link", { name: /sign up/i })).toHaveCount(0);
    await expect(header.getByRole("button", { name: /sign up/i })).toHaveCount(
      0,
    );
    await expect(header.getByText(/Multi-tenant/i)).toHaveCount(0);

    const response = await page.goto("/sign-up");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/sign-up/);
  });

  test("signed-in / redirects to /dashboard", async ({ page }) => {
    if (!process.env.E2E_CLERK_USER_IDENTIFIER) {
      test.skip(true, "E2E_CLERK_USER_IDENTIFIER is required");
    }

    await signInE2E(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
    await expect(
      page.getByRole("heading", { name: "Trust drafts" }),
    ).toHaveCount(0);
  });
});
