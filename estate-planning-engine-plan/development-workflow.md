# Development Workflow – Grok + Cursor Mastery

**Goal**: Maximize velocity and code quality while building a high-stakes legal product. This workflow is specifically tuned for Grok (as architect/reviewer) + Cursor (as implementer).

## Core Philosophy

1. **Grok plans and reviews. Cursor implements.**
2. **Never write large features from scratch in Cursor without a Grok prompt first.**
3. **Commit after every green, working slice** — even if tiny.
4. **Document fidelity and type safety are non-negotiable** — every Grok prompt should mention them.
5. **Test the critical path early and often** (intake → document generation).

## Daily Rhythm (Recommended)

### Morning (30–60 min)
1. Open `DEVELOPMENT-PLAN.md` or the relevant phase file.
2. Decide the **one focused goal** for the day (e.g., "Complete XState machine for family section" or "Implement docxtemplater service with loop support").
3. Write a detailed prompt for Grok (use the templates in each phase file).
4. Paste Grok's output into Cursor.

### Midday Implementation Block (2–4 hours)
- Use **Cursor Composer** (Cmd/Ctrl + K) for multi-file changes.
- Use **Cmd/Ctrl + L** to chat with Cursor about the current file.
- After Cursor generates code:
  - Run TypeScript compiler (`tsc --noEmit`)
  - Run linter
  - Manually test the feature in the browser (or Playwright)

### End of Day (15–30 min)
- Commit with clear message: `feat(intake): add XState machine for guardians section`
- Push to GitHub (triggers Vercel preview)
- Update the phase checklist in the relevant `.md` file
- Note any blockers or questions for tomorrow

## Prompt Engineering Patterns for Grok

### High-Quality Prompt Template (Copy & Adapt)

```markdown
You are an expert full-stack developer building "The Estate Planning Engine", a multi-tenant SaaS for estate planning attorneys.

Context:
- Tech stack: Next.js 15 App Router, TypeScript strict, Clerk Organizations, Prisma + Neon, docxtemplater, XState, Vercel AI SDK + Grok API, shadcn/ui
- Current phase: [Phase X - Name]
- We are building [specific feature]

Requirements:
- Preserve 100% of attorney template formatting in documents
- All data must be validated with Zod
- Use Server Actions or tRPC-style patterns where appropriate
- Include proper error handling and loading states
- Make it production-ready (types, comments, edge cases)

Please generate:
1. [Specific output requested, e.g. "the complete XState machine definition"]
2. [Any related components or hooks]
3. Suggested file locations
4. Any new dependencies needed

Previous relevant code (if any):
[paste key snippets or file paths]
```

### Effective Prompt Types

**Architecture / Planning Prompts**
- "Design the data flow between intake answers (JSONB) and the docxtemplater data mapper. Show the TypeScript types and mapping strategy."

**Implementation Prompts**
- "Generate the full XState machine for the questionnaire with all sections and California-specific branching logic."

**Review & Improvement Prompts**
- "Review the following component for type safety, accessibility, and performance. Suggest improvements: [paste code]"

**Debugging Prompts**
- "The document generation is failing on nested beneficiaries. Here is the error and relevant code: [paste]. Diagnose and provide the fix."

## Cursor Best Practices

- **Always** have the relevant files open in tabs before using Composer.
- Use **@** to reference specific files in Cursor chat (e.g., `@machine.ts`).
- After Cursor makes changes, immediately run:
  ```bash
  npm run typecheck
  npm run lint
  ```
- For large refactors, ask Grok first, then use Cursor in smaller scoped edits.

## Git & Branching Strategy

**Branch Naming**:
- `feat/phase-3-questionnaire-xstate`
- `fix/document-generation-nested-loops`
- `chore/add-sentry`

**Commit Messages** (Conventional Commits):
- `feat(intake): add adaptive branching for minor children`
- `perf(documents): optimize docxtemplater rendering`
- `docs(plan): expand phase 4 details`

**Main Branch Protection**:
- Require PR + at least one review (even if solo, use draft PRs for thinking).
- Require green CI (typecheck + lint + basic tests).

## Testing Cadence

- **Every feature**: Manual happy path + one edge case in browser
- **End of phase**: Add or update Playwright E2E test for the critical flow
- **Before any document generation change**: Run against 3 real attorney templates (keep a `templates/test/` folder)

## Environment & Tooling

- Use **Neon branching** for every feature branch (`neonctl branches create`)
- Use **Vercel preview deployments** for every PR
- Keep a `templates/` folder in the repo with anonymized real-world .docx examples (never commit client data)

## Common Pitfalls to Avoid

1. **Over-building the questionnaire too early** — Start with a solid 60–70% coverage and iterate with real attorney feedback.
2. **Treating document generation as an afterthought** — It is the product. Build and test it in Phase 4 with real templates.
3. **Skipping type safety** for speed — It will cost you 10x later in legal tech.
4. **Making the conversational AI too free-form** — Always constrain it to output validated JSON only.

## Metrics of Success (Track Weekly)

- Time from "new client intake started" to "full document package generated"
- Number of attorney templates successfully processed without manual fixes
- TypeScript error count trending down
- Preview deployment usage by beta attorneys

---

**This workflow is designed for maximum leverage of Grok's reasoning + Cursor's editing speed while maintaining the high quality required for legal software.**