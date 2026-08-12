# Intake E2E Testing Gap Analysis Report

**Agent**: Intake E2E Testing Gap Analysis Agent  
**Date**: 2026-05-28  
**Status**: Complete analysis (evidence from source reads only; no production edits, no new tests written)  
**Primary Sources Read (exact required order)**:
1. `apps/web/src/features/intake/machine.ts` (full)
2. `apps/web/src/features/intake/schemas/intake.ts` (full)
3. `apps/web/src/features/intake/components/QuestionnaireWizard.tsx` (full, 1143 lines)
4. `apps/web/e2e/intake-questionnaire.spec.ts` (~598 lines) + `apps/web/e2e/intake-wizard-smoke.spec.ts` (full)
5. Supporting: `apps/web/app/dashboard/intakes/[intakeId]/page.tsx`, `apps/web/src/features/intake/machine.test.ts` (~920 lines), `apps/web/playwright.config.ts`, `apps/web/e2e/global.setup.ts`, dashboard server actions (intake persist/start/load), ClientsList/ClientsTable launch points, Prisma IntakeSession model.

**Methodology**: Static source analysis + cross-references. Every claim below is backed by specific line numbers, function names, or test code patterns. Brutally honest — no "we have good coverage" without evidence of exercised paths in real browser + real persistence.

---

## 1. Executive Summary

The current E2E coverage for the adaptive intake wizard is **asymmetric and fragile**:

- **Strengths** (real value delivered):
  - Real UI-driven client + intake creation (via ClientsTable "Intake" button → `startIntakeSession` → `/dashboard/intakes/[id]` with live `QuestionnaireWizard` + real `saveIntakeAnswers` Server Action + JSONB + Audit). Both specs do this correctly.
  - Strong smoke test (`intake-wizard-smoke.spec.ts`): minimal but realistic data per section, explicit reload + data survival checks exactly after the two highest-risk early array sections (Family, Assets). Stops at Review heading. Excellent daily regression guardrail for the "Save & Continue broken on page X" class of bugs.
  - Comprehensive spec exercises explicit personal + family (married + spouse grid conditional via `watch`,  children with `isMinor` + DOBs for `hasMinorChildren`, remove, pets), community ownership, reloads, validation error visibility, route-mocked save-error recovery, and Prisma asserts.
  - Unit tests (`machine.test.ts`) are **excellent** (nearly exhaustive) for pure logic: every guard (`hasMinorChildren` 15+ edges + DOB math, `isMarriedAndCA`, `sectionIsComplete` variants including corrupt wrapper detection, `canProceed`/`canSubmitCurrent`/`canJump`/`canComplete`, `saveAnswer` deep merge + repair for all 4 array sections + number coercion, RESUME, branching married+minors+CA, progress weights). E2E should **not** duplicate this.

- **Critical Gaps & Risks** (the reason this analysis exists):
  - **UI renderer asymmetry is the #1 testability problem**: Only `personal` and `family` have explicit, high-fidelity JSX (lines 828-976 in QuestionnaireWizard.tsx). All 8+ later sections (assets through priorPlanning + review) fall through a single massive `default:` generic path (lines 980-1133) that uses dynamic field names, hoisted-but-shared `useFieldArray` fallbacks, minimal placeholder fields (e.g. `residuary.0.name` hack for distribution, "This section uses structured fields..." for objects), and "Add Entry" patterns. Stable, targeted selectors are difficult; tests fall back to `.first()`, broad `select`, name-attr wildcards, and `.catch(() => {})`.
  - **Debug "Force Save & Continue (debug)" buttons** are present in production code (family: lines 955-965; assets: 1078-1090). They bypass RHF validation entirely and call `onFormAdvance` directly. Visible in real UI, pollute production, and signal that the submit path is still flaky in development.
  - **Review & Complete state is barely exercised**: Both E2E tests reach the "Review & Complete" heading. No meaningful assertions on what the review screen actually renders (it hits the generic object renderer with almost no content). The final `COMPLETE` / "Mark Complete & Finish" + `completed` lock + nav disable behavior is only lightly touched in the large spec and deliberately skipped in smoke.
  - **Conditional + guard paths in real browser + persistence roundtrips are under-exercised** relative to claims. `hasMinorChildren` + `guardian_minor` role interaction, mid-wizard maritalStatus flips after arrays exist + reload, full `canJump` sidebar enforcement under partial completion, array repair logic triggered from real form submits (vs unit), later thin sections' ability to satisfy `sectionIsComplete` + `canProceed` reliably.
  - **Selector / maintainability debt** high: tests will break on any generic renderer tweak, field name change, or added conditional in the default path. Long serial tests + heavy defensive code increase flakiness risk.

