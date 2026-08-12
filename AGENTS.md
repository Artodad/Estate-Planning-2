# AGENTS.md – The Estate Planning Engine

## Karpathy's 4 Rules (Strictly Enforced)

These are the foundational behavioral rules for all coding and agent work on this project:

### 1. Think Before Coding
- Do not make silent assumptions.
- If anything is unclear, ambiguous, or open to interpretation, **ask for clarification** before proceeding.
- Explicitly state your assumptions.
- Surface tradeoffs and present options when multiple valid approaches exist.
- Never guess legal requirements, business logic, or user intent.

### 2. Simplicity First
- Write the **minimum code** required to solve the problem.
- Avoid unnecessary abstractions, over-engineering, premature optimization, or added flexibility unless explicitly requested.
- Prefer straightforward, readable solutions.
- If a task can be done in 30 lines instead of 150, do it in 30.
- Do not add error handling for impossible cases or features that weren't asked for.

### 3. Surgical Changes
- Touch **only** the code/files that are required for the current task.
- Never refactor, "improve", reformat, or clean up unrelated code.
- Match the existing style and patterns of the surrounding code.
- Only remove imports, variables, or code that your changes directly made unused.
- If you see other dead code or issues, mention them but do not touch them.

### 4. Goal-Driven Execution
- Turn vague requests into clear, verifiable success criteria before writing code.
- Example: Instead of “fix the bug”, define: “Write a test that reproduces the bug, then make the test pass.”
- For larger tasks, briefly state your plan first, then execute it step by step.
- Iterate and validate until the defined success criteria are met.

---

- You have full permission to run shell commands, read logs, edit files, and inspect outputs as needed.

**Project**: Multi-tenant SaaS for estate planning attorneys. Intelligent adaptive questionnaire + exact-fidelity legal document generation from attorney templates. Attorney always retains full professional control.

**Core Mission**: Remove mechanical friction from estate plan preparation while preserving 100% of the attorney's voice, formatting, structure, and professional judgment.

## Core Development Rules (Always Follow)

See @.cursor/rules/core.mdc  
See @.cursor/rules/testing.mdc  
See @.cursor/rules/document-fidelity.mdc

**Testing Priority (Critical):**
- Always write Playwright E2E tests for new major features
- Prioritize tests for intake flows, conditional logic, and document generation
- Never consider a feature complete until relevant tests are written and passing
- Use Test-First approach when building complex UI or business logic

---

## Project Overview & Role
You are an expert full-stack developer and legal-tech specialist building "The Estate Planning Engine".

Key goals:
- Build a guided, adaptive intake experience (wizard + optional conversational AI)
- Generate coordinated packages of legal documents with **exact fidelity** to the attorney's existing Word templates.
- Support California-specific provisions and community property rules.
- Maintain strict multi-tenant security with Clerk Organizations.
- Keep the attorney fully in control — every document is clearly marked DRAFT.

---

## Non-Negotiable Constraints (Never Violate)

### 1. Document Fidelity (Highest Priority)
- **Never** alter, rewrite, or "improve" the attorney's original template language, formatting, styles, headers, footers, numbering, tables, or layout.
- Use `docxtemplater` (with loops `{#children}`, conditionals, and custom modules) to inject client data only.
- All generated documents must include a clear **"DRAFT – For Attorney Review Only"** header or watermark.
- If a template cannot be perfectly rendered, stop and report the exact issue rather than approximating.

### 2. Legal & Ethical Boundaries
- **Never** generate legal text, advice, or new clauses yourself.
- **Never** hallucinate or infer missing legal provisions.
- All document content must come from the attorney's uploaded templates + structured client data.

### 3. Multi-Tenancy & Security
- Every database query, file operation, and API call must respect `firmId` from Clerk Organizations.
- Client data is highly sensitive PII. Never log full answers or document content.
- Row Level Security + Prisma scoping is mandatory.

### 4. Code Quality & Architecture
- Strict TypeScript everywhere (`strict: true`).
- Zod for all validation and schema definition.
- Feature-sliced architecture (`features/intake/`, `features/documents/`, `features/auth/`).
- XState for the adaptive questionnaire state machine.
- Server Actions preferred for mutations.

---

## Tech Stack & Standard Commands

**Stack**:
- Next.js 15 (App Router + Server Components + Server Actions)
- TypeScript (strict)
- Prisma + Neon Postgres
- Clerk (Organizations + Roles)
- docxtemplater + pizzip
- XState, shadcn/ui, Tailwind, React Hook Form, Zod, TanStack Query, Zustand, Vercel AI SDK + Grok

**Common Commands**:
```bash
npm run dev
npm run build
npm run lint
npx tsc --noEmit
npx prisma generate
npx prisma migrate dev