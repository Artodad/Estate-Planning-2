# Attorney Fidelity Interview System

**Version**: 1.0  
**Date**: May 27, 2026  
**Owner**: Estate Planning Engine (Phase 7 Wave B)  
**Purpose**: A repeatable, structured process for interviewing estate planning attorneys to validate and improve document fidelity, template compatibility, and real-world usability.

---

## 1. System Overview

This system transforms the traditional **Austin & Austin Estate Planning Interview** (the provided `interview-definition.yaml`) into a modern, AI-augmented **Fidelity Review Interview**.

### Core Objectives
- Understand how attorneys actually think about and structure their documents.
- Identify gaps between the current digital intake + mapper and real attorney templates.
- Collect high-quality, actionable feedback that directly improves the mapper, intake schema, and template preparation guidance.
- Produce consistent, comparable outputs across multiple attorney interviews.

---

## 2. Source Material

**Primary Source**: `interview-definition.yaml` (Austin & Austin Estate Planning Questionnaire)

This 17-step questionnaire represents a real, production attorney intake process. It is more detailed in several areas than our current `FullIntake` schema, making it an excellent benchmark.

---

## 3. Interview Structure

The system follows the same 17 steps as the source YAML but reframes each section with **dual purpose**:

1. **Traditional data gathering** (what the attorney currently asks clients)
2. **Fidelity & template discovery** (probing questions about how this data flows into their actual Word templates)

### The 17 Steps (Adapted for Fidelity Reviews)

| Step | Original Title                        | Fidelity Review Focus |
|------|---------------------------------------|-----------------------|
| 1    | Welcome                               | Context setting + expectations |
| 2    | Personal Information                  | Name variations, citizenship, remains/funeral language in templates |
| 3–4  | Marital Status + Spouse Info          | Community property handling, spousal provisions |
| 5    | Family Information                    | Children arrays, deceased children, grandparents, disinheritance language |
| 6    | Nominated Persons (Trustees/Executors)| Successor chains, powers, contact details in templates |
| 7    | Guardians for Minor Children          | Special needs language, guardian + financial manager separation |
| 8    | Power of Attorney                     | Detailed powers lists, gifting authority, successor structure |
| 9    | Advance Health Care Directive         | Granular healthcare wishes, multiple alternates, organ donation |
| 10   | Beneficiaries                         | Residuary, specific gifts, contingent, disinheritance clauses |
| 11   | Real Property                         | Schedule formatting, situs language, community vs separate |
| 12   | Financial Accounts & Safety Deposit   | Beneficiary designations, account titling |
| 13   | Insurance, Retirement, Investments    | Beneficiary designations vs trust pour-over |
| 14   | Business Interests, Vehicles, Other   | Business entity handling, tangible personal property memos |
| 15   | Estate Value Summary                  | Tax planning language, apportionment |
| 16   | Additional Notes                      | Open discovery |
| 17   | Review & Generate                     | Post-generation review process + pain points |

---

## 4. Interview Protocol (Recommended Flow)

### Phase A: Context (5–10 min)
- Explain the purpose of the fidelity review (not sales).
- Walk through one of their actual templates side-by-side with a generated version (if possible).
- Set expectations: We want to understand *their* language and structure.

### Phase B: Walk the Questionnaire (30–45 min)
For each major section:
1. Ask how they currently collect this information (reference the YAML fields).
2. Ask how this data appears in their actual templates (specific variable names, loops, conditionals, boilerplate they keep vs. data they insert).
3. Use **probing questions** (see Section 5).

### Phase C: Template Deep Dive (20–30 min)
- Pick 1–2 core documents (ideally Revocable Trust + Will).
- Go variable-by-variable or section-by-section.
- Compare against the current mapper output (use the [Mapper Gap Analysis](./mapper-gap-analysis-real-templates.md) as reference).

### Phase D: Synthesis (10 min)
- Ask the attorney to rate current pain points.
- Capture "If you could change one thing about how you gather or merge data today, what would it be?"

---

## 5. Key Probing Question Bank

Use these questions (adapted per section) during interviews:

### General
- "When you look at your current templates, which pieces are pure boilerplate that never change vs. things you hand-edit for every client?"
- "What data do you *wish* clients brought you in a more structured way?"
- "What are the top 3 things you or your staff have to fix or add after running a client's information through any system?"

### Specific Sections
- **Successor Trustees / Decision Makers**: "How many levels of successors do you typically name? Do you want phone/email/address for all of them in the document?"
- **Special Needs / Disabled Beneficiaries**: "Do you have dedicated language or trusts for beneficiaries with special needs? How is that triggered in your current process?"
- **Digital Assets**: "How much detail do you currently capture and put into documents about digital assets, email accounts, crypto, etc.?"
- **Community Property**: "How do you currently distinguish and document community vs. separate property in your trusts and schedules?"
- **Specific Gifts**: "Do you prefer a separate Personal Property Memorandum, or do you list them inside the trust/will? How structured is that list?"
- **Tax / Apportionment**: "Do you include detailed tax apportionment language? Is that data-driven or always the same boilerplate?"

---

## 6. Output Format (Required)

Every interview should produce output in this structure (copy into `real-template-fidelity-reviews.md`):

```markdown
### Attorney: [Name/Firm - anonymized]
**Date**: 
**Documents Reviewed**:

#### Key Findings
| Theme | Finding | Severity | Recommended Action | Mapper Impact? |
|-------|---------|----------|--------------------|----------------|

#### High-Value Variables / Sections Not Well Supported Today
- 

#### Attorney Quotes (especially pain points)
- 

#### Fidelity Rating (1-10) + Rationale
```

---

## 7. Mapping to Current System

This YAML should be cross-referenced against:
- `FullIntake` schema (`src/features/intake/schemas/intake.ts`)
- `mapIntakeToDocVariables` (`src/features/documents/mapper.ts`)
- The 8 core `DocumentType`s

See the living [Mapper Gap Analysis](./mapper-gap-analysis-real-templates.md) for the current state of this mapping.

---

## 8. Usage Instructions

1. Prepare by reviewing the attorney's sample templates (if available) + the latest gap analysis.
2. Run the interview following the 17-step structure + probing questions.
3. Immediately after the call, fill out the output format above.
4. Update the gap analysis with any new validated needs.
5. Add concrete examples to the Template Preparation Guide.

---

**This is now the official system for conducting attorney fidelity interviews in Phase 7 and beyond.**

Ready for your YAML? It's already loaded. I can now generate:
- A full AI system prompt based on this
- A structured interview script
- Specific question sets per section
- An output parser / template

Just say the word and tell me the format you want me to produce next.