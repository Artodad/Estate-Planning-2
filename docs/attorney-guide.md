# Attorney Guide: Working with Generated Documents (Fidelity First)

**Core Guarantee**: The Estate Planning Engine never rewrites, modernizes, or improves your original Word templates. Every output is an exact-fidelity merge of your language + client data, with a visible DRAFT header/watermark on every page.

## The 8 Core Documents (Always Generated as a Coordinated Package)

1. Revocable Living Trust
2. Pour-over Will
3. Durable Power of Attorney (Financial)
4. Advance Healthcare Directive (with POLST-ready language where applicable)
5. HIPAA Authorization
6. Certificate of Trust
7. Personal Property Memorandum
8. Trust Funding Instructions

All use your exact templates, loops (`{#children}`, `{#assets}`, conditionals for CA community property, minors, spouse, etc.), headers, footers, numbering, and styles.

## DRAFT Marking

Every generated page includes a clear **"DRAFT – For Attorney Review Only"** header or watermark (injected post-render via custom docxtemplater module). You control final output.

## PDF Workflow (Recommended — Fidelity Preserving)

**Do not** expect an automated "Export PDF" button. Automated conversion (LibreOffice, pdf-lib, etc.) risks layout drift on complex attorney templates (tables, numbered paragraphs, headers/footers, CA-specific provisions).

**Correct workflow** (guarantees 100% fidelity):
1. Download the .docx (individual or Full Package ZIP).
2. Open in Microsoft Word (preferred) or LibreOffice.
3. File → Save As / Export → PDF.
4. Review the PDF in Print Layout exactly as your client will see it.

This text appears next to every download button in the UI.

## What You Must Always Review (Attorney Responsibility)

- All variable mappings from the intake (names, dates, addresses, children arrays, asset descriptions, beneficiary designations, community property flags, guardian nominations, specific gifts, etc.).
- Any optional sections that were conditionally included based on answers (e.g., minor children triggers, non-CA residents, unmarried clients).
- Trust funding instructions are generic guidance — customize with your client's actual account numbers/institutions.
- The DRAFT language itself (remove or convert to final before execution).
- Compliance with current CA law (the tool supplies structure; you supply judgment).

## Template Preparation (for Owners)

See the dedicated **[Template Preparation Guide](./template-preparation-guide.md)** for detailed variable names, recommended patterns, and best practices.

Key points:
- Use exact variable names from the mapper (`src/features/documents/mapper.ts`).
- Support loops (`{#children}`, `{#assets}`, etc.) and conditionals (`{^has_spouse}`).
- Test using the **Real Template Fidelity Review** process documented in [real-template-fidelity-reviews.md](./real-template-fidelity-reviews.md).

## Fidelity Validation Process (Phase 7+)

All production templates should go through structured side-by-side review with real attorneys. See the living document:
- [Real Template Fidelity Reviews](./real-template-fidelity-reviews.md)

## Intake → Generation Flow (Happy Path)

1. Attorney invites client (magic link via Resend).
2. Client completes the 10-section adaptive wizard (CA branching, auto-save, resume, DRAFT status).
3. Attorney reviews answers in dashboard.
4. One-click "Generate Full Estate Plan" (or single document).
5. 8-document ZIP + individual .docx downloads appear immediately (secure route, audit logged).
6. Attorney downloads, reviews in Word, customizes, removes DRAFT, executes with client.

All privileged actions (generation, download, client data changes) are audited with firmId + minimal metadata.

## Security & Multi-Tenancy (What Attorneys Get)

- Strict Clerk Organization isolation (your firm = your tenant).
- No cross-firm visibility possible (enforced in every Server Action + route).
- All documents watermarked DRAFT until you say otherwise.
- Full audit trail visible in Overview (who generated what, when, for which client).

## Support & Feedback

Beta attorneys: your real templates + feedback directly shape the mapper and any future template upload UI. Fidelity complaints are the highest-priority bugs.

Questions? Contact the team — never assume the tool "knows" a legal clause you didn't put in your template.

---

*This guide is part of the Phase 6 production readiness closeout. Updated {DATE}.*
