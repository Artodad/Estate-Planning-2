# Template Normalizer

**Goal**: Take a badly formatted attorney `.docx` and produce a better **docxtemplater** template that preserves original formatting and legal language while aligning placeholders to the mapper contract.

This is **not** legal drafting. The engine never invents clauses. It only repairs placeholder structure, renames tags, and (conservatively) turns high-confidence blanks/samples into mapper tags.

**Mapper contract (source of truth)**: `apps/web/src/features/documents/mapper.ts` (`mapIntakeToDocVariables`)  
**Manual prep guide**: `docs/template-preparation-guide.md`  
**Real-corpus reports**: `docs/template-normalizer-reports/`

---

## Pipeline

```
input.docx
  → repair-runs          (merge split `{tags}`; orphan `}` removal; heal safe tag shape)
  → detect-sample-values (underscore blanks / filled venue samples → tags when high-confidence)
  → normalize-tags       (rename common aliases → mapper keys; fix inverted settlor `{^has_spouse}`)
  → validate             (docxtemplater compile + fixture render, paragraphLoop: true)
  → output.normalized.docx + report JSON
```

| Step | Module | What it does |
|------|--------|----------------|
| 1 | `template-normalize/repair-runs.ts` | Opens the zip with PizZip; for `word/document.xml` and headers/footers, merges placeholders split across `<w:r>`/`<w:t>` runs (including mid-tag bold/italic and leading tabs); removes orphan `}` not part of any `{...}` pair; trims spaces inside tags; collapses `{{tag}}` → `{tag}` when safe |
| 2 | `template-normalize/detect-sample-values.ts` | High-confidence underscore blanks (`_[Name of Trust]_` → `{trust_name}`) and notary venue samples (`County of San Diego` → `County of {county_of_residence}`); low-confidence blanks reported as suggestions only |
| 3 | `template-normalize/normalize-tags.ts` | Alias table (`client_name` → `client_full_name`, `{#child}` → `{#children}`, etc.) |
| 4 | `template-normalize/validate-template.ts` | Docxtemplater dry-run with the same options as `generator.ts` |

Orchestrator: `normalizeTemplate()` / `normalizeTemplateBuffer()` in `template-normalize/normalize-template.ts`.

---

## What is automated today

- Split-run healing for likely `{placeholder}` tags — including fragments split by mid-tag bold/italic/underline, spellcheck, or leading `<w:tab/>` chrome
- Orphan closing-brace removal (real Trust Family notary pattern: `State of California` + tab runs + `}`)
- Safe tag-shape fixes (inner whitespace, double braces)
- High-confidence sample/blank → mapper tag replacements (reported)
- Low-confidence blank suggestions (reported, not rewritten)
- Alias renames toward the mapper contract (reported)
- Conservative warnings for ambiguous braces in legal prose (left unchanged)
- Validation errors for broken syntax (unclosed loops, etc.)

### Run-property strategy (conflicting `w:rPr`)

When `{client_full_name}` is broken across runs with different formatting (e.g. `{cli` + bold `ent` + `_full_name}`):

1. Detect the placeholder across consecutive runs (formatting differences ignored for detection).
2. Replace the fragment span with a **single** `<w:r>` whose text is the intact `{tag}` (prefix/suffix prose may share that run).
3. **Inherit `w:rPr` from the first fragment run.** Mid-tag bold/italic/underline on later fragment runs is dropped.
4. Preserve leading chrome (`<w:tab/>`, breaks) from the first fragment run.
5. Any text **after** the closing `}` that lived in the last fragment run is kept in a separate run using that **last** run’s `w:rPr`.

### Orphan `}` + zero-length runs

Word often inserts empty tab-only `<w:r>` runs between prose and a stray `}`. Character offsets must skip those zero-length runs when locating the closer — otherwise repair edits the wrong run and corrupts XML. Covered by unit tests derived from the real notary venue block.

## High-confidence sample/blank mappings

### v1

| Pattern | Tag | Notes |
|---------|-----|-------|
| `_[Name of Trust]_` | `{trust_name}` | Title line |
| `_[Name]_` immediately before `TRUST` / `Family Trust` | `{trust_name}` | Short name blank |
| `_[Name of settlor]_` | `{client_full_name}` | Citizenship / settlor blanks |
| Whole paragraph `County of <Name>` | `{county_of_residence}` | Notary venue sample only |

### v2 (iteration-2 promotions)

| Pattern | Tag | Notes |
|---------|-----|-------|
| `_[name of second successor trustee]_` | `{second_successor_trustee_full_name}` | Alternate / 2nd successor from decision makers |
| `_[city and state of marriage]_` | `{marriage_city_state}` | Optional intake `personal.marriageCityState` |
| `_[date of marriage]_` | `{marriage_date}` | Optional intake `personal.marriageDate` |
| `_[name of deemed survivor]_` | `{deemed_survivor_full_name}` | Dedicated key — does **not** guess spouse vs client |
| `_[first age]_` / `_[second age]_` / `_[third age]_` | `{first_distribution_age}` etc. | Staggered principal ladder |
| `_[age]_` after “under the age of” | `{young_person_retention_age}` | Young Persons clause only |
| `_[age]_` after “attains the age of” | `{outright_distribution_age}` | Single-age principal clause (not “has attained”) |

### v3 (Educational Trust ages + intake-backed fills)

