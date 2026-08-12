# Template Preparation Guide for Attorneys

**Goal**: Help estate planning attorneys prepare their existing Word templates so they work perfectly with the Estate Planning Engine while preserving 100% of their original language, formatting, styles, and structure.

**Authoritative source**: Every variable below is emitted by `apps/web/src/features/documents/mapper.ts` (`mapIntakeToDocVariables`). If this guide and the mapper ever disagree, treat the mapper as correct and report the discrepancy.

This guide is updated alongside intake + mapper changes and real attorney template reviews (Phase 7 Wave B).

---

## Core Philosophy

The system never touches your template text. It only injects data using `docxtemplater`. Your templates remain the single source of truth for legal language.

**You own the templates. We only merge client data.**

---

## How Intake Maps to Template Tags

The wizard collects answers in **sections** (Personal, Family, Assets, etc.). Those answers are **not** pasted into Word under the same names. The engine normalizes them into **snake_case** variables for your `.docx` tags.

| Intake section | Primary template variables |
|----------------|--------------------------|
| Personal Information | `client_*`, `has_spouse`, `spouse_*`, `is_ca_resident`, `is_married_and_ca`, `county_of_residence` |
| Family & Relationships | `children`, `has_minor_children`, `other_dependents`, `pets` |
| Assets | `assets`, `has_community_property_assets` |
| Liabilities | `liabilities` |
| Decision Makers | `decision_makers`, `executor_full_name`, `successor_trustee_full_name`, etc. |
| Specific Gifts & Bequests | `specific_gifts` |
| Distribution Wishes | `distribution_residuary`, `contingent_beneficiaries`, `minor_trust_provisions`, `spendthrift_clause` |
| Charitable Intent | `charitable_organizations` |
| Healthcare & End-of-Life | `healthcare_instructions`, `primary_physician`, `anatomical_gifts`, `polst_notes`, `healthcare_agent_full_name` |
| Prior Planning | `prior_planning_notes`, `beneficiary_designations`, `digital_assets_notes` |
| (Attorney / system meta) | `attorney_notes_for_document`, `generation_date`, `firm_name`, `matter_display_name`, `document_type` |

Use **exact** tag names (case-sensitive). Example: intake “County of Residence” → `{county_of_residence}`.

---

## Complete Variable Reference (Mapper Contract)

All variables below are emitted on **every** document generation unless noted as document-type-specific. Arrays are always present (empty `[]` when no rows). Strings default to `""`. Booleans are always `true` or `false`.

### Client (Personal → client)

| Variable | Type | Description |
|----------|------|-------------|
| `client_full_name` | string | First + last (required for generation) |
| `client_first_name` | string | |
| `client_last_name` | string | |
| `client_dob` | string | `YYYY-MM-DD` |
| `client_email` | string | |
| `client_phone` | string | |

### Spouse / Partner (Personal → spouseOrPartner)

Derived from marital status (`married` / `partnered`). When not applicable, spouse strings are empty and `has_spouse` is `false`.

| Variable | Type | Description |
|----------|------|-------------|
| `has_spouse` | boolean | `true` if married or partnered |
| `spouse_full_name` | string | |
| `spouse_first_name` | string | |
| `spouse_last_name` | string | |

**Conditional (unmarried):** `{^has_spouse}…{/has_spouse}`

### California residency (Personal)

| Variable | Type | Description |
|----------|------|-------------|
| `is_ca_resident` | boolean | From “California Resident?” checkbox |
| `is_married_and_ca` | boolean | CA resident **and** married/partnered (community-property workflows) |
| `county_of_residence` | string | Free text, e.g. `Los Angeles` |

**Example:**

```docx
{#is_ca_resident}
Client resides in {county_of_residence} County, California.
{/is_ca_resident}
```

### Family (Family & Relationships)

| Variable | Type | Description |
|----------|------|-------------|
| `children` | array | Loop: `{#children}…{/children}` |
| `has_minor_children` | boolean | From DOB and/or explicit minor flag |
| `other_dependents` | array of strings | Names or descriptions |
| `pets` | array | Loop: `{#pets}…{/pets}` |

**Inside `{#children}` loop:**

| Field | Type | Notes |
|-------|------|-------|
| `full_name` | string | Computed |
| `first_name`, `last_name` | string | |
| `dob` | string | `YYYY-MM-DD` |
| `age` | number | Computed from DOB |
| `is_minor` | boolean | Computed or explicit |
| `relationship` | string | e.g. son, daughter |
| `special_needs` | string | |
| `guardian_preference` | string | Data only — template owns legal language |
| `id` | string | Stable list key (optional) |

**Inside `{#pets}` loop:** `name`, `care_instructions`

### Assets (Assets)

| Variable | Type | Description |
|----------|------|-------------|
| `assets` | array | Loop: `{#assets}…{/assets}` |
| `has_community_property_assets` | boolean | `true` if any asset has `ownership === community` |

**Inside `{#assets}` loop:**

