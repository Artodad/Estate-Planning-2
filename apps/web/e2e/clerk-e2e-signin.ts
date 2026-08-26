import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

/**
 * Ticket sign-in for CI. Password strategy is rejected when the secret
 * password is in a breach list ("Password has been found in an online data breach").
 * Requires CLERK_SECRET_KEY + E2E_CLERK_USER_IDENTIFIER (email).
 * Must load Clerk on an unprotected page first.
 */
export async function signInE2E(page: Page): Promise<void> {
  const email = process.env.E2E_CLERK_USER_IDENTIFIER;
  if (!email) {
    throw new Error("E2E_CLERK_USER_IDENTIFIER is required");
  }
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: email });
}
