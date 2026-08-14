# Trust Family corpus — iteration-3 (Educational Trust ages + intake loop)

Wires intake → mapper → template fills for v2 soft-blank promotions, and promotes Educational Trust bare `[age]` ×3 to distinct high-confidence tags.

`UNMATCHED_LOOP_OPEN` for `{#children}` / `{#distribution_residuary}` was a per-paragraph false positive (closers live in later paragraphs). That warning is now scoped to the XML part; those two tags no longer warn when a matching closer exists in the same part.

## Before → after (per distinct Trust Family doc)

| Metric | Iteration-2 (PR #4) | Iteration-3 | Δ |
|--------|--------------------:|------------:|--:|
| Sample tags | 14 | **17** | **+3** |
| Suggestions | 7 | **≤4** | **−3** |
| Compile+render | pass | **pass** | — |
| Intake-backed fills | partial (empty stubs for ages / deemed survivor) | **full for promoted tags** | — |

## Graduated → high-confidence tags (Educational Trust)

| Blank / prose | Tag | Intake field |
|---------------|-----|--------------|
| “under age `[age]`” (Educational Trust eligibility) | `{educational_trust_eligibility_age}` | `distribution.educationalTrustEligibilityAge` |
| “has attained the age of `[age]`” (remainder) | `{educational_trust_remainder_age}` | `distribution.educationalTrustRemainderAge` |
| “he/she turns `[age]`” (hold-until) | `{educational_trust_termination_age}` | `distribution.educationalTrustTerminationAge` |

## Intake-backed (was empty-safe stub)

| Tag | Intake source |
|-----|---------------|
| `{marriage_city_state}` / `{marriage_date}` | `personal.marriageCityState` / `marriageDate` (wizard Personal) |
| `{deemed_survivor_full_name}` | `personal.deemedSurvivorFullName` |
| `{second_successor_trustee_full_name}` | 2nd `successor_trustee` or `alternate` (Decision Makers) |
| `{young_person_retention_age}`, `{first/second/third_distribution_age}`, `{outright_distribution_age}` | `distribution.*` (wizard Distribution) |
| Educational Trust ages (above) | `distribution.educationalTrust*` |

## Still suggestions (not auto-tagged)

- `[Description of distribution.]` ×2 — free-form drafting
- `[do/do not]` ×1 — would invent conditionals
- CEB “Can Choose a Specific Person…” ×1 — attorney drafting note

## Verification

```bash
cd apps/web && pnpm test:unit:normalize
pnpm test:unit:intake-fill
```
