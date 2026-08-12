# Template Normalizer (Foundation)

**Goal**: Take a badly formatted attorney `.docx` and produce a better **docxtemplater** template that preserves original formatting and legal language while aligning placeholders to the mapper contract.

This is **not** legal drafting. The engine never invents clauses. It only repairs placeholder structure and renames tags.

**Mapper contract (source of truth)**: `apps/web/src/features/documents/mapper.ts` (`mapIntakeToDocVariables`)  
**Manual prep guide**: `docs/template-preparation-guide.md`

---

## Pipeline (this slice)

```
input.docx
  → repair-runs     (merge `{tags}` split across Word <w:t> runs; heal safe tag shape)
  → normalize-tags  (rename common aliases → mapper keys)
  → validate        (docxtemplater compile + fixture render, paragraphLoop: true)
  → output.normalized.docx + report JSON
```

| Step | Module | What it does |
|------|--------|----------------|
| 1 | `template-normalize/repair-runs.ts` | Opens the zip with PizZip; for `word/document.xml` and headers/footers, merges placeholders split across runs; trims spaces inside tags; collapses `{{tag}}` → `{tag}` when the inner text looks like a tag |
| 2 | `template-normalize/normalize-tags.ts` | Applies an alias table (`client_name` → `client_full_name`, `{#child}` → `{#children}`, etc.) and records every rename |
| 3 | `template-normalize/validate-template.ts` | Loads the buffer with Docxtemplater (same options as `generator.ts`) and dry-runs compile/render with empty-safe fixture variables |

Orchestrator: `normalizeTemplate()` / `normalizeTemplateBuffer()` in `template-normalize/normalize-template.ts`.

---

## What is automated today

- Split-run healing for likely `{placeholder}` tags
- Safe tag-shape fixes (inner whitespace, double braces)
- Alias renames toward the mapper contract (reported)
- Conservative warnings for ambiguous braces in legal prose (left unchanged)
- Validation errors for broken syntax (unclosed loops, etc.)

## What is **not** automated yet (next slice)

- **Sample-value detection**: finding filled client names / addresses in a “finished” Word draft and turning them into tags
- Dashboard upload UI for normalize jobs
- Changing mapper variable names
- Changing generation fidelity behavior

---

## How to run

From the repo root (pnpm workspace):

```bash
# Normalize a template
pnpm --filter web normalize-template -- ./path/to/attorney-template.docx

# Or directly
cd apps/web && pnpm exec tsx scripts/normalize-template.ts ./path/to/attorney-template.docx
```

Outputs (next to the input by default):

- `attorney-template.normalized.docx`
- `attorney-template.normalize-report.json`

Optional: `--out /tmp/out.docx` also writes `/tmp/out.normalize-report.json`.

### Programmatic

```ts
import { normalizeTemplate } from "@/features/documents/template-normalize";

const { buffer, report } = await normalizeTemplate({ kind: "path", path: "template.docx" });
```

---

## Report shape

The JSON report includes:

- `ok` — false if validation syntax errors (or input read failure)
- `repairs` — split-run merges, whitespace / double-brace fixes
- `renames` — each alias rewrite (`before` / `after`)
- `warnings` — ambiguous braces, unmatched loop openers in a paragraph, missing fixture tags
- `errors` — actionable validation / load failures
- `validation` — `{ ok, missingTags, syntaxErrors, messages }`

---

## Tests

Uses Node’s built-in test runner + `tsx` (same as `machine.test.ts`):

```bash
cd apps/web && npx tsx --test src/features/documents/template-normalize/*.test.ts
```

---

## Fidelity notes

- Stay on the **PizZip + raw Word XML** path (no alternate docx libraries)
- Only `<w:t>` text nodes are rewritten for placeholder healing; run properties, paragraphs, tables, headers/footers structure remain
- If a brace pair does not look like a docxtemplater tag, it is left alone and warned
- Generated documents remain DRAFT-for-attorney-review via the existing generator watermark path — normalization does not remove that requirement

Last updated: aligned with the foundation slice in `apps/web/src/features/documents/template-normalize/`.