**Overall Verdict**: The smoke test is the highest-ROI artifact today for regression protection during active wizard work. The "comprehensive" spec delivers good early-path + error coverage but over-claims "every field / every guard / every edge" while leaning on generic loops and broad locators for the majority of the flow. Unit tests carry most of the guard/repair logic weight.

**Highest-leverage next work** (prioritized in section 4): 1) Lock down review/complete + full canComplete paths with reload. 2) Targeted married + minors + guardian_minor + community + reload matrix. 3) Sidebar canJump enforcement under partial state. 4) Remove or properly gate the debug force buttons. 5) Improve selector stability in the generic renderer (tiny production changes allowed per surgical rules).

---

## 2. Coverage Matrix (Machine Guards / Schemas / UI Paths vs E2E)

### Machine + Schema Guards (from machine.ts:150-194, schemas/intake.ts:264-337)

| Guard / Helper                  | Definition / Critical Logic                                                                 | Unit Coverage (machine.test.ts) | E2E Coverage Evidence (real browser + persist) | Gap Level |
|--------------------------------|---------------------------------------------------------------------------------------------|---------------------------------|------------------------------------------------|-----------|
| `hasSpouseOrPartner`           | personal.maritalStatus === 'married' \|\| 'partnered' (schemas:266)                        | Excellent (multiple tests)     | Personal fill in both specs (single + married paths) | Low |
| `isMarriedAndCA`               | hasSpouse + isCAResident (schemas:274)                                                     | Excellent                      | Married + CA checkbox in comprehensive; single in smoke | Medium (spouse grid + reload after arrays not deeply matrixed) |
| `hasMinorChildren`             | children.some: explicit isMinor \|\| DOB calc <18 (schemas:278-294; ~15 edges in unit)    | Exhaustive (537-658)           | 1+ minor DOB + isMinor cb in both specs; remove mid-flow in comprehensive | Medium-High (guardian_minor role interaction + post-reload + multiple mixed minors not targeted) |
| `sectionIsComplete`            | Strict for personal/family/distribution (undef/null → false); tolerant arrays/objects (schemas:296-321). Wrapper corruption debug in browser path. | Exhaustive per-section + corrupt notes | Early sections + generic loop; Prisma asserts on children/decisionMakers | Medium (later sections thin; repair triggered from UI not forced in E2E) |
| `canProceedToNext`             | Current complete + **ALL prior** in SECTION_ORDER complete (schemas:323-337)              | Good                           | Footer "Continue" disabled logic asserted indirectly via clicks | Medium (explicit prior-incomplete jump blocked not heavily tested) |
| `canSubmitCurrent` (machine)   | Only current sectionIsComplete (allows forward during editing/resume) (machine:170-177)   | Good (guard matrix)            | "Save & Continue" paths exercised in happy flows | Low-Medium |
| `canProceed` (for NEXT/JUMP)   | Uses canProceedToNext (full priors) (machine:162-165)                                      | Good                           | Footer button disabled check (wizard:642) | Medium |
| `canJump`                      | Visited or earlier or (priors complete via canProceedToNext) (machine:179-188)            | Good matrix                    | Sidebar count + some disabled asserted (comprehensive:484-488); limited partial-state matrix | **High** |
| `canComplete`                  | All non-review sections complete (machine:190-193)                                         | Good (incl. full seeded path)  | Attempted in comprehensive; smoke deliberately stops before | **High** (final locking behavior) |

