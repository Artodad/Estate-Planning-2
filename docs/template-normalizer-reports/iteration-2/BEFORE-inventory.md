# Iteration-2 BEFORE inventory — soft (suggestion-only) blanks

Source: PR #2 iteration reports (`docs/template-normalizer-reports/iteration/`), Trust Family corpus.

**Historical snapshot** of the iteration-2 promote/keep decisions. Iteration-3 later promoted the three Educational Trust `[age]` blanks to distinct high-confidence tags — see `../iteration-3/SUMMARY.md`. Do not treat the “Keep suggestion” row for Educational Trust ages as current.

## Baseline counts (per distinct Trust Family doc)

| Metric | mprg7y50 / mprnxupt / mprpud8a |
|--------|-------------------------------:|
| High-confidence sample tags | 5 |
| Low-confidence suggestions | 15 |
| Compile+render | pass |

Already high-confidence (v1): `_[Name of Trust]_`, `_[Name]_` before TRUST, `_[Name of settlor]_` (×2), filled `County of San Diego`.

## Soft blanks observed (15 suggestions)

| Count | Blank label | Rule id | Why still soft (iteration-1) | Iteration-2 decision |
|------:|-------------|---------|------------------------------|----------------------|
| 1 | `[name of second successor trustee]` | `blank_second_successor_trustee` | Mapper only had primary `successor_trustee_full_name` | **Promote** → `{second_successor_trustee_full_name}` (alternate / 2nd successor) |
| 1 | `[city and state of marriage]` | `blank_city_state_marriage` | No mapper key | **Promote** → `{marriage_city_state}` |
| 1 | `[date of marriage]` | `blank_date_of_marriage` | No mapper key | **Promote** → `{marriage_date}` |
| 1 | `[name of deemed survivor]` | `blank_deemed_survivor` | No mapper key; who is survivor is case-specific | **Promote** → `{deemed_survivor_full_name}` (dedicated key; do **not** guess spouse vs client) |
| 2 | `[Description of distribution.]` | `blank_distribution_description` | Free-form attorney drafting | **Keep suggestion** |
| 1 | `[do/do not]` | `blank_do_do_not` | Choice language needs conditionals, not a scalar fill | **Keep suggestion** |
| 1 | `[first age]` | `blank_age` | No dedicated mapper keys | **Promote** → `{first_distribution_age}` |
| 1 | `[second age]` | `blank_age` | No dedicated mapper keys | **Promote** → `{second_distribution_age}` |
| 1 | `[third age]` | `blank_age` | No dedicated mapper keys | **Promote** → `{third_distribution_age}` |
| 1 | `[age]` after “under the age of” (Young Persons) | `blank_age` | Bare age ambiguous across clauses | **Promote** (label-anchored) → `{young_person_retention_age}` |
| 1 | `[age]` after “attains the age of” (single-age principal) | `blank_age` | Bare age ambiguous across clauses | **Promote** (label-anchored) → `{outright_distribution_age}` |
| 3 | `[age]` in Educational Trust clauses | `blank_age` | Three distinct educational ages; same tag would force equality | **Keep suggestion** at iteration-2; **promoted in iteration-3** to `{educational_trust_eligibility_age}` / `{educational_trust_remainder_age}` / `{educational_trust_termination_age}` |

## Also present in corpus but not yet reported as suggestions

| Blank / note | Decision |
|--------------|----------|
| Citizenship OPTION `_[We are both/We are not/ … ]_` wrapping settlor names | **Keep untouched** — attorney drafting option, not a scalar mapper value |
| `_[Can Choose a Specific Person if Beneficiary Dies Before Distribution]_` | **Report as suggestion** — attorney choice note, not auto-tagged |

## Expected AFTER (target)

| Metric | Before | After (target) |
|--------|-------:|---------------:|
| Sample tags / distinct Trust doc | 5 | ~14 |
| Suggestions / distinct Trust doc | 15 | ~6 (+ optional new CEB suggestion) |
| Compile+render | pass | still pass |
