import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load E2E + Clerk env (same pattern as other specs)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/* eslint-disable turbo/no-undeclared-env-vars */
const E2E_IDENTIFIER = process.env.E2E_CLERK_USER_IDENTIFIER!;
const E2E_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD!;

/**
 * Minimal but valid .docx template generator (self-contained for this spec).
 * Copied/adapted from features/documents/verify-generation.ts createMinimalTestTemplate.
 * Guarantees docxtemplater can load it later (theme, content types, rels, styles).
 * Used here so the E2E does not depend on external fixture files.
 */
function createMinimalValidDocxForTest(): Buffer {
  const zip = new PizZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/><w:qFormat/>
  </w:style>
</w:styles>`);

  // A single paragraph with a placeholder the mapper commonly emits (harmless if unused)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Test template for E2E upload — client_full_name: {client_full_name}</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`);

  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

/** Messy fixture: split-run tags + alias `{#child}` so normalize-on-upload report shows repairs/renames. */
function createMessyDocxForNormalizeReport(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Client: </w:t></w:r>
      <w:r><w:t>{client_</w:t></w:r>
      <w:r><w:t>full_</w:t></w:r>
      <w:r><w:t>name}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>{#child}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{full_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/child}</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`);
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

/** Broken unclosed loop — upload must reject after normalize validation. */
function createBrokenDocxForReject(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Broken: {#children}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Name {client_full_name}</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`);
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

/** High-confidence tag + leftover blanks so punch N survives persist/reload. */
function createLeftoverPunchDocxForTest(): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/><w:qFormat/>
  </w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>_ _[Name of Trust]_ _ Family Trust</w:t></w:r></w:p>
    <w:p><w:r><w:t>County of San Diego</w:t></w:r></w:p>
    <w:p><w:r><w:t>and "issue" _ _[do/do not]_ _ include stepchildren</w:t></w:r></w:p>
    <w:p><w:r><w:t>_[Description of distribution.]_ shall be paid</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`);
  return Buffer.from(zip.generate({ type: 'nodebuffer' }));
}

/**
 * ============================================================================
 * TEMPLATE UPLOAD E2E (Major Feature — per AGENTS.md requirement)
 * ============================================================================
 *
 * Covers the happy path that was previously impossible:
 *   Owner uploads a real .docx → Template row created with valid fileKey in storage →
 *   Immediately usable by getPackageTemplatesForCurrentFirm + generation.
 *
 * Auth note: Requires the E2E test user to be an OWNER of at least one onboarded Clerk org/firm
 * (same credential used by onboarding + client generation tests). If the test user is only staff
 * or has no firm yet, the page will 403 and the test will surface that clearly.
 *
 * The uploaded template is created under the current firm's storage namespace and will be
 * visible in the list on the same page after revalidation.
 */
test.describe('Templates upload (owner only)', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in via Clerk testing helper (same pattern as other dashboard E2E)
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: E2E_IDENTIFIER,
        password: E2E_PASSWORD,
      },
    });
  });

  test('owner can upload a .docx template and see it appear in the list', async ({ page }) => {
    // Navigate directly (sidebar link is owner-gated)
    await page.goto('/dashboard/templates');

    // If the test account is not an owner of an onboarded firm, we get the RBAC message.
    // The test still passes if we detect the expected owner-only enforcement or the form.
    const insufficient = page.getByText(/Templates management is restricted to firm owners/i);
    if (await insufficient.isVisible().catch(() => false)) {
      test.skip(true, 'E2E test user is not an owner of an onboarded firm in this environment. Upload test requires owner role.');
      return;
    }

    // The upload form should be present
    await expect(page.getByRole('heading', { name: /Upload Trust template/i })).toBeVisible();

    // Generate an in-memory minimal valid .docx (no fixture file needed)
    const docxBuffer = createMinimalValidDocxForTest();
    const fileName = `e2e-test-template-${Date.now()}.docx`;

    // Fill the form using native inputs (Playwright setInputFiles works on <input type="file">)
    const fileInput = page.locator('input[type="file"][name="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    });

    // Trust-only path: document type is locked (no 8-doc picker)
    await expect(page.locator('input[name="documentType"]')).toHaveValue('revocable_trust');

    // Name (required)
    await page.fill('input[name="name"]', `E2E Test Revocable Trust ${Date.now()}`);

    // Optional description
    await page.fill('textarea[name="description"]', 'Uploaded by automated E2E test — safe to delete');

    // Submit
    await page.getByRole('button', { name: /Upload Template/i }).click();

    // Success feedback (either the Callout or the sonner toast region)
    await expect(page.getByText(/Template uploaded successfully|Template registered/i)).toBeVisible({ timeout: 15000 });

    // Normalize-on-upload report should surface (counts even when 0 repairs)
    await expect(
      page.getByText(/repair|normalized|validated/i).first()
    ).toBeVisible({ timeout: 10000 });

    // The new template row should now be in the "Your Templates" list (revalidated by the action)
    // We look for either the exact name we sent or the documentType we chose.
    await expect(
      page.locator('text=E2E Test Revocable Trust').or(page.locator('text=revocable_trust'))
    ).toBeVisible({ timeout: 10000 });

    // Clean note for manual review: the uploaded file now lives in .local-document-storage/templates/<slug>/...
    // (normalized primary + *.original.docx side file) and can be used for real generation.
  });

  test('messy .docx upload surfaces repair/rename normalize report', async ({ page }) => {
    await page.goto('/dashboard/templates');

    const insufficient = page.getByText(/Templates management is restricted to firm owners/i);
    if (await insufficient.isVisible().catch(() => false)) {
      test.skip(true, 'E2E test user is not an owner of an onboarded firm in this environment.');
      return;
    }

    await expect(page.getByRole('heading', { name: /Upload Trust template/i })).toBeVisible();

    const docxBuffer = createMessyDocxForNormalizeReport();
    await page.locator('input[type="file"][name="file"]').setInputFiles({
      name: `e2e-messy-${Date.now()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    });
    await expect(page.locator('input[name="documentType"]')).toHaveValue('revocable_trust');
    await page.fill('input[name="name"]', `E2E Messy Normalize ${Date.now()}`);
    await page.getByRole('button', { name: /Upload Template/i }).click();

    await expect(
      page.getByText(/Template uploaded and normalized|Template registered|normalized/i).first()
    ).toBeVisible({ timeout: 15000 });

    // TemplateUploadNormalizeSummary panel: "N repair(s), M rename(s)"
    await expect(page.getByText(/\d+\s+repairs?/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/\d+\s+renames?/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('broken .docx upload is rejected with validation error (nothing registered)', async ({ page }) => {
    await page.goto('/dashboard/templates');

    const insufficient = page.getByText(/Templates management is restricted to firm owners/i);
    if (await insufficient.isVisible().catch(() => false)) {
      test.skip(true, 'E2E test user is not an owner of an onboarded firm in this environment.');
      return;
    }

    await expect(page.getByRole('heading', { name: /Upload Trust template/i })).toBeVisible();

    const brokenName = `E2E Broken Reject ${Date.now()}`;
    await page.locator('input[type="file"][name="file"]').setInputFiles({
      name: `e2e-broken-${Date.now()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createBrokenDocxForReject(),
    });
    await expect(page.locator('input[name="documentType"]')).toHaveValue('revocable_trust');
    await page.fill('input[name="name"]', brokenName);
    await page.getByRole('button', { name: /Upload Template/i }).click();

    await expect(
      page.getByText(/failed validation after normalization|not saved|Unclosed loop/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Must not appear as a registered template row
    await expect(page.getByText(brokenName)).toHaveCount(0);
  });

  test('Trust leftover punch is still on the page after reload', async ({ page }) => {
    await page.goto('/dashboard/templates');

    const insufficient = page.getByText(/Templates management is restricted to firm owners/i);
    if (await insufficient.isVisible().catch(() => false)) {
      test.skip(true, 'E2E test user is not an owner of an onboarded firm in this environment.');
      return;
    }

    await expect(page.getByRole('heading', { name: /Upload Trust template/i })).toBeVisible();

    const leftoverName = `E2E Leftover Punch ${Date.now()}`;
    await page.locator('input[type="file"][name="file"]').setInputFiles({
      name: `e2e-leftover-${Date.now()}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: createLeftoverPunchDocxForTest(),
    });
    await page.fill('input[name="name"]', leftoverName);
    await page.getByRole('button', { name: /Upload Template/i }).click();

    const confirm = page.getByRole('button', { name: /Confirm upload/i });
    await expect(confirm).toBeVisible({ timeout: 15000 });
    await confirm.click();

    await expect(page.getByText(leftoverName)).toBeVisible({ timeout: 15000 });
    const punch = page.getByTestId('template-leftover').first();
    await expect(punch).toBeVisible();
    await expect(punch).toHaveAttribute('data-leftover-count', /[1-9]\d*/);
    const label = await punch.textContent();

    await page.reload();
    await expect(page.getByText(leftoverName)).toBeVisible({ timeout: 15000 });
    const afterReload = page.getByTestId('template-leftover').first();
    await expect(afterReload).toBeVisible();
    await expect(afterReload).toHaveText(label ?? '');
    await expect(page.getByTestId('template-leftover-punch').first()).toBeVisible();
  });
});