**Key Schema Nuances Not Fully E2E-Stressed**:
- `section === 'gifts' ? 'specificGifts' : section` aliasing everywhere (machine:211, schemas:302, wizard:718).
- Distribution requires residuary array present (schemas:506-512 in unit).
- Number coercion only for assets.estimatedValue / liabilities.balance in saveAnswer (machine:253-258).
- Array repair logic (machine:216-244) is sophisticated (detects wrapper objects from bad prior submits for assets/liabilities/decisionMakers/specificGifts) + defensive delta handling. Unit tests it thoroughly (660-746); E2E comments mention it but no forced corruption path from real form submits.

### UI Renderer Coverage (QuestionnaireWizard.tsx)

- **Explicit high-quality paths (only 2)**:
  - `case "personal"` (828-883): Full fields + marital `<select>` (5 options) + `watch("maritalStatus")` conditional spouseOrPartner grid (855-862) + isCAResident checkbox + county + notes. Button: "Save & Continue".
  - `case "family"` (885-976): Hoisted `useFieldArray` for children/pets. "Add Child" / "Add Pet", per-child isMinor checkbox + guardianPreference, DOB, relationship. Special button text: "Save Family Information & Continue". **Debug force button present**. Live error box.

- **Generic `default:` path (980-1133) — the majority of the wizard**:
  - `GENERIC_ARRAY_SECTIONS` + `isArraySection` classification (722-724).
  - Hoisted arrays (793-798) mapped to active (assets → assetsArray, etc.; others fallback to specificGiftsArray — potential source of stale fields).
  - Dynamic per-section JSX inside map (assets: 7 types + 5 ownership incl "community" (critical CA), decisionMakers: 6 roles incl "guardian_minor" + nested person, fallback name/desc for gifts/charitable/prior/liab).
  - Non-array objects (distribution, healthcare, etc.): Extremely thin (e.g. distribution: `residuary.0.name` + minorTrustProvisions textarea hack; healthcare: primaryPhysician + careInstructions + anatomical checkbox; charitable/prior: minimal or "Add Entry" that may not satisfy schema deeply).
  - Every array section gets "Add Entry" + per-row Trash2. Submit button always generic "Save & Continue".
  - Debug force button only for assets (conditional).
  - Review: No `case "review"` — falls to generic object placeholder ("This section uses structured fields..."). No summary of prior answers rendered today.
  - Auto-save: `watch` → debounced 450ms `SAVE_ANSWER` (806-811). Explicit `onFormAdvance` for submit buttons sends `SUBMIT_SECTION` + payload extraction (822).

- **Navigation & State**:
  - Sidebar + mobile chips use `canJumpTo` (via `guards.canJump`) + complete badges from `sectionIsCompleteFn` (363-378). Locked on `isCompleted`.
  - Footer Prev/Continue buttons; Continue disabled by live `guards.canProceed` check (642-646).
  - Progress from machine (weighted + visited 30% credit).
  - LocalStorage draft (debounced) + real `onPersist` (debounced 650ms) from page.tsx wiring.
  - Completed state: full lock + RESET dev button (600-614).

**Evidence of E2E hitting these**:
- Explicit personal/family: Strong in both specs.
- Generic arrays (Add Entry, community ownership, guardian_minor role select, decisionMakers nested): Present via loops or targeted fills in smoke/comprehensive.
- Conditionals: Marital watch + spouse grid appear/disappear asserted (comprehensive:255-262). Minor DOB/isMinor: yes.
- Reload + restore: Yes (both specs, strategically after Family/Assets in smoke).
- But: No deep multi-entry + mixed minor + guardian_minor + hasMinor guard cross-check post-reload. Later sections mostly "fill first visible input + click Continue" via generic loop (comprehensive:372-397).

---

## 3. Existing Test Execution Reality (vs Claims)

### `intake-questionnaire.spec.ts` (the "comprehensive" 600-liner)
- **Good**:
  - Real creation flow + RBAC unauth test.
  - Explicit high-signal personal (married + spouse fill + conditional visibility) + family (3 adds, minors with DOB+isMinor cb, one remove via DOM context, pet, unicode).
  - Targeted community ownership + decision heading.
  - Reload + conditional re-verify (spouse + DOBs).
  - Validation error visibility + submit block.
  - Route `**/*` mock for 500 on intake/persist URLs → error pill + data preserved (good pattern).
  - Prisma assert (resilient, no PII).
  - Progress % regex check.

