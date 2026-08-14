# Trust Family corpus — iteration-2 (soft-blank promotions)

## Before → after (per distinct Trust Family doc)

| Metric | Iteration-1 (PR #2) | Iteration-2 | Δ |
|--------|--------------------:|------------:|--:|
| Sample tags | 5 | **14** | **+9** |
| Suggestions | 15 | **7** | **−8** |
| Compile+render | pass | **pass** | — |

## Per-file results

| File | Distinct | ok | repairs | orphans removed | samples tagged | suggestions | syntax errors |
|---|---|---|---:|---:|---:|---:|---|
| `Trust-_Family-changed-mprg7y50` | yes | true | 28 | 3 | 14 | 7 | — |
| `Trust-_Family-changed-mprnxupt` | yes | true | 28 | 3 | 14 | 7 | — |
| `Trust-_Family-changed-mprpud8a` | yes | true | 25 | 0 | 14 | 7 | — |
| `Trust-_Family-changed-mprg6n30` | dup→Trust-_Family-changed-mprg7y50 | true | 28 | 3 | 14 | 7 | — |
| `revocable_trust_test_v1` | yes | true | 0 | 0 | 0 | 0 | — |

## Graduated (suggestion → tag)

- second successor → `{second_successor_trustee_full_name}`
- marriage city/state + date → `{marriage_city_state}` / `{marriage_date}`
- deemed survivor → `{deemed_survivor_full_name}`
- first/second/third age → `{*_distribution_age}`
- Young Persons “under the age of `[age]`” → `{young_person_retention_age}`
- single-age “attains the age of `[age]`” → `{outright_distribution_age}`

## Remaining suggestions (7)

- `[Description of distribution.]` ×2
- `[do/do not]` ×1
- Educational Trust bare `[age]` ×3
- CEB “Can Choose a Specific Person…” ×1

See `BEFORE-inventory.md` for the promote/keep rationale.

Normalized `.docx` outputs are regenerable via:

```bash
pnpm --filter web normalize-trust-corpus -- --out-dir ../../docs/template-normalizer-reports/iteration-2
```
