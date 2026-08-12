# Mapper Gap Analysis: Current Variables vs. Real Attorney Templates

**Phase**: 7 — Wave B (Real Template Fidelity Validation)  
**Date**: May 27, 2026 (initial analysis)  
**Status**: Living document — will be updated with findings from actual attorney template reviews.

## Purpose

This document provides a systematic analysis of the current `mapIntakeToDocVariables` implementation against the needs of real attorney-produced estate planning templates.

It serves as preparation for structured interviews (the YAML format you will provide) and as a reference during actual side-by-side fidelity reviews.

---

## 1. Current Mapper Output Inventory

The mapper lives in `src/features/documents/mapper.ts`.

### Core Shared Variables (always emitted)

**Client**
- `client_full_name`
- `client_first_name`
- `client_last_name`
- `client_dob`
- `client_email`
- `client_phone`

**Spouse / Marital**
- `has_spouse` (boolean)
- `spouse_full_name`
- `spouse_first_name`
- `spouse_last_name`

**Residency (CA-focused)**
- `is_ca_resident` (boolean)
- `is_married_and_ca` (boolean)
- `county_of_residence`

**Family**
- `children` (array)
  - `full_name`, `first_name`, `last_name`, `dob`, `age`, `is_minor`, `relationship`, `special_needs`, `guardian_preference`, `id`
- `has_minor_children` (boolean)
- `other_dependents` (array of strings)
- `pets` (array with `name`, `care_instructions`)

**Assets & Liabilities (strong CA community property support)**
- `assets` (array)
  - `description`, `type`, `estimated_value`, `ownership`, `is_community_property` (boolean), `location`, `current_beneficiary`, `notes`, `id`
- `has_community_property_assets` (boolean)
- `liabilities` (array with `creditor`, `type`, `balance`, `notes`)

**Decision Makers**
- `decision_makers` (full array with `id`, `role`, `full_name`, `first_name`, etc.)
- Convenience scalars:
  - `executor_full_name`
  - `successor_trustee_full_name`
  - `financial_poa_full_name`
  - `healthcare_agent_full_name`
  - `guardian_of_minor_full_name`

**Gifts & Distribution**
- `specific_gifts` (array: `beneficiary`, `description`, `amount`, `conditions`)
- `distribution_residuary` (array of beneficiaries with `name`, `relationship`, `share_percent`, `contingent_on`)
- `contingent_beneficiaries`
- `minor_trust_provisions`
- `spendthrift_clause` (boolean)

**Charitable**
- `charitable_organizations` (array: `name`, `ein`, `amount_or_percent`, `purpose`)

**Healthcare**
- `healthcare_instructions`
- `anatomical_gifts` (boolean)
- `polst_notes`
- `primary_physician`

**Prior Planning**
- `prior_planning_notes` (JSON string)
- `beneficiary_designations` (JSON string)
- `digital_assets_notes`

**Meta**
- `attorney_notes_for_document`
- `generation_date`
- `firm_name`
- `matter_display_name`
- `document_type`

### Document-Type Specific Additions

- **revocable_trust**:
  - `trust_name`
  - `has_pour_over_will`
  - `schedule_a_real_estate_count`
  - `schedule_b_personal_property_count`

- **pour_over_will**:
  - `will_title`
  - `executor_powers`
  - `guardian_nominations`
  - `has_revocable_trust`

Other document types (durable_poa, healthcare_directive, hipaa, certificate_of_trust, personal_property_memo, trust_funding) currently receive only the base variables.

---

## 2. Identified Potential Gaps vs. Typical Attorney Templates

Based on common patterns in real revocable trusts, wills, POAs, and healthcare directives used by estate planning attorneys (especially in California):

### High Priority / Frequently Needed