| Pattern | Tag | Notes |
|---------|-----|-------|
| `_[age]_` after “under age” | `{educational_trust_eligibility_age}` | Distinct from Young Persons “under the age of” |
| `_[age]_` after “has attained the age of” | `{educational_trust_remainder_age}` | Distinct from outright “attains” |
| `_[age]_` after “he/she turns” / “they turns” | `{educational_trust_termination_age}` | Hold-until age |

All v2/v3 age + marriage + deemed-survivor + second-successor tags are intake-backed (optional fields; empty-safe when absent).

Low-confidence (suggestion only): free-text `[Description of distribution.]`, `[do/do not]` choice language, CEB “Can Choose a Specific Person…” drafting notes, citizenship OPTION wrappers.

---

## How to run

From the repo root (pnpm workspace):

```bash
# Normalize one template
pnpm --filter web normalize-template -- ./path/to/attorney-template.docx

# Batch the real Trust Family corpus + write reports
pnpm --filter web normalize-trust-corpus
```

Outputs (single-file CLI, next to the input by default):

- `attorney-template.normalized.docx`
- `attorney-template.normalize-report.json`

Optional: `--out /tmp/out.docx` also writes `/tmp/out.normalize-report.json`.

### Programmatic

```ts
import { normalizeTemplate } from "@/features/documents/template-normalize";

const { buffer, report } = await normalizeTemplate({ kind: "path", path: "template.docx" });
```

---

## Real Trust Family corpus results

SHA-deduped sources under `apps/web/.local-document-storage/templates/`:

| File | Distinct | Classification | Result |
|------|----------|----------------|--------|
| `Trust-_Family-changed-mprg7y50.docx` | yes (`77206515…`) | Partially tagged template + underscore blanks + notary orphan `}` | **pass** compile+render |
| `Trust-_Family-changed-mprg6n30.docx` | duplicate of mprg7y50 | same | **pass** |
| `Trust-_Family-changed-mprnxupt.docx` | yes (`3a01b7b2…`) | same failure mode as mprg7y50 | **pass** |
| `Trust-_Family-changed-mprpud8a.docx` | yes (`92d4cca2…`) | Partially tagged (no notary orphans) | **pass** (already at foundation baseline) |
| `verify/revocable_trust_test_v1.docx` | yes | Synthetic verify | **pass** |

Baseline (foundation only) had mprg7y50 / mprnxupt **failing** on notary orphan braces. After orphan-closer repair + sample detection, all distinct Trust Family docs pass. Per-file JSON: `docs/template-normalizer-reports/`.

These docs are **not** fully filled client samples — they are attorney templates mid-conversion (mapper-shaped tags already present, plus `_ [label] _` blanks and a few filled venue strings).

---

## Report shape

The JSON report includes:

- `ok` — false if validation syntax errors (or input read failure)
- `repairs` — split-run merges, orphan closer removals, whitespace / double-brace fixes, sample tags
- `renames` — each alias rewrite (`before` / `after`)
- `detections` — pass completions, low-confidence sample suggestions
- `warnings` — ambiguous braces, unmatched loop openers **in a single paragraph** (often benign with `paragraphLoop: true`), missing fixture tags
- `errors` — actionable validation / load failures
- `validation` — `{ ok, missingTags, syntaxErrors, messages }`

---

## Tests

Uses Node’s built-in test runner + `tsx` (same as `machine.test.ts`):

```bash
cd apps/web && pnpm test:unit:normalize
cd apps/web && pnpm test:unit:fidelity-smoke
```

Includes synthetic split-run / bold-split fixtures, notary orphan zero-length-run fixtures, sample/blank detection, and integration tests against the real corpus paths.

**Phase 7 fidelity smoke** (`template-fidelity-smoke.test.ts`): loads a real Trust Family `.docx` from `.local-document-storage` (skips with a clear message if absent), runs `normalizeTemplateBuffer` → `mapIntakeToDocVariables` → docxtemplater render (same options as `generator.ts`), then asserts the filled text/XML contains the spouse name inside the `{#has_spouse}` settlor region, the second successor name, at least two Educational Trust age strings (fixture uses 21/25/30), and marriage date or city when those tags exist after normalize.

---

## Remaining limitations

- Cross-paragraph loop open/close still warns per-paragraph (`UNMATCHED_LOOP_OPEN`) even when valid under `paragraphLoop: true`
- Optional soft-blank keys stay empty-safe strings in the mapper when intake omits them
- `[do/do not]` and free-text distribution descriptions stay suggestions (would invent conditionals / legal text)
- Filled personal names buried in prose (without labels) are not auto-detected
- Does not rewrite citizenship OPTION wrappers or invent conditional legal language
- Dashboard upload UI for normalize jobs is out of scope

Corpus reports: `docs/template-normalizer-reports/iteration/` (PR #2) and `…/iteration-2/` (soft-blank promotions).

---

## Fidelity notes

- Stay on the **PizZip + raw Word XML** path (no alternate docx libraries)
- Only `<w:t>` text (and whole orphan-`}` runs) are rewritten for placeholder healing; paragraph/table/header structure remains
- If a brace pair does not look like a docxtemplater tag, it is left alone and warned
- Generated documents remain DRAFT-for-attorney-review via the existing generator watermark path — normalization does not remove that requirement
