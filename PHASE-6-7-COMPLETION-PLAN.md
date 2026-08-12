# Phase 6 & 7 Completion Plan — Estate Planning Engine

**Date**: 2026-05-27 (updated from latest PROGRESS.md + code audit)  
**Current State**: Phase 5 closed (100%, handoff package exists). Phase 6 In Progress (~42-48% per last snapshot: Wave A 100%, Wave B foundation strong). Phase 7 Not Started. Overall ~65%.  
**Goal**: Reach production-ready MVP (end of Phase 7) with clean reviewer gates, full E2E on critical paths, and beta-ready foundation.  
**User Note**: PROGRESS.md currently lists us in Phase 6. If your view showed Phase 5, this plan starts from the actual delivered state (Wave A complete + Wave B foundation + sonner/Sentry/boundaries/generation UX improvements already landed).

**Non-Negotiables (AGENTS.md + .cursor/rules)**:
- Document fidelity (any PDF guidance text or future gen touches must preserve it; no converters).
- Strict multi-tenancy + firmId scoping on every new path (RLS/Prisma extensions are defense-in-depth only).
- Test-First: Playwright E2E for every major new feature/flow (especially generation, emails, error paths, downloads).
- Commit after every working + tested slice.
- No heavy new deps without strong justification.
- Update PROGRESS.md + this plan + create reviewer handoff packages.
- Attorney trust: Generation UX must be unambiguous (already a focus area).

---

## Current Snapshot (Verified via Files + Audit)

**Strengths Delivered**:
- Excellent app-layer security + RBAC (getCurrentAuthContext + requireRole everywhere).
- Audit foundation very strong (Wave A closed the last big gaps: `document.downloaded` + Clerk membership events + helper adoption).
- Error observability foundation excellent: sonner + reusable `ErrorCallout`/`SuccessCallout`/`InfoCallout`, Sentry (client/server/edge + withSentryConfig), `global-error.tsx` + `dashboard/error.tsx` + `GenerationErrorBoundary` (wrapped on main gen surface), alert() removed from delete.
- Generation UX improved (isGenerating state + banners in ClientsList + client detail).
- Typecheck currently clean (`pnpm run check-types` passes) → `ignoreBuildErrors` TODO is actionable now.
- 78+ E2E tests with resilient 2-firm isolation patterns (Phase 5 block is gold standard).
- Dual real/mock discipline preserved with accurate labeling.

**Critical Remaining Gaps (Prioritized by Risk/Impact)**:
1. **Transactional Emails** (high user-visible value, Phase 6 plan item): Only invitation email exists. Missing "intake complete" (client) + "documents ready for review" (attorney).
2. **Error/Feedback Polish Breadth** (Wave B remainder): Callouts and toasts not uniformly adopted across all dashboard pages, wizard, invite, onboarding, list error states. ?error= redirect params still unconsumed. Limited Sentry manual capture on non-fatal paths.
3. **Production Basics** (checklist items): No `/api/health`, .env.example incomplete (missing Sentry keys), no security headers, no legal disclaimer footer, `ignoreBuildErrors` still present.
4. **Rate Limiting** (medium): Only invite (20/hr/firm). Generation (expensive + privileged) and other sensitive surfaces unprotected.
5. **Deeper Security** (defense-in-depth, gated): No Prisma query extensions, no Postgres RLS policies. (Lower priority for beta; document + prototype only.)
6. **PDF Guidance** (fidelity-first): Research decision = no conversion code. Need clear UI text + docs only.
7. **Phase 6 Gates + Handoff**: Full E2E on new surfaces, production checklist sign-off, reviewer package.

**Type Errors**: Currently zero (clean run). The next.config TODO can be removed/scoped immediately.

---

## Phase 6 Completion — Recommended Wave Structure (2–4 days focused work)

Follow the existing wave framing in `progress-phase-6-security-polish.md`. Execute in small slices (1–3 files + tests per slice). Use plan-execute-validate for Waves B remainder + Emails.

### Wave B Completion (Error/Polish Wrap — Highest Attorney-Trust Impact)
**Goal**: Uniform feedback language, full error boundary coverage, ?error= handling, broader Sentry, E2E on failure paths. Remove `ignoreBuildErrors`.

