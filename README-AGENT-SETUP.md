# Agent Context Setup for The Estate Planning Engine

This folder contains a complete, production-ready agent context system optimized for **Grok Build + Cursor** (and compatible with Claude Code, Codex, etc.) in 2026.

## Quick Start

1. Copy the entire contents of this folder into the **root** of your actual `estate-planning-engine` project repository.
2. The `.cursor/rules/` directory will be automatically picked up by Cursor.
3. The root `AGENTS.md` will be automatically loaded by **Grok Build** and most other AI coding agents.
4. The `agents/` folder contains optional specialized agent definitions you can reference in prompts.

## Files Created

### Root Level
- `AGENTS.md` — The single most important file. High-level project overview, non-negotiable constraints (especially document fidelity), tech stack, workflow, and global rules. Loaded automatically by Grok Build.

### `.cursor/rules/` (Cursor-Optimized)
These use Cursor's modern `.mdc` format with frontmatter for precise scoping:
- `core.mdc` — Always-applied global rules and priorities.
- `document-fidelity.mdc` — Extremely strict rules for template handling and docxtemplater (scoped to document features).
- `intake-questionnaire.mdc` — Rules for XState, adaptive logic, and constrained conversational AI (scoped to intake features).
- `multi-tenancy-security.mdc` — Clerk Organizations, data scoping, audit logging, and PII handling.
- `development-workflow.mdc` — How to collaborate with Grok + Cursor, code style, testing expectations, and commit discipline.

### `agents/` (Specialized Agent Definitions)
- `document-engine.md` — Activate this persona when working heavily on document generation, templates, or data mapping.
- `intake-engine.md` — Activate this persona for questionnaire, XState, or conversational intake work.

## How to Use in Practice

**In Grok Build**:
- It automatically loads `AGENTS.md`.
- For complex tasks, start your prompt with: "Follow AGENTS.md and the relevant rules in .cursor/rules/. Act as the Document Engine Specialist from agents/document-engine.md if appropriate."

**In Cursor**:
- The `.cursor/rules/*.mdc` files are loaded automatically based on file globs and `alwaysApply`.
- You can also reference them explicitly in Composer or chat.

**Recommended Prompt Pattern**:
```
Follow AGENTS.md strictly, especially the Document Fidelity and Attorney Control sections.
Use the rules from .cursor/rules/document-fidelity.mdc and intake-questionnaire.mdc.
[Your specific task here]
```

## Why This Structure Works Well (2026 Best Practices)

- **AGENTS.md** at root = vendor-agnostic, high-level contract that many tools understand.
- **Modular .cursor/rules/*.mdc** = Cursor's preferred way to deliver focused, low-noise context with automatic scoping via globs.
- **Specialized agents/** = Lets you "activate" a deep expert persona for a specific domain without polluting the global context.
- Keeps individual files focused and under ~150-200 lines for better token efficiency and model adherence.

## Maintenance

- Update `AGENTS.md` whenever new global constraints or patterns emerge.
- Add new `.mdc` files in `.cursor/rules/` as features grow (e.g., `billing.mdc`, `reporting.mdc`).
- Keep the specialized agents in `agents/` updated with the latest patterns from your work.

This setup was generated following current 2026 best practices for AI-assisted development on complex, domain-specific projects like legal tech.

You now have a very strong foundation for consistent, high-quality assistance from Grok + Cursor on The Estate Planning Engine. 

Happy building!