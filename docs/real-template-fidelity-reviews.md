# Real Template Fidelity Reviews — Phase 7 Wave B

**Purpose**: This is the living central document for Phase 7 Wave B (Real Template Fidelity Validation). Per the official Phase 7 plan and AGENTS.md, **manual side-by-side review of real attorney templates is non-negotiable**.

Every generated document must be compared visually in Microsoft Word Print Layout against the attorney's original template. The goal is to reach high confidence that the system delivers on its core promise: **exact fidelity to the attorney's voice, formatting, and structure**.

---

## Review Process (Standard Operating Procedure)

1. **Recruit** 2–3 friendly estate planning attorneys (start with personal/professional network).
2. **Collect** 2–3 real templates per attorney (anonymized). Priority order:
   - Revocable Living Trust (highest value)
   - Pour-Over Will
   - Durable Power of Attorney (Financial)
   - Advance Healthcare Directive
3. **Prepare** realistic but anonymized intake data that exercises the template's features (minor children, community property assets, specific gifts, multiple decision makers, etc.).
4. **Generate** the full coordinated 8-document package using the real templates.
5. **Review** side-by-side in Microsoft Word (Print Layout view):
   - Open original template + generated document side-by-side.
   - Scroll page by page.
   - Note every difference.
6. **Log** findings in the tables below (one section per attorney/template).
7. **Classify** each finding:
   - **Template Prep** (most common) — variable name mismatch, missing loop, wrong conditional, header/footer issue.
   - **Mapper Gap** — data not being passed correctly.
   - **Engine / Post-Processing** — DRAFT watermark placement, page break issues, etc.
   - **Acceptable** — intentional (e.g., DRAFT header we add).
8. **Iterate** quickly on high-impact fixes.
9. **Re-review** until the attorney is comfortable.

---

## Attorney / Template Review Log

### Attorney 1: [Name / Firm — anonymized]

**Date of Review**:  
**Templates Reviewed**:
- Revocable Living Trust: [filename or description]
- Pour-Over Will: ...
- ...

#### Findings Table

| # | Document | Page/Section | Issue Description | Classification | Severity | Resolution / Notes | Re-reviewed? |
|---|----------|--------------|-------------------|----------------|----------|--------------------|--------------|
| 1 | Revocable Trust | Header | DRAFT watermark overlaps slightly with firm letterhead | Engine | Low | Acceptable for MVP; attorney will remove on final | Yes |
| 2 | Revocable Trust | Schedule A | Real estate assets not appearing in loop | Mapper | High | Missing normalization for `assets[].type === "real_estate"` | In progress |
| 3 | ... | ... | ... | ... | ... | ... | ... |

**Attorney Feedback Summary**:
- Fidelity rating (1–10): 
- Time savings observed: 
- Biggest concern: 
- Would use in practice after fixes: 

---

### Attorney 2: [Name / Firm — anonymized]

(Repeat structure above)

---

### Attorney 3: [Name / Firm — anonymized]

(Repeat structure above)

---

## Common Issues & Quick Reference

**High Frequency (from prior experience + plan expectations)**:
- Variable naming inconsistencies (`client_full_name` vs `client_name`)
- Missing or empty arrays for loops (`{#children}`, `{#assets}`)
- Community property flags not set correctly (`is_community_property`)
- Decision maker role lookups (`executor_full_name` etc.)
- Minor children conditionals
- Specific gifts / residuary distribution formatting
- Header/footer / numbering preservation (usually template prep)
- Long asset descriptions or special characters breaking layout

**Mapper Debugging Tips**:
- Run `mapIntakeToDocVariables` in isolation with the exact intake JSON.
- Compare output keys against the actual `{variable}` tags in the .docx (use "Find" in Word or a docx inspection tool).
- Always test with realistic edge cases: unmarried client, no children, mixed asset ownership, out-of-state resident.

---

## Current Known Mapper Surface (as of start of Wave B)

See full implementation: `src/features/documents/mapper.ts`

**Core shared variables** (always present):
- Client basics (`client_full_name`, `client_first_name`, etc.)
- `has_spouse`, `spouse_full_name`
- `is_ca_resident`, `is_married_and_ca`
- `children[]` (with `full_name`, `is_minor`, `age`, etc.)
- `assets[]` (with `is_community_property`, `description`, `estimated_value`)
- `decision_makers[]`
- Role shortcuts: `executor_full_name`, `successor_trustee_full_name`, `healthcare_agent_full_name`, etc.
- `specific_gifts[]`, `distribution_residuary[]`
- Healthcare instructions, POLST notes
- `attorney_notes_for_document`

**Document-specific** (revocable_trust, pour_over_will):
- Trust name, will title
- Schedule counts
- Guardian nominations
- Pour-over hooks

**Always-safe rules enforced by mapper**:
- No `undefined` values
- Empty arrays are `[]`
- Critical fields (client name) throw early with clear messages

---

## Success Criteria for Wave B Completion

- At least **two complete attorney reviews** logged with side-by-side findings.
- All High severity issues either fixed or have a clear mitigation + attorney sign-off.
- `docs/template-preparation-guide.md` updated with real-world lessons learned from these reviews.
- Attorney quotes or ratings captured (even if informal).
- Clear statement: "The system is ready for production use with properly prepared templates" (or list remaining caveats).

---

## Related Documents

- [Attorney Guide](./attorney-guide.md) — General usage + PDF workflow
- [Template Preparation Guide](./template-preparation-guide.md)
- [Mapper Gap Analysis](./mapper-gap-analysis-real-templates.md) — Detailed variable inventory + known gaps vs. real attorney templates (critical input for interviews)
- `src/features/documents/mapper.ts` — Source of truth for variables
- `src/features/intake/schemas/intake.ts` — CA branching logic

---

**This document is the single source of truth for Phase 7 Wave B fidelity validation.**

Update it after every review session. Add new sections as needed. When Wave B is complete, this file becomes part of the Phase 7 handoff package.