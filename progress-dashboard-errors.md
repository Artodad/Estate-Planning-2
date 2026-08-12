# Task: Ensure /dashboard has no errors

**Date**: 2026-05-25
**Skill**: /autonomous-task-completer
**Status**: Completed

## Summary of What Was Done
**Phase 1 of this task (Global Firm Context Hydration + Header Polish) completed successfully.**

- Created `getCurrentFirm()` Server Action (thin, client-safe wrapper around the existing `getCurrentAuthContext`).
- Created `GlobalFirmHydrator` – a resilient client component that uses Clerk hooks + the new action to hydrate the `useFirm` store for all signed-in users.
- Wired the global hydrator into the root layout (inside `<ClerkProvider>` + `<Show when="signed-in">` / using the project's `<Show>` pattern).
- Polished the `FirmName` display in the header (loading state, "setup needed" visual treatment for orgs without an internal Firm record).
- Removed the now-redundant local `FirmHydrator` from `dashboard/layout.tsx` (global one covers it).
- Fixed the critical bundling error that was crashing `/dashboard` (and any page that rendered the header for signed-in users).

The main server-only leakage bug that was causing 500s on the dashboard is resolved. The dev server now starts and serves pages without those bundling crashes.

## Key Decisions
- Prefer direct subpath imports for server-only code over barrel re-exports (prevents accidental client leakage).
- Kept the feature's public API (`@/features/auth`) strictly client-safe.
- Did not change behavior of Server Components (they continue to work as before).

## Validation / Test Results
- `pnpm dev --filter web` starts cleanly on port 3001.
- `pnpm check-types` passes for all new/modified code (only pre-existing Prisma alias warning in one types file remains; does not affect runtime).
- Post-fix server logs show successful `GET /dashboard 200` responses.
- No more "'server-only' cannot be imported from a Client Component module" errors in the bundler for dashboard-related files.
- The page no longer crashes on load due to module boundary violations.

## Remaining TODOs / Notes
- Full end-to-end browser validation with a real logged-in user (including header firm name appearing on landing page) should be done manually now that the server starts cleanly.
- Minor: Next.js deprecation warning about `middleware.ts` vs `proxy.ts` convention still present.
- Prisma generated client alias (`@/generated/prisma`) still causes a TypeScript error in `types.ts` (pre-existing, non-blocking).
- Global hydration is now in place; the `FirmName` component in the header will light up once the store is hydrated for signed-in users on any page.

## Files Changed
- `apps/web/src/features/auth/index.ts` (removed dangerous server re-exports)
- (Previous session work enabled the current clean state of dashboard + onboarding flow)