**Slices** (Test-First where new UX or sensitive):
- B3: Uniform Callout adoption sweep
  - Refactor dashboard list pages (clients/documents/intakes/templates), Overview, invite form, onboarding form, QuestionnaireWizard save states, and any remaining inline red/emerald divs to use `ErrorCallout`/`SuccessCallout`/`InfoCallout` from `@/components/ui/callouts`.
  - Add sonner `toast.success` / `toast.error` (or promise toasts) on high-value actions: client create, notes save, generate success (layer on top of existing emerald panels + downloads).
  - Target files: `app/dashboard/{clients,page,intakes,documents,templates}/page.tsx`, `ClientsList.tsx`, `invite-client-form.tsx`, `onboarding-form.tsx`, `QuestionnaireWizard.tsx`, `DashboardShell.tsx` (for global banner slot).
- B4: Global Error Banner + Redirect Param Consumption
  - Create `<UrlErrorBanner />` (or integrate into DashboardShell) that reads `useSearchParams().get('error')` and maps known codes (`insufficient-permissions`, `client-not-found`, etc.) to friendly dismissible `ErrorCallout`.
  - Mount once in `DashboardShell` or a thin client provider under the dashboard layout.
- B5: Sentry Manual Instrumentation (light)
  - Add `Sentry.captureException` (with tags like `{nonFatal: true, area: 'audit'}`) in the top non-fatal catches: audit logging failures, webhook races, auth recovery paths, generation action outer catches (where we already return `{error}`).
  - Add breadcrumbs for generation start/success/failure.
- B6: Error Boundary + Failure Path E2E (mandatory gate)
  - Extend `e2e/onboarding.spec.ts` (Phase 6 block or new describe) with 4–6 tests:
    - Generation failure surfaces `GenerationErrorBoundary` fallback (inject error via test action override or network).
    - ?error= banner renders and dismisses for key codes.
    - Callout + sonner visibility on create/invite/generate paths.
    - Strict 2-firm isolation on any new error surfaces.
  - Follow exact resilient patterns from Phase 5 block (dynamic imports, signInAsE2E, temp firms, cleanup).
- B7: `ignoreBuildErrors` removal + final type sweep
  - Delete the `typescript.ignoreBuildErrors` block (or scope it narrowly if any edge remains).
  - Re-run `pnpm run check-types` + build as gate.
- **Gate after Wave B**: Full relevant Playwright (`npx playwright test e2e/onboarding.spec.ts -g "Phase 5|Phase 6|error|generation"`), typecheck, build, lint. Manual spot-check of generation + error states in real + mock paths.

**Owner Trust Outcome**: Every privileged action (especially long-running "Generate Full Estate Plan") has unambiguous, persistent, accessible feedback. No more native alerts or buried console-only failures.

### Wave C: Production Basics & Quick Wins (Parallelizable with B finish)
- C1: Health Endpoint (`app/api/health/route.ts`)
  - Simple GET returning `{status: "ok", timestamp, db?: "connected"}`.
  - Optional lightweight Prisma ping (non-blocking, no PII).
  - No auth (public health probe).
- C2: Rate Limiting Expansion (reuse existing pattern)
  - Extract `createRateLimiter` helper (or thin `checkRateLimit(firmId, action, limit, windowMs)`) from the inline logic in `invite-client.ts`.
  - Apply to:
    - `generateDocumentForIntake` / `generateFullPlanPackageForIntake` (e.g. 5–10 packages/hour/firm — tunable).
    - Possibly template mutations later.
  - Return clear `{error: "Rate limit exceeded. Please try again later."}` + log to audit + Sentry (low severity).
  - E2E test: hammer endpoint from one firm, verify limit + isolation (second firm unaffected).
- C3: .env.example Hardening
  - Add all runtime keys now used: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (with comments).
  - Expand Resend/Clerk/Neon sections with production notes (custom domain, verified sender, Neon branching advice).
  - Keep resilient-dev behavior documented.
- C4: Security Headers (minimal, non-breaking)
  - Add via `next.config.ts` `headers()` or middleware: basic CSP (allow Clerk + Resend origins), X-Frame-Options, Referrer-Policy, Permissions-Policy.
  - Test thoroughly (Clerk flows must survive).