- **Over-claims / Weaknesses** (brutally honest):
  - "Every field type, every section (10 + review), every guard/branch, every realistic + pathological edge case" (header comments 19-114). Reality: After family, a generic 8-iteration loop fills "first visible text/number/textarea/select" + clicks Continue (with broad `select` + `.catch(() => {})`). Later sections (gifts/distribution/charitable/healthcare/prior) get minimal representative data. No targeted multi-decisionMakers with `guardian_minor` + hasMinorChildren=true verification. No full matrix of marital flips mid-flow.
  - Array repair not forced from real RHF submits in a way that would have produced the old wrapper corruption.
  - Review/complete: Reaches heading and "Intake Complete" text in one path; locked jump buttons lightly asserted. Not a full end-to-end complete + post-complete state test.
  - Selector fragility: Extremely defensive (`if (await X.isVisible().catch(() => false))`, `.first()`, `locator('select[name*="..."]')`, `page.locator("div:has-text(...)")`). Will break on renderer changes.
  - Serial mode + long test body increases blast radius.

### `intake-wizard-smoke.spec.ts` (new minimal guardrail)
- **Excellent scope discipline** (per its own comments 18-91):
  - One primary happy-path with **minimal realistic data** sufficient for `sectionIsComplete` + `canProceed`.
  - Strategic reloads + survival asserts exactly after Family (child name) and Assets (description + community).
  - Light fills for thin later sections (gifts, distribution residuary.0.name hack, charitable, healthcare physician + donor cb, prior just clicks through).
  - Deliberately stops at Review heading; defers full complete/lock to future test.
  - Matches existing style: real client creation, clerk, no page objects, heavy comments, defensive but focused.
- **What it does NOT cover (by design, and correctly)**: Conditionals beyond minimal, validation errors, jump nav, deep arrays, error injection, complete path, mixed minor/guardian scenarios.

**Shared Reality**: Both rely on the production `onPersist` (real server action) + local draft. Both exercise the actual RHF + XState + debounced save contract. This is high-fidelity E2E (not mocked components).

---

## 4. High-Risk / High-Pain Gaps (Prioritized)

**Prioritization criteria** (per briefing): Likelihood of regression on normal dev (generic renderer, RHF submit, machine guard tweaks), pain (attorney workflow stops), difficulty of reliable test.

### High Priority (Biggest Safety Increase for Least Effort)
1. **Review → Complete → Locked State + Reload (canComplete + completed lock)**  
   - Why: Smoke stops before; large spec lightly touches. Post-complete nav lock, "Intake Complete" UI, RESET, and resume-to-review behavior are critical attorney handoff points. `canComplete` guard + SUBMIT_SECTION/COMPLETE on review.  
   - Evidence: Wizard 568-576 (review entry), 600-614 (completed render), 304-310 (handleNextOrSubmit), machine 571-572.  
   - Effort: Medium (extend smoke or add small dedicated complete test; start from known-complete via server or full fill).  
   - Suggested: New small focused test or extension of smoke.

2. **Married + Minor Children + Guardian_Minor + Community Ownership + Post-Reload Matrix**  
   - Why: Core CA branching (`isMarriedAndCA`, `hasMinorChildren` DOB+flag, guardian role in decisionMakers, ownership="community" in assets). Interacts with generic renderer (decisionMakers role select) + array repair + progress. Team keeps hitting family/assets submit issues.  
   - Evidence: Schemas 274-293, machine guards 153-155, wizard 1051-1057 (role select incl guardian_minor), 1045 (ownership). Unit has it; E2E has pieces but not combined + reload + sidebar state.  
   - Effort: Medium (targeted addition to comprehensive or new focused scenario test; reuse smoke client creation).

3. **Sidebar canJump Enforcement Under Partial Completion**  
   - Why: `canJump` (visited/earlier or priors complete) directly controls Lock icons + disabled buttons in sidebar (wizard 285-297, 371). Critical for "user shouldn't jump ahead". Large spec only checks button count.  
   - Evidence: machine 179-188, wizard navItems + handleJump.  
   - Effort: Low-Medium (in existing wizard page, assert specific buttons enabled/disabled after partial fills).