| Field | Type | Notes |
|-------|------|-------|
| `description` | string | Required in intake |
| `type` | string | See asset types below |
| `estimated_value` | number | USD; may be blank |
| `ownership` | string | See ownership values below |
| `is_community_property` | boolean | `true` when ownership is `community` |
| `location` | string | Situs / location (esp. real property) |
| `current_beneficiary` | string | TOD/POD designation notes |
| `notes` | string | |
| `id` | string | Optional stable key |

**Asset `type` values:** `real_estate`, `bank_account`, `brokerage`, `retirement`, `business_interest`, `personal_property`, `vehicle`, `other`

**Asset `ownership` values:** `separate`, `community`, `joint`, `tenant_in_common`, `other`

### Liabilities (Liabilities)

| Variable | Type | Description |
|----------|------|-------------|
| `liabilities` | array | Loop: `{#liabilities}…{/liabilities}` |

**Inside loop:** `creditor`, `type`, `balance` (number), `notes`

**Liability `type` values:** `mortgage`, `auto_loan`, `credit_card`, `personal_loan`, `other`

### Decision makers (Decision Makers)

| Variable | Type | Description |
|----------|------|-------------|
| `decision_makers` | array | Full list — loop when you need alternates or multiple roles |
| `executor_full_name` | string | First person with role `executor` |
| `successor_trustee_full_name` | string | Role `successor_trustee` |
| `financial_poa_full_name` | string | Role `financial_poa` |
| `healthcare_agent_full_name` | string | Role `healthcare_agent` (or cross-ref from healthcare section) |
| `guardian_of_minor_full_name` | string | Role `guardian_minor` |

**Inside `{#decision_makers}` loop:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `role` | string | See role values below |
| `full_name`, `first_name`, `last_name` | string | |
| `email`, `phone`, `dob` | string | |
| `alternate_for` | string | Optional link to another nominee |
| `notes` | string | |

**Decision-maker `role` values:** `executor`, `successor_trustee`, `financial_poa`, `healthcare_agent`, `guardian_minor`, `alternate`

Use scalar shortcuts (`executor_full_name`, etc.) for one name per role. Use the array for full tables or alternates.

### Specific gifts (Specific Gifts & Bequests)

| Variable | Type | Description |
|----------|------|-------------|
| `specific_gifts` | array | Loop: `{#specific_gifts}…{/specific_gifts}` |

**Inside loop:** `beneficiary`, `description`, `amount` (number, optional), `conditions`

### Distribution (Distribution Wishes)

| Variable | Type | Description |
|----------|------|-------------|
| `distribution_residuary` | array | Residuary beneficiaries — loop |
| `contingent_beneficiaries` | array | Same shape as residuary |
| `minor_trust_provisions` | string | Free text (data notes; template owns legal language) |
| `spendthrift_clause` | boolean | From intake checkbox |

**Inside `{#distribution_residuary}` / `{#contingent_beneficiaries}` loops:**

| Field | Type |
|-------|------|
| `name` | string |
| `relationship` | string |
| `share_percent` | number | 0–100 |
| `contingent_on` | string |

### Charitable intent (Charitable Intent)

| Variable | Type | Description |
|----------|------|-------------|
| `charitable_organizations` | array | Loop: `{#charitable_organizations}…{/charitable_organizations}` |

**Inside loop:** `name`, `ein`, `amount_or_percent`, `purpose`

### Healthcare (Healthcare & End-of-Life)

| Variable | Type | Description |
|----------|------|-------------|
| `healthcare_instructions` | string | Care / AHCD-style instructions (data only) |
| `primary_physician` | string | |
| `anatomical_gifts` | boolean | Willing to be anatomical donor |
| `polst_notes` | string | POLST-related preferences (not the form itself) |

Healthcare agent name is also available as `healthcare_agent_full_name` (see Decision makers).

### Prior planning (Prior Planning)

| Variable | Type | Description |
|----------|------|-------------|
| `prior_planning_notes` | string | JSON string of existing documents array |
| `beneficiary_designations` | string | JSON string of TOD/POD-style designations |
| `digital_assets_notes` | string | Free text |

These structured lists are serialized as JSON strings for MVP templates. Prefer loops in a future mapper version if your templates need row-by-row prior-document tables.

### Meta / generation context

| Variable | Type | Description |
|----------|------|-------------|
| `attorney_notes_for_document` | string | From intake meta / attorney notes |
| `generation_date` | string | `YYYY-MM-DD` |
| `firm_name` | string | Current firm |
| `matter_display_name` | string | Client display name or full name |
| `document_type` | string | e.g. `revocable_trust`, `pour_over_will` |

---

## Document-type-specific variables

Added on top of the shared set when generating that document type.

### `revocable_trust`

| Variable | Type | Description |
|----------|------|-------------|
| `trust_name` | string | e.g. `{LastName} Revocable Living Trust` |
| `has_pour_over_will` | boolean | Coordinated package flag |
| `schedule_a_real_estate_count` | number | Count of assets with `type === real_estate` |
| `schedule_b_personal_property_count` | number | Count of `personal_property` + `vehicle` assets |

