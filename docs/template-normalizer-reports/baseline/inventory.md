# Baseline inventory (Trust Family corpus)

SHA-deduped sources under `apps/web/.local-document-storage/templates/`.

| File | Bytes | SHA256 (short) | Notes |
|------|------:|----------------|-------|
| `aaa-.../Trust-_Family-changed-mprg7y50.docx` | 57809 | `77206515…` | Distinct |
| `firm-12-.../Trust-_Family-changed-mprg6n30.docx` | 57809 | `77206515…` | **Duplicate** of mprg7y50 |
| `aaa-.../Trust-_Family-changed-mprnxupt.docx` | 57820 | `3a01b7b2…` | Distinct (largest) |
| `aaa-.../Trust-_Family-changed-mprpud8a.docx` | 55432 | `92d4cca2…` | Distinct |
| `verify/revocable_trust_test_v1.docx` | 3850 | `49a09257…` | Synthetic verify |

## Baseline `normalizeTemplate` results (foundation normalizer)

| Source | ok | repairs | warnings | syntax errors |
|--------|----|--------:|---------:|---------------|
| mprg7y50 / mprg6n30 | false | 11 | 6 | California/Diego stray braces |
| mprnxupt | false | 11 | 6 | same California/Diego |
| **mprpud8a** | **true** | 11 | 7 | none (compile+render pass) |
| verify | true | 0 | 1 | missing loop-item tags only |

Primary failure mode on failing Trust Family docs: **unopened/duplicate close tags** around prose containing `California` / `County of San Diego` after split-run merge — not alias renames.