| Gap Area | Typical Attorney Template Need | Current Mapper Support | Risk Level | Notes |
|----------|--------------------------------|------------------------|------------|-------|
| **Trustee / Successor details** | Full name + contact for initial trustee (often the client) and multiple successors | Only `successor_trustee_full_name` scalar | Medium-High | Many trusts name the settlor as initial trustee + 2-3 successors with powers |
| **Trust powers & administration** | Detailed trustee powers language (often stays in template, but flags like "independent administration", "CA Probate Code 16200" references) | Minimal | Medium | Usually template-owned, but some attorneys want data-driven inclusion |
| **Pour-over language** | Specific pour-over clause wording + reference to trust name | Only `has_pour_over_will` boolean | Low-Medium | Usually template-controlled |
| **Special needs trusts / Supplemental needs** | Dedicated sections for disabled beneficiaries | Only basic `special_needs` string on child | High | Very common in modern trusts |
| **No-contest clauses** | Strong no-contest language with specific beneficiaries listed | Not directly supported | Medium | Often needs list of "interested persons" |
| **Digital assets** | Dedicated digital asset provisions (beyond notes) | Only free-text `digital_assets_notes` | Medium | Growing area (email, social, crypto) |
| **Pet trusts** | Formal pet trust provisions | Only basic `pets[]` array | Medium | Increasingly common |
| **Tax apportionment** | Detailed tax payment / apportionment instructions | Not present | Medium-High | Important in larger estates |
| **Funding schedules** | More granular Schedule A/B/C/D/E/F breakdowns | Only counts for real estate + personal property | Medium | Many attorneys have 6-8 custom schedules |
| **HIPAA / Healthcare specifics** | More structured healthcare agent powers, alternate agents, organ donation details | Basic fields only | Medium | HIPAA and AHCD templates are very detailed |

### Medium Priority

- Multiple levels of contingent beneficiaries with complex conditions
- Specific powers for financial POA (gifting, real estate, banking, tax)
- Healthcare directive: more granular end-of-life wishes, comfort care vs. aggressive treatment flags
- Trust termination / distribution ages for multiple children (currently only general `minor_trust_provisions`)
- Business interests / LLC / partnership details (beyond generic assets)
- Life insurance / retirement account beneficiary designations (structured, not just JSON)
- Prenuptial / postnuptial agreement references
- Out-of-state property situs handling

### Lower Priority / Usually Template-Owned

- Most legal boilerplate language (stays in the .docx)
- Specific statutory references (CA Probate Code sections)
- Signature blocks and notary language (usually template)
- Exhibit / schedule formatting

---

## 3. Document-Type Coverage Assessment

| Document | Current Variable Richness | Likely Real Template Needs | Gap Assessment |
|----------|---------------------------|----------------------------|----------------|
| Revocable Living Trust | Good (schedules, pour-over hooks, decision makers) | High (trustee powers, special needs, tax provisions, funding schedules) | Moderate gaps |
| Pour-Over Will | Basic + guardian | Moderate (tax apportionment, no-contest, specific powers) | Moderate gaps |
| Durable POA (Financial) | Basic decision maker scalars | High (detailed powers lists, gifting authority, successor chains) | Significant gaps |
| Advance Healthcare Directive | Basic | High (detailed wishes, multiple alternates, organ donation structure) | Significant gaps |
| HIPAA | Very thin | Moderate (agent authority, record access details) | Gaps |
| Certificate of Trust | Thin | Low-Moderate (trust name, date, trustees) | Minor gaps |
| Personal Property Memo | Thin | Low (simple list of tangible items) | Minor gaps |
| Trust Funding Instructions | None specific | Moderate (account-by-account instructions) | Gaps |

---

## 4. Recommendations (Prioritized)

1. **High Impact Additions** (do before or during first real attorney reviews)
   - Structured successor trustee chain (primary + 2 alternates with contact info)
   - Better support for special needs / supplemental needs trusts
   - Expanded digital assets section
   - Pet trust provisions
   - More granular POA powers (checkbox-style or structured)

2. **Medium Impact**
   - Improved healthcare directive granularity
   - Better contingent beneficiary modeling
   - Tax apportionment flags

3. **Process Recommendations**
   - During Wave B reviews, ask attorneys specifically: "What 5-10 variables or sections are most commonly hand-edited after generation?"
   - Maintain this document as the source of truth for mapper evolution.

---

## 5. Next Steps

- [ ] Incorporate findings from actual attorney template reviews (see `real-template-fidelity-reviews.md`)
- [ ] Update this document after each review session
- [ ] Feed high-priority gaps into mapper improvements (with tests)
- [ ] Use this analysis to inform the YAML interview structure you will provide

---

**This is a living analysis document.** It will become significantly more accurate and valuable once we have real attorney templates and feedback from Wave B interviews.