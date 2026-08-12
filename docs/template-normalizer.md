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
  → normalize-tags       (rename common aliases → mapper keys)
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

## High-confidence sample/blank mappings (v1)

| Pattern | Tag | Notes |
|---------|-----|-------|
| `_[Name of Trust]_` | `{trust_name}` | Title line |
| `_[Name]_` immediately before `TRUST` / `Family Trust` | `{trust_name}` | Short name blank |
| `_[Name of settlor]_` | `{client_full_name}` | Citizenship / settlor blanks |
| Whole paragraph `County of <Name>` | `{county_of_residence}` | Notary venue sample only |

Low-confidence (suggestion only): second successor trustee, marriage city/date, deemed survivor, distribution descriptions, age ladders, do/do not choice language.

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

### Dashboard upload integration

Owner template upload (`/dashboard/templates` → `uploadTemplateForCurrentFirm`) runs the same pipeline automatically via `prepareTemplateUpload()`:

1. Read the uploaded `.docx` buffer (firm-scoped RBAC unchanged).
2. Run `normalizeTemplateBuffer` (repair → sample detect → alias/polarity → validate).
3. **If validation fails** (`report.ok === false` — syntax/compile errors): **reject the upload** with an actionable error listing broken tags/loops. The template is not persisted. (Safer than the previous accept-any-`.docx` behavior; warnings / missing fixture tags do **not** block upload.)
4. **If validation passes**: persist **normalized** bytes as `Template.fileKey` (what generation reads). Also write the attorney’s original bytes to a side key `*.original.docx` (`computeOriginalTemplateFileKey`) for audit / re-normalize. No Prisma schema change — only `fileKey` is registered.
5. Return a client-safe `TemplateUploadNormalizeSummary` (counts + capped highlights). `TemplateUploadForm` shows success + summary (or warnings); validation failures use the existing error callout pattern.

**Opt-out:** FormData `skipNormalize=true` (UI checkbox “Skip auto-normalize (template already prepared)”, default off) stores uploaded bytes as `Template.fileKey` with no normalize report and no `*.original.docx` side file.

Generation always uses the primary `Template.fileKey` bytes. Original side files are not selected by the template resolver.

---

## Real Trust Family corpus results

SHA-deduped sources under `apps/web/.local-document-storage/templates/`:

| File | Distinct | Classification | Result |
|------|----------|----------------|--------|
| `Trust-_Family-changed-mprg7y50.docx` | yes (`5a04f290…`) | Partially tagged template + underscore blanks + notary orphan `}` | **pass** compile+render |
| `Trust-_Family-changed-mprg6n30.docx` | duplicate of mprg7y50 | same | **pass** |
| `Trust-_Family-changed-mprnxupt.docx` | yes (`eba34174…`) | same failure mode as mprg7y50 | **pass** |
| `Trust-_Family-changed-mprpud8a.docx` | yes (`f517a39c…`) | Partially tagged (no notary orphans) | **pass** (already at foundation baseline) |
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
```

Includes synthetic split-run / bold-split fixtures, notary orphan zero-length-run fixtures, sample/blank detection, upload-path adapter tests (`prepare-template-upload.test.ts`), and integration tests against the real corpus paths.

---

## Remaining limitations

- Cross-paragraph loop open/close still warns per-paragraph (`UNMATCHED_LOOP_OPEN`) even when valid under `paragraphLoop: true`
- Many underscore blanks have **no mapper key** yet (second successor, marriage details, age ladders) — reported as suggestions only
- Filled personal names buried in prose (without labels) are not auto-detected
- Does not rewrite `<OPTION>` attorney drafting notes or invent conditional legal language
- Upload stores original as a side file only (no `originalFileKey` column yet); dual-store UX beyond the normalize report is future work

---

## Fidelity notes

- Stay on the **PizZip + raw Word XML** path (no alternate docx libraries)
- Only `<w:t>` text (and whole orphan-`}` runs) are rewritten for placeholder healing; paragraph/table/header structure remains
- If a brace pair does not look like a docxtemplater tag, it is left alone and warned
- Generated documents remain DRAFT-for-attorney-review via the existing generator watermark path — normalization does not remove that requirement