4. **Thin Later Sections Submit Fidelity (Gifts, Charitable, PriorPlanning, Distribution, Healthcare)**  
   - Why: Generic renderer + minimal fields mean `sectionIsComplete` + `canProceed` may pass with placeholder data, but real attorney use + future mapper will fail silently. Distribution residuary is array in schema but UI often hits .0.name hack.  
   - Evidence: Wizard 1105-1132 (object fallback), 1060-1069 (generic list fallback), schemas 130-179, 238 (gifts alias). Smoke/comprehensive advance through them with light data.  
   - Effort: Low (add minimal but schema-satisfying targeted fills in smoke/comprehensive for these sections).

5. **Remove/Guard Debug Force Buttons in Production Code**  
   - Why: Direct production smell. Bypasses validation. Makes "submit works" tests less honest.  
   - Evidence: Wizard 954-965 (family), 1078-1090 (assets conditional).  
   - Effort: Very low (surgical removal or RoleGuard dev-only). High testability win.

### Medium Priority
- Mid-wizard maritalStatus flip (single → married after family/assets exist) + spouse grid re-appear + canProceed update + reload.
- Full array repair from real UI submit path (force a bad prior state via Prisma or local draft then submit).
- Save error recovery with real (non-mocked) network conditions + data not lost.
- Progress bar fidelity after reload + partial arrays (weighted + visited credit).
- Client-role vs owner/staff differences inside wizard (RoleGuard paths).

### Low (or Already Well-Covered by Units + Smoke)
- Basic happy-path progression (smoke owns this).
- Pure guard logic / sectionIsComplete variants / saveAnswer repair / RESUME (units own this).
- Simple validation errors on required fields (large spec has some).

---

## 5. Testability & Maintainability Issues

**Major**:
- **Generic renderer is E2E-hostile by nature** (one switch default for 9+ sections, dynamic registers, fallback array mapping, minimal object UIs). Any improvement here (more explicit cases, stable `data-testid` on key containers/fields, better aria, or section-specific help) would pay for itself in test reliability. (Tiny, surgical, non-refactoring changes allowed per rules.)
- **Debug force buttons in prod** (see above).
- **Focus-loss mitigation** (key={currentSection} + React.memo comparator on section only + hoisted hooks) is clever but complex. E2E cannot easily assert "no focus loss on typing" without heavy instrumentation.
- **Selector patterns in existing E2E**: Name attributes are stable (RHF-generated) — good. But pervasive `.first()`, `select` without context, `hasText` + `.first()`, broad catch-all loops, and many `if (visible).catch(() => {})` make tests long and brittle. Matches "existing style" (per AGENTS.md) but increases maintenance cost.
- **No review summary UI yet**: Makes "review step" testing low-signal until renderer improves.
- **LocalStorage draft vs server initialAnswers precedence**: Wizard prefers server (line 187), falls back to draft. E2E tests both implicitly via reloads but no explicit "server wins over stale draft" test.

**Opportunities for Tiny Production Wins** (surgical, high E2E leverage):
- Add stable `data-section={currentSection}` or `data-testid` equivalents on the main CardContent or section header (no broad refactors).
- Gate debug force buttons behind `process.env.NODE_ENV === 'development'` or a dev RoleGuard.
- For distribution: make residuary handling use the hoisted fieldArray consistently instead of `residuary.0.name` string path.
- Expose a minimal "review summary" (read-only dump of key answers) behind the review case — dramatically increases E2E + manual test value.

---

## 6. Recommended Immediate Actions (Top 5–8 for Biggest Safety / Least Effort)

