# Phase 7 Execution Plan — Testing, Beta & Launch Preparation

**Date**: May 27, 2026  
**Phase**: Phase 7 — Testing, Beta & Launch Preparation  
**Current State**: Phase 6 closed at 100% (May 27). Overall project ~82%.  
**Target Duration**: 7–10 focused days to MVP  
**Binding Documents**:
- Official plan: `estate-planning-engine-plan/phases/phase-7-testing-beta.md`
- High-level synthesis: `PHASE-6-7-COMPLETION-PLAN.md` (Phase 7 section)
- Rules: `AGENTS.md` + all `.cursor/rules/*.mdc`

---

## Executive Summary

Phase 7 is the final phase. Its purpose is **not** to build new major features, but to:

1. Prove (through automated + manual means) that the system actually delivers on its core promise: **exact document fidelity + meaningful time savings** for real estate planning attorneys.
2. Get the product into the hands of 3–5 real (or friendly) law firms using their own templates.
3. Collect structured feedback and ship at least one meaningful iteration.
4. Complete the pre-launch checklist so a confident soft launch (starting with Private Beta) is possible.

**MVP Complete = End of Phase 7.**

This plan breaks the work into focused waves with clear gates, mandatory Test-First E2E, and the same reviewer handoff discipline used successfully in Phases 5 and 6.

---

## Success Criteria (Binding)

From the official plan + AGENTS.md priorities:

- All critical E2E flows pass (especially the full invite → intake → full 8-document package → download flow)
- At least 3–5 beta firms actively using the product with real or anonymized attorney templates
- Real manual fidelity validation completed (side-by-side Word reviews with at least 2–3 actual templates)
- Structured feedback collected and at least one iteration shipped
- All items on the official pre-launch checklist completed or explicitly deferred with rationale
- Clean independent reviewer sign-off on the full system

---

## Recommended Wave Structure (7–10 Days)

### Wave A: Critical Path E2E & Automated Testing Surge (2–3 days)
**Goal**: Make the "happy path that matters most" bulletproof and add strong coverage on error/recovery surfaces.

**Key Deliverables**:
- Full critical path E2E test (the one explicitly called out in the official plan):
  - Attorney invites client (magic link)
  - Client completes full 10-section intake (exercising realistic CA branching)
  - Attorney reviews answers on client detail page
  - Attorney triggers "Generate Full Estate Plan" (8-document package)
  - Downloads individual documents + full ZIP
  - Verifies DRAFT watermark + basic content presence
- Additional high-value E2E:
  - Generation failure paths + error boundaries
  - Rate limiting on package generation
  - Permission/Role matrix on generation + downloads
  - Email devLink flows for new transactional emails
  - Health endpoint contract
- Expand unit/integration coverage where cheap wins exist (mapper edges, XState guards that are still thin)

**Gates after Wave A**:
- `pnpm run check-types && pnpm run build` clean
- All new E2E tests discovered via `--list` and passing in resilient mode
- Manual run of the full critical path in a real (or well-seeded) environment

### Wave B: Real Template Fidelity Validation (2–3 days — Non-Negotiable)
**This is the highest-leverage work in the entire project.**

**Process** (per official plan):
1. Line up 2–3 friendly estate planning attorneys (use personal network first).
2. Get them to provide 2–3 real templates each (start with Revocable Living Trust + Pour-Over Will).
3. Run the full generation pipeline against them using realistic intake data.
4. Perform side-by-side review in Microsoft Word (Print Layout view) against the original templates.
5. Document every single difference (formatting, numbering, headers/footers, tables, spacing, CA-specific language, etc.).
6. Classify issues:
   - Template prep problem (most common)
   - Mapper gap
   - Engine limitation (rare if docxtemplater is used correctly)

**Required Artifacts**:
- `docs/real-template-fidelity-reviews.md` (or per-attorney subfolder)
- Annotated screenshots or marked-up Word diffs
- Updated mapper / variable list if gaps are found
- Clear statement of current fidelity level ("Production ready for 80% of common trusts" etc.)

**AGENTS.md Rule**: Never consider this wave complete until real attorneys have reviewed real output.

**Gate**: At least two complete fidelity reviews with documented findings + any quick fixes applied.

