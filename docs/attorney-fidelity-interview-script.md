# Attorney Fidelity Interview Script & Question Bank

**Based on**: Austin & Austin Estate Planning Interview (your `interview-definition.yaml`)  
**Framework**: Attorney Fidelity Interview System  
**Date**: May 27, 2026

---

## How to Use This Script

- Follow the 17 steps in order (this mirrors the attorney's current process — they will be comfortable with the flow).
- For each section, use the **Standard Questions** + **Fidelity Probing Questions**.
- The probing questions are the most important part for Wave B.
- Capture answers using the output format in the main system document.

---

## Step 1: Welcome & Context Setting

**Goal**: Set the right tone (diagnostic, not sales).

**Opening Script**:
> "Thank you for doing this. I've looked at the questionnaire you currently use with clients. What I'd like to do today is walk through it together, but with a different lens.
>
> Instead of just talking about data collection, I want to understand how the information you gather actually flows into your real Word templates — what variables you use, what sections you still have to hand-edit, what causes the most friction for you or your staff after you get client information.
>
> The goal is to help us build something that removes mechanical work while protecting 100% of your language and formatting. Sound okay?"

**Key Questions**:
- How long does it typically take a client to complete your current questionnaire?
- What parts of the process (gathering info or merging it into documents) create the most back-and-forth or rework?
- If you could wave a magic wand, what one part of preparing documents from client information would you eliminate or dramatically improve?

---

## Step 2: Personal Information

**Standard Flow** (from YAML):
- Legal name, other names, phones, DOB, email, citizenship, addresses, employment, prior marriages, disposition of remains, funeral instructions, existing documents.

**Fidelity Probing Questions**:
- In your documents, how do you handle "other names" / a.k.a. / f.k.a.? Does it appear in the trust, will, or both?
- How important is citizenship status in your templates? Does it trigger specific language?
- For disposition of remains and funeral instructions — is this free text that goes into a specific section, or do you have standardized clauses that are selected based on answers?
- When a client has existing estate planning documents, how do you currently reference them in the new documents you prepare?

---

## Steps 3–4: Marital Status + Spouse Information

**Fidelity Probing Questions**:
- How do you handle community property characterization in your trusts and schedules? Do you have specific language or schedules that differ based on whether assets are community or separate?
- When both spouses are doing plans, how much information do you duplicate vs. cross-reference between the two sets of documents?
- Do you ever create joint trusts vs. individual trusts based on marital status? How is that decision reflected in the documents?

---

## Step 5: Family Information (Children, Grandchildren, Deceased, Parents)

**Fidelity Probing Questions**:
- Walk me through how children appear in your revocable trust (especially the looping structure).
- How do you handle minor children vs. adult children differently in the documents?
- For special needs or disabled beneficiaries — do you have dedicated supplemental needs trust language? How is that triggered from the intake?
- How do you document and handle disinherited children or grandchildren in the actual trust/will language?
- Do you list parents or other relatives as contingent beneficiaries? How structured is that?

**High-Value Probe**:
> "Can you show me (or describe) the exact section in your trust where children are listed, including any age or distribution conditions?"

---

## Step 6: Nominated Persons (Successor Trustees / Executors)

**Fidelity Probing Questions**:
- How many levels of successor trustees do you typically name (primary + how many backups)?
- What contact information (address, phone, email) actually makes it into the document for each nominee?
- Do you include relationship language ("my son", "my longtime friend") in the appointment clauses?
- How do you handle situations where the same person is nominated for multiple roles (trustee + executor + POA)?

**Critical Gap Area** (from mapper analysis):
Many attorneys want structured successor chains with full contact details for 2–3 levels. Ask specifically how they would want this data structured if it could flow cleanly into the document.

---

## Step 7: Guardians for Minor Children

**Fidelity Probing Questions**:
- Do you separate "Guardians to Raise Children" from "Guardians to Manage Inheritance"? How is that expressed in the documents?
- For minor children, what trust language do you use for age-based distributions (e.g., "at age 25")? How customizable is this per child?
- How do you handle blended families or children from prior relationships in guardianship provisions?

---

## Steps 8–9: Power of Attorney + Healthcare Directive

**Fidelity Probing Questions**:
- How detailed do your POA documents get with specific powers (gifting, real estate, banking, tax returns, digital assets, etc.)?
- Do you use a "laundry list" of powers or more general language? Is that choice driven by client answers?
- In healthcare directives, how much granularity do you capture around end-of-life wishes, comfort care, artificial nutrition, etc.?
- How many alternate agents do you typically name, and what contact details go into the document?

**Strong Probe**:
> "If a client wanted very specific gifting authority or restrictions in their POA, how would you currently capture and reflect that?"

---

## Step 10: Beneficiaries

**Fidelity Probing Questions**:
- Do you prefer listing residuary beneficiaries with percentages inside the trust/will, or do you use a separate schedule/memo?
- How do you handle complex contingent beneficiary scenarios (e.g., "if my child predeceases me, to their descendants per stirpes")?
- For specific gifts (tangible personal property), do you use a separate Personal Property Memorandum or list them in the main document?
- How do you document and language disinheritances?

---

## Steps 11–15: Assets & Financial Information

**Fidelity Probing Questions**:
- How do real property schedules appear in your trusts? What level of detail (address, APN, title vesting, value, year acquired) do you include?
- For financial accounts, how much do you list specifically vs. using general "all accounts at X institution" language?
- How do you handle beneficiary designations on retirement accounts / life insurance vs. pouring them into the trust?
- For business interests (LLCs, etc.), what information makes it into the trust or funding instructions?
- Do you include detailed tax apportionment or payment instructions? Is that boilerplate or customized?

**Key Question**:
> "What asset-related information do you find yourself repeatedly asking clients for after they've already filled out your questionnaire?"

---

## Step 16: Additional Notes

Use this section for open discovery. Good prompts:
- "What questions do clients consistently struggle with or ask for clarification on?"
- "What information do you wish this form captured that it currently doesn't?"
- "If you could redesign this questionnaire from scratch for the purpose of generating documents, what would you change?"

---

## Step 17: Review & Closing

**Strong Closing Questions**:
- On a scale of 1–10, how much time do you think a well-built digital system could save you and your staff per estate plan (assuming templates are properly prepared)?
- What would make you confident enough to use a system like this with real clients and their actual templates?
- If we did 2–3 more sessions like this focused on specific documents, what would be most valuable to cover?

---

## Post-Interview Checklist

- [ ] Fill out the structured output format immediately while details are fresh.
- [ ] Note any specific template language examples the attorney shared (even paraphrased).
- [ ] Update the [Mapper Gap Analysis](./mapper-gap-analysis-real-templates.md) with new validated needs.
- [ ] Add any new best practices to the [Template Preparation Guide](./template-preparation-guide.md).
- [ ] Log the session in [real-template-fidelity-reviews.md](./real-template-fidelity-reviews.md).

---

**This script is designed to be used with the AI System Prompt in `prompts/attorney-fidelity-interview.prompt.md`.**

You can run these interviews directly with me by saying something like: "Let's run the fidelity interview using the Austin & Austin YAML for [Attorney Name]. Start with Step 1."

Ready when you are.