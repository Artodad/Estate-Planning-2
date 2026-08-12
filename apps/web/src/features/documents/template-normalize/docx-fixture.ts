/**
 * Minimal valid .docx builders for unit tests and the normalize CLI smoke path.
 * Packaging mirrors verify-generation.ts — enough for PizZip + docxtemplater.
 */

import PizZip from "pizzip";

function baseParts(zip: PizZip): void {
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );

  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`,
  );
}

/** Wrap body inner XML (paragraphs) into a document.xml shell */
export function wrapDocumentXml(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${bodyInner}
    <w:sectPr/>
  </w:body>
</w:document>`;
}

export function paragraphWithRuns(runTexts: string[]): string {
  const runs = runTexts.map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join("");
  return `    <w:p>${runs}</w:p>`;
}

export function createDocxFromDocumentXml(documentXml: string): Buffer {
  const zip = new PizZip();
  baseParts(zip);
  zip.file("word/document.xml", documentXml);
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

/** Fixture with `{client_full_name}` split across three w:t runs */
export function createSplitRunFixtureDocx(): Buffer {
  const body = [
    paragraphWithRuns(["Client: ", "{client_", "full_", "name}"]),
    paragraphWithRuns(["Spouse: { spouse_full_name }"]),
    paragraphWithRuns(["{{county_of_residence}}"]),
    paragraphWithRuns(["Kids:", "{#child}", "{full_name}", "{/child}"]),
  ].join("\n");
  return createDocxFromDocumentXml(wrapDocumentXml(body));
}

/** Fixture with deliberately broken loop syntax for validation failures */
export function createBrokenTemplateFixtureDocx(): Buffer {
  const body = [
    paragraphWithRuns(["Broken: {#children}"]),
    // unmatched open — no close
    paragraphWithRuns(["Name {client_full_name}"]),
  ].join("\n");
  return createDocxFromDocumentXml(wrapDocumentXml(body));
}
