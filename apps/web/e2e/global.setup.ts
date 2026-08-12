import { clerkSetup } from '@clerk/testing/playwright';

/**
 * Standard Playwright globalSetup (ESM compatible).
 * Must export default async function (or module with default).
 * Do NOT use `test()` or `test.describe` APIs here — they are not allowed
 * in files loaded via playwright.config globalSetup (causes the "did not expect test() to be called here" error).
 */
export default async function globalSetup() {
  await clerkSetup();
}
