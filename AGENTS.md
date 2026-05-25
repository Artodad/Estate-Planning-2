# AGENTS.md – The Estate Planning Engine

**Project**: Multi-tenant SaaS for estate planning attorneys. Intelligent adaptive questionnaire + exact-fidelity legal document generation from attorney templates. Attorney always retains full professional control.

**Core Mission**: Remove mechanical friction from estate plan preparation while preserving 100% of the attorney's voice, formatting, structure, and professional judgment.

---

## Project Overview & Role
You are an expert full-stack developer and legal-tech specialist building "The Estate Planning Engine".

Key goals:
- Build a guided, adaptive intake experience (wizard + optional conversational AI)
- Generate coordinated packages of legal documents (revocable living trust, pour-over will, POAs, Advance Healthcare Directive, HIPAA, Certificate of Trust, Personal Property Memorandum, Trust Funding Instructions) with **exact fidelity** to the attorney's existing Word templates.
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
- Conversational AI mode (if used) must be strictly constrained to data collection and output validated JSON only. It must never produce legal language.

### 3. Multi-Tenancy & Security
- Every database query, file operation, and API call must respect `firmId` from Clerk Organizations.
- Client data is highly sensitive PII. Never log full answers or document content.
- Row Level Security + Prisma scoping is mandatory.

### 4. Code Quality & Architecture
- Strict TypeScript everywhere (`strict: true`).
- Zod for all validation and schema definition.
- Feature-sliced architecture (`features/intake/`, `features/documents/`, `features/auth/`).
- XState for the adaptive questionnaire state machine (deterministic branching).
- Server Actions preferred for mutations.

---

## Tech Stack & Standard Commands

**Stack**:
- Next.js 15 (App Router + Server Components + Server Actions)
- TypeScript (strict)
- Prisma + Neon Postgres
- Clerk (Organizations + Roles)
- docxtemplater + pizzip (document generation)
- XState (questionnaire logic)
- Vercel AI SDK + Grok API (conversational mode)
- shadcn/ui + Tailwind + React Hook Form + Zod
- TanStack Query + Zustand

**Common Commands**:
```bash
npm run dev
npm run build
npm run lint
npx tsc --noEmit
npx prisma generate
npx prisma migrate dev
```

**Testing Critical Path**:
- Complete intake → generate full document package → verify fidelity against original template.

---

## Development Workflow (Follow This)

1. **Use Grok for architecture, reviews, and complex reasoning.**
2. **Use Cursor for implementation and rapid editing.**
3. Follow the detailed `DEVELOPMENT-PLAN.md` (phases 0–7).
4. Commit after every working, tested slice.
5. Test document generation with real (anonymized) attorney templates early and often.
6. For any document-related change, run the full generation pipeline and visually inspect output.

**Prompt Style**:
- When asking for code: "Follow AGENTS.md strictly, especially document fidelity and multi-tenancy rules."
- Always reference the relevant phase or feature folder.

---

## File & Folder Conventions

- `features/<domain>/` for business logic (intake, documents, auth)
- `components/ui/` for shadcn components
- `lib/` for shared utilities and Prisma client
- Templates stored in Supabase Storage / S3 (never in repo)
- Generated documents also go to secure storage

---

## When in Doubt

- Prioritize **document fidelity** and **attorney control** above all else.
- Ask for clarification rather than guessing legal requirements.
- Prefer explicit, type-safe, auditable code over clever abstractions.

This file is the single source of truth for how the agent should behave on this project. All other rules files extend or specialize these principles.