### `pour_over_will`

| Variable | Type | Description |
|----------|------|-------------|
| `will_title` | string | e.g. `{Client Full Name} Pour-Over Will` |
| `executor_powers` | string | Placeholder scalar (`standard`); clause language stays in template |
| `guardian_nominations` | string | Guardian name if nominated |
| `has_revocable_trust` | boolean | Coordinated package flag |

### Other document types (`durable_poa`, `healthcare_directive`, `hipaa`, `certificate_of_trust`, `personal_property_memo`, `trust_funding`)

These receive the **full shared variable set** above. Type-specific extensions are not yet defined in the mapper — add tags from the shared catalog until custom fields are added for those templates.

---

## Intake fields collected but not yet template variables

The wizard may collect data that is **stored** in the intake but **not** exposed as docxtemplater tags today. Do not use these names in templates until the mapper is extended:

| Intake field | Status |
|--------------|--------|
| `personal.maritalStatus` | Only reflected indirectly via `has_spouse` |
| `personal.citizenshipImmigrationNotes` | Not mapped |
| `personal.spouseOrPartner` (DOB, email, phone) | Only spouse names mapped |
| `liabilities[].securedByAssetId` | Not mapped |
| `healthcare.healthcareAgentId` | Used internally to resolve `healthcare_agent_full_name` only |
| `meta.version`, `completedSections`, `lastSavedAt` | Not mapped |

If your template needs any of these, note the gap in a fidelity review or request a mapper update — **never** invent new tag names without aligning the mapper.

---

## Recommended Template Patterns

### Repeating sections (loops)

```docx
{#children}
Child: {full_name}, Age: {age}, Minor: {is_minor}
{/children}

{#assets}
{description} ({type}) — ${estimated_value}
{/assets}
```

### Conditionals

```docx
{^has_spouse}
Client is unmarried.
{/has_spouse}

{#has_minor_children}
Special provisions for minor children apply.
{/has_minor_children}

{#is_married_and_ca}
Community property characterization may apply to marital assets.
{/is_married_and_ca}
```

### Community property (California)

```docx
{#assets}
{#is_community_property}
{description} — community property ({location})
{/is_community_property}
{/assets}
```

### Role-based decision makers

Use scalars for a single primary name:

```docx
Executor: {executor_full_name}
Successor Trustee: {successor_trustee_full_name}
```

Use `{#decision_makers}` when you need the full table or alternates.

---

## Best Practices for Your Templates

1. **Match mapper output exactly** — snake_case, case-sensitive.
2. **Provide fallbacks** for optional data (empty string, omit paragraph, or `{^has_spouse}` blocks).
3. **Test edge cases**:
   - Unmarried client, no children
   - Minor children + guardian role filled
   - Mixed community / separate property
   - Empty optional arrays (gifts, charitable orgs, liabilities)
4. **Keep the DRAFT header** in a stable location; the engine reinforces it on every page.
5. **Avoid complex nested tables inside loops** — common source of formatting drift.
6. **Document custom tags** only after the mapper emits them.

---

## Testing Your Templates (The Fidelity Playbook)

1. Complete a realistic test intake (or use a staff test client) covering the sections your template uses.
2. Generate the document from the dashboard.
3. Open **both** the original template and the generated `.docx` in Microsoft Word.
4. View in **Print Layout** at 100% zoom.
5. Compare page-by-page: headers/footers, numbering, tables, spacing, conditionals.
6. Log differences in `docs/real-template-fidelity-reviews.md`.

If generation fails, read the error message — missing or mismatched variables are listed intentionally (no partial/silent renders).

---

## Common Pitfalls & Fixes

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `{variable_name}` appears literally in output | Name mismatch or typo | Match this guide / mapper exactly |
| Loop renders nothing | Wrong loop name or inner field | Use `{#children}` not `{#child}`; check inner keys |
| Community property block never shows | Using `{is_community_property}` as text | Use `{#is_community_property}…{/is_community_property}` inside `{#assets}` |
| County missing | Tag name wrong | Use `{county_of_residence}` (intake: County of Residence) |
| Liabilities / pets / charitable blocks empty | Section not in old guide | Use variables listed in this document |
| DRAFT watermark misplaced | Template structure | Move DRAFT placeholder to header or stable first paragraph |

---

## Related documentation

- **Full inventory + gap analysis:** `docs/mapper-gap-analysis-real-templates.md`
- **Attorney workflow:** `docs/attorney-guide.md`
- **Side-by-side review process:** `docs/real-template-fidelity-reviews.md`

---

## Next Steps for Attorneys

1. Start with Revocable Living Trust + Pour-Over Will.
2. Tag templates using the **Complete Variable Reference** above.
3. Run test generation and side-by-side Word review.
4. Share findings for the fidelity log.

---

Last updated: May 29, 2026 — synced to `mapIntakeToDocVariables` in `apps/web/src/features/documents/mapper.ts`.