- C5: Legal Disclaimer Footer + Polish
  - Subtle, persistent footer (or bottom-of-shell note) visible when signed in: "All generated documents are DRAFT — for attorney professional review only. This tool does not provide legal advice."
  - Typography/spacing sweep on dashboard surfaces; ensure consistent use of shadcn primitives.
  - Empty state + loading state final review (leverage existing high-quality ones).
- **Gate**: Build succeeds cleanly, health endpoint returns 200 in dev, rate limit tests pass, headers present in responses (curl check).

### Wave D: Transactional Emails (Resend — High Leverage)
**Non-negotiable**: Keep the exact resilient pattern from existing `sendClientInvitationEmail` (devLink fallback when no key, never break the calling flow, minimal PII logging, professional branding).

**Deliverables**:
- New functions in `src/features/auth/server/email.ts` (or thin `transactional-emails.ts`):
  - `sendIntakeCompleteConfirmation(params: {to, firmName, clientName, intakeUrl?})` — sent to client after "Mark Complete".
  - `sendDocumentsReadyNotification(params: {toAttorneyEmail, firmName, clientName, packageDownloadUrl?, clientId})` — sent to owner/staff after successful full plan generation.
- Beautiful HTML + plain text (reuse the invitation template style; add firm-specific header if possible).
- Wire calls:
  - Intake complete: After successful `markIntakeComplete` or equivalent in intake actions / wizard (find the exact mutation site).
  - Documents ready: Immediately after successful `generateFullPlanPackageForIntake` (in the Server Action, after ZIP created + audit logged).
- Dev resilience: Always return `devLink` (or simulated) when `!RESEND_API_KEY`.
- E2E / integration: In existing generation + intake tests, assert that the email functions were invoked with correct minimal args (spy or by checking returned devLink in test mode). No real email delivery required.
- **Gate**: Manual + E2E verification that emails "would have sent" (dev mode) on happy paths; error paths still succeed the primary action.

**Risk**: Do not block core flows on email failure (already the contract).

### Wave E: Deeper Security (Explicitly Gated — MVP Optional)
- E1: Prisma Query Extension Prototype
  - Create an optional `createFirmScopedPrisma(firmId)` helper using `$extends`.
  - Document usage + risks (only for new code; do not refactor all existing helpers in Phase 6).
  - Performance test on realistic seed volume.
- E2: Postgres RLS Policy Examples
  - Add a `docs/row-level-security.md` with ready-to-apply `CREATE POLICY` statements for `Client`, `IntakeSession`, `GeneratedDocument`, `Template`, `AuditLog` (using `current_setting('app.firm_id')` or similar via middleware).
  - Enablement checklist + "how to verify with 2-firm test".
  - Do **not** enable in production schema during Phase 6 without separate perf + E2E sign-off.
- E3: Rate Limit Hardening Tests (expand from Wave C).
- **Decision Gate**: Only proceed to full implementation if beta feedback or security review demands it. Otherwise, leave as documented defense-in-depth for post-MVP.

### Wave F: PDF Guidance (Fidelity-Preserving) + Phase 6 Closeout
- F1: UI + Docs Text Only (no code)
  - Add prominent helper text next to every "Download .docx" and "Download Full Package" button: "Need a PDF? Open the .docx in Microsoft Word (or LibreOffice) → File > Save As / Export > PDF. This guarantees 100% fidelity to your original attorney template."
  - Update any legacy comments in Prisma schema or plans that mention ".pdf" as output.
  - Create or expand `docs/attorney-guide.md` section: "Working with Generated Documents" (fidelity, PDF workflow, DRAFT marking, what the attorney must review).
- F2: Full Production Checklist Sign-off
  - Copy the checklist from `estate-planning-engine-plan/phases/phase-6-security-polish.md` into this plan + mark each item with evidence (links to PRs/files).
  - Items: RLS/app controls, audit, emails, errors/Sentry, rate limits, env, headers, monitoring, health, legal footer, accessibility spot-check, `.env.example`, build clean.
- F3: Phase 6 Reviewer Handoff Package
  - Mirror the structure of `phase-5-reviewer-handoff.md`.
  - Include: executive summary, gates table, wave-by-wave deliverables, compliance matrix (AGENTS + rules), commands for verification, recommended reviewer focus (especially email flows, rate limits, error boundaries, 2-firm isolation on new surfaces).
  - Suggested commit message template.