### Wave C: Beta Program Launch & Onboarding Kit (2 days, can overlap with B)
**Deliverables**:
- **Attorney Onboarding Kit** (create these if they don't exist yet):
  - `docs/attorney-onboarding.md` — 15-minute setup guide
  - `docs/template-preparation-guide.md` — Exact variable names, loop syntax (`{#children}`, conditionals), required sections for the 8 core documents, common pitfalls
  - `docs/attorney-guide.md` (already started in Phase 6) — polish and expand
- Feedback collection system (Google Form or Typeform) with the exact 5 questions from the plan
- Internal beta tracking sheet (firms, templates uploaded, usage, feedback received)
- 30-minute Zoom walkthrough script + Loom backup video

**Recruiting**:
- Prioritize 3–5 small/solo firms
- Use "free lifetime access for early feedback providers" offer
- Have 2–3 friendly attorneys ready as fallback

**Gate**: Onboarding kit published in `/docs`, feedback form live, first 1–2 beta firms invited and onboarded.

### Wave D: Feedback Loop, Iteration & Launch Prep Polish (2 days)
**Activities**:
- Run weekly (or more frequent) feedback synthesis
- Ship at least one meaningful iteration based on real usage (prioritize fidelity or time-saving issues)
- Complete remaining pre-launch checklist items:
  - Billing/pricing page stub (even if manual invoicing)
  - Legal disclaimers/ToS review (add to UI + emails if missing)
  - Sentry monitoring validated end-to-end (trigger a test error in prod-like env)
  - Neon backup/restore runbook tested or documented
  - "Beta" badge + communication in the product
- Final documentation polish (README updates, known limitations page)

**Gate**: All checklist items either done or explicitly marked "post-MVP" with rationale.

### Wave E: Final Gates, Documentation & Reviewer Handoff (1 day)
**Deliverables**:
- Full gate run (types, build, full relevant E2E suite, manual critical path + fidelity spot checks)
- Final update to `PROGRESS.md` (Phase 7 → 100%, overall 95–100%)
- Create `phase-7-reviewer-handoff.md` (exact same structure as Phase 5 and Phase 6 handoffs)
- Update `progress-phase-6-security-polish.md` or create `progress-phase-7-testing-beta.md`
- Suggested final commit message

**Recommended Reviewer Focus Areas**:
- Real template fidelity reviews and findings
- Critical path E2E quality and coverage
- Beta onboarding experience and feedback quality
- Pre-launch checklist completeness

---

## Mandatory Non-Negotiables (AGENTS.md)

- **Test-First E2E** for every new automated test surface. Use the exact resilient patterns from the Phase 5 block (`signInAsE2E`, dynamic imports, temp firms, cleanup, 2-firm isolation matrix).
- **Real template fidelity reviews** are not optional. Synthetic data is not sufficient for Phase 7.
- Every sensitive path must continue to respect `firmId` from auth context.
- Document fidelity rule remains in force (any mapper or engine tweaks must be validated with side-by-side reviews).
- Commit after every working + gated slice.
- Update progress files after major waves.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|----------|
| Beta recruitment slower than hoped | High | Line up 2–3 friendly attorneys as fallback before starting outreach. Focus on template fidelity validation even with 1–2 users. |
| Real templates reveal serious fidelity issues | Medium | Treat this as success (better to find now). Have a rapid template-prep + mapper iteration loop ready. |
| Full browser E2E flakiness in CI/sandbox | High (historical) | Keep the resilient node + direct Prisma patterns as the primary assertions. Use `--list` + manual verification for browser-heavy flows. |
| Scope creep into new features | Medium | Ruthlessly defer anything not on the official Phase 7 checklist. Create clear post-MVP backlog. |

---

## Execution Recommendations

Use the exact same proven cadence that worked for Phases 5 and 6:

1. Open one focused slice at a time.
2. For anything larger than ~1 day, use `/plan-execute-validate` or autonomous-task-completer with clear sub-agent breakdown.
3. Write E2E tests **before or alongside** implementation.
4. Run gates after every slice.
5. Commit with conventional messages referencing this plan + wave/slice.
6. Update this file + `PROGRESS.md` after every wave.
7. End with a full `phase-7-reviewer-handoff.md` package + independent reviewer.

**Tooling available**:
- Playwright MCP server (excellent for authoring/debugging the big critical path test)
- Existing resilient test helpers in `e2e/onboarding.spec.ts`

---

## Immediate Next Actions (Recommended Order)

1. **Read the full context** (5–10 min):
   - Official `estate-planning-engine-plan/phases/phase-7-testing-beta.md`
   - This file
   - Current `PROGRESS.md`

2. **One-command baseline check**:
   ```bash
   pnpm run check-types && pnpm run build && npx playwright test e2e/onboarding.spec.ts --list | grep -E "Phase 6|Wave B|document.downloaded" | head -15
   ```

3. **Pick the first slice**:
   - **Strong recommendation**: Start with **Wave A** (Critical Path E2E).
   - The full invite → complete intake → generate full package → download test is the single highest-value piece of work in Phase 7.

4. **Create tracking**:
   - Append a new section to `progress-phase-6-security-polish.md` or create `progress-phase-7-testing-beta.md`
   - Update this file as you go

5. **When ready**: Say something like:
   - "Start Wave A – Critical Path E2E"
   - "Run plan-execute-validate for the full critical path test"
   - "Create the template preparation guide first"

---

## Appendix: Key File & Artifact Targets

**New or Major Updates Expected**:
- `e2e/onboarding.spec.ts` — major expansion of critical path + error tests
- `docs/template-preparation-guide.md` (new or major expansion)
- `docs/attorney-onboarding.md` (new)
- `docs/real-template-fidelity-reviews.md` (new — most important artifact)
- `docs/attorney-guide.md` (polish)
- `phase-7-reviewer-handoff.md` (new — required at end)
- `PROGRESS.md` (final 100% update)
- Feedback form + beta tracking sheet (external or in `/docs`)

**Existing Files That Will Be Touched**:
- `src/features/documents/mapper.ts` (likely, based on real template findings)
- Various Server Actions and UI for small iteration fixes

---

**This document is now the single source of truth for Phase 7 execution.**

Phase 6 was delivered cleanly through disciplined waves + gates. Phase 7 follows the same pattern, with the added emphasis on **real attorney validation** instead of just synthetic tests.

Ready to begin Wave A? Just say the word.