1. **Extend smoke or create `intake-wizard-complete.spec.ts`**: Full fill → Review → "Mark Complete & Finish" → assert completed UI + nav locked + reload stays completed/locked. (Highest priority per gap #1.)
2. **Add one targeted "married + 2 minors (mixed DOB) + guardian_minor decision maker + community asset + reload" scenario** (can be a new describe block in comprehensive or small dedicated file). Assert hasMinorChildren truthiness via data survival + sidebar state + canProceed.
3. **Add explicit canJump assertions** in an existing or new test: After personal only, assert Family/Review sidebar disabled (Lock or disabled); after completing priors, enabled. Use `canNav` from navItems logic.
4. **Surgical cleanup**: Remove or dev-gate the two Force debug buttons (wizard.tsx). Update any tests that relied on them (none should).
5. **Strengthen later-section fills** in smoke + comprehensive: Use schema-satisfying data for gifts (beneficiary+description), distribution (proper residuary array intent if possible), etc. Add light assertions that key fields survived reload.
6. **Review screen smoke**: Once on Review, assert presence of at least one prior answer summary (or the placeholder) + progress value + that Complete button text is correct.
7. **(If time)**: One error-injection test that exercises the real `saveIntakeAnswers` error path (not just route mock) or a Prisma-seeded corrupt array state + UI submit repair.
8. **Documentation**: Update the "comprehensive" header comments to be brutally honest about generic-loop coverage (prevents future over-confidence).

**Approach guidance** (per AGENTS.md + briefing): Match existing style exactly — long heavily-commented serial tests, real UI client/intake creation, defensive selectors + waits, dynamic Prisma asserts, no premature page objects. Extend the existing two files or add tiny focused new ones (e.g. `intake-wizard-review-complete.spec.ts`). Prioritize the smoke file for ongoing guardrail work.

---

## 7. Risks & Open Questions

- **Open**: Does the generic renderer for "review" ever intend to show a real summary, or is it always a no-op placeholder before the final button? (Current code: no special case.)
- **Risk**: Continued reliance on broad selectors + generic loop means future generic renderer refactors (even small) will cause E2E flakes or silent coverage loss.
- **Risk**: Debug buttons in prod increase chance of accidental bypass in real attorney sessions.
- **Risk**: hasMinorChildren DOB math is runtime Date.now() dependent (unit uses robust edges; E2E DOBs are chosen safely in 2018-2022 range). Boundary cases (exactly 18) not E2E exercised.
- **Risk**: Array section fallback mapping in wizard (specificGiftsArray as default for charitable/prior) could cause subtle stale data or hook issues if more sections added without updating the if-chain (lines 988-993).
- **Unclear from static read (would need runtime or targeted test)**: Exact behavior of "Force" buttons vs normal submit when RHF has errors; whether review ever calls canProceedToNext("review") in practice; full fidelity of local draft vs server initialAnswers when both present and conflicting.
- **Positive**: The XState + schema purity + real server action contract makes the system unusually testable once UI selectors stabilize.

---

## 8. Appendix: Key Line References (for Implementers)

- Machine guards: machine.ts:150-194
- sectionIsComplete / canProceedToNext / hasMinorChildren: schemas/intake.ts:296-337, 278-294
- Explicit vs generic render: QuestionnaireWizard.tsx:827 (switch), 828 (personal), 885 (family), 980 (default)
- Debug buttons: 954-965, 1078-1090
- Submit paths: 814-824 (onFormAdvance), 303-310 (handleNextOrSubmit)
- canJump UI: 285-297, 363-378
- Completed lock: 293, 600-614, 582-585 (machine)
- Persistence wiring: app/dashboard/intakes/[intakeId]/page.tsx:69-92 (handlePersist), 120-131 (props)
- Actions: dashboard/server/actions.ts:380-443 (saveIntakeAnswers), 228-282 (start), 325-372 (get)
- Unit exhaustive coverage: machine.test.ts:460-920 (sectionIsComplete, hasMinor 15+ edges, save repair, guards matrix, etc.)
- E2E smoke reload strategy: intake-wizard-smoke.spec.ts:241-254 (Family), 307-319 (Assets)
- Large spec error injection: intake-questionnaire.spec.ts:509-537

**Next Step Recommendation**: Human + main agent review this report. Pick 1-2 High gaps (e.g. #1 complete path + #5 debug button removal). Spawn implementation subagent with strict "read this report + Karpathy rules + match existing test style" instructions. No broad refactors.

---

*Report generated by read-only analysis agent. All findings evidence-based. Ready for human decision on gap closure order.*