- F4: Documentation & Progress Update
  - Final update to `PROGRESS.md` (move Phase 6 to Complete 100%, bump overall %).
  - Append detailed log + decisions to `progress-phase-6-security-polish.md`.
  - Update any stale references in `DEVELOPMENT-PLAN.md` or phase files (they are historical).

**Phase 6 Final Gate (before moving to Phase 7)**:
- All waves complete + individual gates passed.
- `pnpm run check-types && pnpm run build && pnpm run lint` clean.
- Relevant Playwright suite green (focus new Phase 6 blocks + full critical path).
- Manual visual run of: invite → intake complete (email devLink) → generate full plan (with progress + success panel + download + audit row) → error injection paths.
- Fresh independent reviewer pass (0 blockers recommended for closure).

---

## Phase 7: Testing, Beta & Launch Preparation (7–10 days)

**Primary Objective**: Rigorously validate the full critical path with real (anonymized) attorney templates, recruit 3–5 beta firms, collect structured feedback, and prepare a confident soft launch.

### 1. Automated Testing Surge (Highest Priority per AGENTS.md)
- **E2E Expansion (Playwright — non-negotiable before beta)**:
  - Full happy-path matrix (already partially covered): Attorney invites client (magic link) → client completes full 10-section intake (all CA branching exercised) → attorney reviews answers → "Generate Full Estate Plan" (8-doc ZIP) → downloads individual + package → verifies DRAFT watermark + basic content via Playwright PDF text? or docx parse (keep simple).
  - Error + recovery: generation failure, rate limit hit, permission denied, resume after crash.
  - Multi-tenant isolation stress: 2–3 concurrent firms performing overlapping actions (clients, intakes, generations, downloads, audit visibility).
  - Email surface: devLink flows for invitation + new transactional emails.
  - Add dedicated `e2e/critical-path.spec.ts` or expand the existing monster `onboarding.spec.ts` with clear describe blocks.
- **Integration / Unit** (lighter):
  - Mapper edge cases (children arrays, community property flags, missing optionals) — expand `features/documents/mapper.test.ts` if not present.
  - XState guards matrix (already strong from Phase 3).
  - Document generation error taxonomy (MissingTemplateVariablesError etc.) round-tripped through actions.
- **Fidelity Verification Protocol** (manual + scripted):
  - Use 2–3 real anonymized attorney templates (revocable trust + pour-over will at minimum).
  - Run full package generation.
  - Side-by-side Print Layout comparison in Word (per Phase 4 playbook in progress docs).
  - Document every delta (usually template prep fixes, not code changes).
  - Record screenshots + annotated diffs.

**Test Gate**: 100+ E2E tests total, zero critical path flakes in 3 consecutive runs, explicit fidelity sign-off from at least one real template review.

### 2. Beta Program Launch
- **Recruiting (target 3–5 small/solo firms)**:
  - Leverage personal network (highest conversion).
  - Local bar estate planning section + LinkedIn targeted outreach.
  - Offer: Free lifetime access for early users who commit to 2 feedback sessions.
- **Onboarding Kit** (create these artifacts):
  - `docs/attorney-onboarding.md`: 15-min setup (Clerk org, first firm, upload first template, invite test client, generate sample package).
  - `docs/template-preparation-guide.md`: Exact rules for variable names, loops (`{#children}` etc.), required sections for the 8 core documents, DRAFT header expectations, common pitfalls (numbering, headers/footers, tables).
  - Short Loom or script for 30-min Zoom walkthrough.
  - Feedback form (Google/Typeform): time saved, fidelity rating (1–10), friction points, "one feature that would 10x value", willingness to pay.
- **Feedback Cadence**:
  - Weekly synthesis call or async doc.
  - Prioritize fidelity + time-savings issues ruthlessly.
  - Ship fixes fast and notify betas.

### 3. Launch Preparation Artifacts
- Billing / pricing page stub (even if manual invoicing for beta).
- Legal: Terms of Service, Privacy Policy, clear disclaimers in UI + emails (reviewed by counsel if possible).
- Monitoring: Confirm Sentry + any analytics (PostHog?) firing in a staging/prod-like environment. Test error reporting end-to-end.
- Backup/DR: Document Neon snapshot + restore procedure.
- Ops runbook: How to add a new firm, rotate keys, investigate an audit log entry.
- "Beta" badge + clear communication in product ("Early access — your feedback shapes the future").

