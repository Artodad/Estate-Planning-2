# Phase 4: Document Generation Engine

**Duration**: 7–10 days  
**Goal**: Build the most important part of the product — a rock-solid engine that takes an attorney's existing Word templates and produces perfectly formatted, personalized legal documents with zero loss of their professional voice or formatting.

**Success Criteria**:
- Attorney can upload their real .docx templates
- System correctly handles loops, conditionals, and nested data
- Full estate plan package generated (trust + will + POAs + directive + memo + instructions)
- "DRAFT – For Attorney Review Only" watermark or header option
- Generated documents downloadable as ZIP
- 100% formatting fidelity on real attorney templates

---

## Why This Phase Is Critical

This is not generic document merging. This is **legal document automation that attorneys can trust**. The entire value proposition rests on the quality and fidelity of the output here.

docxtemplater is chosen specifically because it excels at this exact use case.

---

## Core Architecture

```
Attorney uploads .docx template
         ↓
Stored in Supabase Storage / S3 with metadata in Template table
         ↓
IntakeSession.answers (JSON) → Data Mapper → Template Variables
         ↓
docxtemplater renders new .docx (preserving everything)
         ↓
Optional: Add DRAFT watermark / header
         ↓
Store GeneratedDocument record + file
         ↓
Package multiple documents into ZIP for download
```

---

## Implementation Steps

### Step 1: Template Upload & Management UI

Create `features/templates/components/TemplateUpload.tsx` and management table.

Features:
- Drag & drop or file input for .docx
- Metadata form: Name, Document Type (revocable_trust, pour_over_will, etc.), Description
- Preview of template (optional, using mammoth or similar)
- List of firm's templates with edit/delete

**Grok Prompt**:
> Build a template management UI for attorneys. Include upload to Supabase Storage, metadata form with Zod validation, and a clean table showing all templates for the current firm.

### Step 2: The Data Mapper

This is the bridge between intake answers and template variables.

Create `features/documents/mapper.ts`

Example mapping logic:

```ts
export function mapIntakeToTrustVariables(answers: any) {
  return {
    client_full_name: `${answers.personal.firstName} ${answers.personal.lastName}`,
    spouse_full_name: answers.spouse ? `${answers.spouse.firstName} ...` : '',
    children: answers.family.children?.map((c: any) => ({
      name: `${c.firstName} ${c.lastName}`,
      age: calculateAge(c.dateOfBirth),
      // ...
    })) || [],
    // ... many more mappings, including complex ones for distribution wishes
  }
}
```

**Grok Prompt**:
> Create a comprehensive data mapper that transforms a completed IntakeSession.answers object into the variable structure expected by docxtemplater templates for a California revocable living trust. Include examples for children loops, conditional spouse provisions, and asset schedules.

### Step 3: The Generation Service

Create `features/documents/generator.ts`

Core function:

```ts
export async function generateDocument(params: {
  templateFileKey: string
  variables: Record<string, any>
  options?: { addDraftWatermark?: boolean }
}): Promise<{ fileKey: string; buffer: Buffer }> {
  // 1. Download template from storage
  // 2. Load with docxtemplater + pizzip
  // 3. Set data
  // 4. Render
  // 5. Optionally add watermark (using docxtemplater custom module or post-processing)
  // 6. Upload generated file to storage
  // 7. Return key + buffer
}
```

**Grok Prompt (Most Important of This Phase)**:
> Implement a production-ready document generation service using docxtemplater. The service must:
> - Support loops for children, assets, beneficiaries
> - Support conditionals for spouse, minors, state-specific clauses
> - Preserve 100% of original formatting, styles, headers, footers, and numbering
> - Include an option to add a "DRAFT – Attorney Review Required" header or watermark
> - Handle errors gracefully with clear logging
> Provide the full TypeScript implementation with comments.

### Step 4: Package Generation (The "Full Plan" Feature)

When attorney clicks "Generate Full Estate Plan":

1. Load all active templates for the firm
2. For each template, run the generator with appropriate mapper
3. Collect all generated files
4. Create a ZIP (using `jszip` or `archiver`)
5. Include a `README.txt` or `Funding Instructions.pdf` (generated or static)
6. Store the package and offer download

### Step 5: Watermarking & Professional Touches

Options:
- Use a custom docxtemplater module to inject a header on every page
- Or post-process the generated .docx to add a watermark shape
- Add clear file naming: `Smith-John-Revocable-Trust-DRAFT-2026-05-24.docx`

### Step 6: Testing with Real Templates

**Critical**:
- Collect 3–5 real (anonymized) attorney templates early
- Test every major feature against them
- Document any edge cases that require template adjustments (most attorneys are happy to slightly tweak their templates for automation)

---

## Completion Checklist

- [ ] Template upload + storage working
- [ ] Data mapper implemented for core documents (trust + will at minimum)
- [ ] docxtemplater generation service complete with loop/conditional support
- [ ] Draft watermark/header option implemented
- [ ] Full plan package (multiple documents + ZIP) working
- [ ] Tested successfully against at least 3 real attorney templates
- [ ] Error handling and logging in place for generation failures

**This phase turns the product from "nice intake form" into "attorney-trusted document automation system."**

**Next Phase**: [Phase 5 – Attorney Dashboard & Workflow](./phase-5-dashboard.md)