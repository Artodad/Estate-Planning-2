# Phase 3: Intelligent Intake & Questionnaire Engine

**Duration**: 10–14 days (largest phase)  
**Goal**: Build a world-class, adaptive, guided intake experience that feels like a conversation while producing structured, validated data ready for document generation.

**Success Criteria**:
- Complete adaptive questionnaire covering all major estate planning domains
- XState machine handles branching logic deterministically
- Beautiful wizard UI with progress, save/resume, and mobile support
- Optional conversational AI mode (constrained to structured output)
- All answers stored reliably and ready for the document mapper

---

## Questionnaire Domain Coverage (MVP Scope)

**Core Sections** (start with these):

1. **Personal Information** (client + spouse/partner)
2. **Family & Relationships** (children, dependents, pets)
3. **Assets** (real estate, bank/brokerage, retirement, business interests, personal property)
4. **Liabilities** (mortgages, loans, other debts)
5. **Decision Makers** (executor, trustee, agent under POA, healthcare proxy, guardian)
6. **Specific Gifts & Bequests**
7. **Distribution Wishes** (residuary estate)
8. **Charitable Intent**
9. **End-of-Life & Healthcare Preferences** (Advance Directive, POLST language)
10. **Prior Planning** (existing documents, beneficiary designations)

**California-Specific Branching** (examples):
- Community property questions if married and CA resident
- Guardianship provisions if minor children exist
- Specific trust language options

---

## Architecture: Hybrid Approach (Recommended)

**Layer 1 – Deterministic Core (Always On)**
- XState machine defines every question, section, and branching rule.
- 100% predictable, auditable, testable.

**Layer 2 – Conversational Enhancement (Optional)**
- Vercel AI SDK + Grok API offers a chat interface.
- The LLM is **strictly instructed** to:
  - Follow the XState machine structure
  - Output only validated JSON matching the Zod schema
  - Never generate legal language itself

This gives you the best of both worlds: reliability + delightful UX.

---

## Detailed Implementation Breakdown

### Step 1: Define All Zod Schemas

Create `packages/core/src/schemas/questionnaire.ts` (or inside `features/intake/schemas/`).

Break into logical sections:

```ts
export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  // ... many more
})

export const ChildSchema = z.object({
  id: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string(),
  isMinor: z.boolean(),
  guardianPreference: z.string().optional(),
})

export const AssetSchema = z.object({
  // Highly flexible – type + description + value + ownership
})

export const FullIntakeSchema = z.object({
  personal: PersonalInfoSchema,
  family: z.object({
    children: z.array(ChildSchema),
    // ...
  }),
  assets: z.array(AssetSchema),
  // ... all other sections
})
```

**Grok Prompt**:
> Create a comprehensive set of Zod schemas for a full estate planning intake questionnaire. Include all major sections with realistic fields, validation rules, and California-specific considerations. Make it production-ready with clear comments.

### Step 2: Build the XState Machine

Create `features/intake/machine.ts`

Key concepts:
- `states`: `personal`, `family`, `assets`, `decisionMakers`, `review`, `completed`
- `context`: Current answers + progress + current section
- `guards`: `hasMinorChildren`, `isMarried`, `isCaliforniaResident`
- `actions`: `saveAnswer`, `calculateProgress`

**Grok Prompt**:
> Build a complete, production-grade XState v5 machine for an adaptive estate planning questionnaire. Include all major sections, guards for branching logic (minors, marriage, state of residence), and actions for saving answers. Make the machine visualizable and easy to extend.

### Step 3: Wizard UI Components

Create `features/intake/components/QuestionnaireWizard.tsx`

Features to implement:
- Progress bar (overall + per section)
- Section navigation (with lock/unlock based on completion)
- Dynamic form rendering based on current XState state
- Auto-save on every answer change (debounced)
- "Save & Exit" + resume later
- Mobile-first responsive design
- Optional "Switch to Chat Mode" button

Use `react-hook-form` + Zod resolver inside each section for excellent UX.

### Step 4: Conversational AI Mode (The "Wow" Feature)

Create `features/intake/components/ConversationalIntake.tsx`

**Grok Prompt**:
> Create a conversational intake interface using Vercel AI SDK and Grok API. The AI must strictly follow the XState machine structure and output only JSON that validates against our Zod schema. Include system prompt engineering, streaming UI, and a clear "Switch back to structured wizard" option.

**Critical Safety Rule**:
The system prompt must contain:
> "You are a structured data collection assistant. You must NEVER generate legal text, advice, or document language. Your only job is to collect answers and output valid JSON matching the provided schema."

### Step 5: Persistence Layer

- On every significant change → call Server Action → update `IntakeSession.answers` (JSONB) + `progress`
- On resume → load answers into XState context

### Step 6: Testing Strategy

- Unit test the XState machine (transitions, guards)
- Playwright E2E: Complete a full intake as a new client
- Manual test with real branching scenarios (married + minor children + CA resident)

---

## Expanded Grok Prompts for This Phase

1. **Full Schema Generation** (use early)
2. **XState Machine** (core of reliability)
3. **Wizard UI** (user experience)
4. **Conversational Layer** (differentiation)
5. **Data Mapping Helper** (prepare for Phase 4): "Create a utility that takes a completed IntakeSession.answers JSON and transforms it into the exact shape expected by docxtemplater for a revocable living trust."

---

## Completion Checklist

- [ ] All Zod schemas created and validated
- [ ] XState machine implemented and tested for key branching paths
- [ ] Wizard UI complete with progress, save/resume, mobile support
- [ ] Conversational mode working (constrained output)
- [ ] Answers persisting correctly to database
- [ ] End-to-end flow tested: Start intake → Complete → Data ready for document generation

**This phase is the heart of the user experience.** Take the time to make it feel thoughtful and professional — attorneys and their clients will notice.

**Next Phase**: [Phase 4 – Document Generation Engine](./phase-4-document-generation.md)