### 4. Soft Launch Options (Choose One)
1. Private Beta (recommended): Existing + 2–3 more firms only.
2. Public waitlist landing page.
3. Limited public beta with manual approval + "Beta" watermark.

**Phase 7 = MVP Complete Definition**:
- All critical E2E passing + fidelity verified on real templates.
- 3+ active beta attorneys using with their own (or anonymized) templates.
- Structured feedback incorporated (at least one iteration cycle).
- All Phase 6 + 7 checklists closed.
- Clean reviewer sign-off on the full system.

---

## Execution Recommendations

**Preferred Cadence** (proven in Phases 3–5):
1. Open a focused slice (e.g., "Wave B3: Callout adoption + sonner on 4 pages").
2. Use `/plan-execute-validate` or autonomous-task-completer for anything > 1 day of work (with clear sub-agent breakdown).
3. Write E2E tests **before** or alongside the implementation for the feature.
4. Run gates (`check-types`, `build`, targeted `playwright test`, manual happy + one error path).
5. Commit with conventional message referencing this plan + wave/slice.
6. Update this file + `PROGRESS.md` + `progress-phase-6-security-polish.md` after every major slice.
7. After Wave F: Create the Phase 6 handoff package, run independent reviewer (fresh eyes), close Phase 6.
8. Repeat pattern for Phase 7 (split into Testing Surge + Beta Prep + Launch Prep if desired).

**Tooling Notes**:
- Playwright MCP server is available in this session for live browser inspection during E2E authoring/debugging.
- Use existing resilient test patterns verbatim (they are excellent).
- For email testing: Rely on the devLink return value + console capture in CI/sandbox.

**Risks & Mitigations**:
- Email deliverability friction → Keep devLink fallback forever; production custom domain is post-MVP.
- Rate limit tuning → Start conservative; make limits configurable via env or simple admin later.
- Type drift reappearing → Remove ignoreBuildErrors early in Wave B; treat any new errors as immediate blockers.
- Beta recruitment slower than hoped → Have 2–3 "friendly" attorneys ready as fallback; focus on template fidelity validation even with 1–2 users.

**Estimated Remaining Effort**:
- Phase 6 Waves B–F: 3–5 focused days (with tests).
- Phase 7: 7–10 days (heavy on E2E + manual fidelity + outreach coordination).
- Total to MVP: 2–3 weeks of disciplined execution (fits original 10–12 week target with buffer).

---

## Immediate Next Actions (Start Here)

1. **Acknowledge state**: Confirm we are in Phase 6 per files (not Phase 5). Update any personal notes.
2. **One-command verification** (run now):
   ```bash
   pnpm run check-types && pnpm run build && npx playwright test e2e/onboarding.spec.ts --list | grep -E "Phase 5|Phase 6" | head -20
   ```
3. **Pick first slice**: Strongly recommend **Wave B3 + B4** (uniform callouts + UrlErrorBanner) — high visual impact, low risk, sets up the rest of error work.
4. **Create tracking**: Use this file + append to `progress-phase-6-security-polish.md`. When Phase 6 closes, mirror the Phase 5 handoff process.
5. **When ready for heavy lifting**: Say "execute Wave B3" or "run plan-execute-validate for Phase 6 emails" and the autonomous machinery will take it (following all rules).

**This plan is the single source of truth for finishing.** It directly references the official phase-6 and phase-7 documents while incorporating the actual delivered state from May 27.

Ready when you are. Let's close this cleanly and get real attorneys using it with their templates.

---

**Appendix: Key File Targets (Living List)**
- Email: `src/features/auth/server/email.ts`
- Callouts: `src/components/ui/callouts.tsx` + adoption sites
- Shell/Banner: `src/features/dashboard/components/DashboardShell.tsx`
- Actions (generation + audit): `src/features/dashboard/server/actions.ts`
- Rate limit helper: new or in `src/features/auth/server/`
- Health: `app/api/health/route.ts`
- E2E: `e2e/onboarding.spec.ts` (append Phase 6 blocks)
- Config: `next.config.ts` (remove ignoreBuildErrors)
- Env: `apps/web/.env.example`
- Docs: `docs/attorney-guide.md` (new), `docs/row-level-security.md` (new)
- Progress: `PROGRESS.md`, `progress-phase-6-security-polish.md`, this file

All changes must pass the AGENTS.md gates.