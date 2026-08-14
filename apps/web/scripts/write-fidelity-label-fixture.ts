/**
 * Writes the labeled Trust Family fidelity fixture used by default CI smoke.
 * Run: pnpm --filter web exec tsx scripts/write-fidelity-label-fixture.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createDocxFromDocumentXml,
  paragraphWithRuns,
  wrapDocumentXml,
} from "../src/features/documents/template-normalize/docx-fixture";

const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/features/documents/__fixtures__/trust-family-fidelity-labels.docx",
);

const body = [
  paragraphWithRuns([
    "We, {client_full_name} {#has_spouse} and {spouse_full_name}{/has_spouse}, settlors",
  ]),
  paragraphWithRuns(["Second Successor: {second_successor_trustee_full_name}"]),
  paragraphWithRuns(["Marriage: {marriage_city_state} on {marriage_date}"]),
  paragraphWithRuns(["Deemed Survivor: {deemed_survivor_full_name}"]),
  paragraphWithRuns(["First Distribution Age: {first_distribution_age}"]),
  paragraphWithRuns(["Educational Eligibility Age: {educational_trust_eligibility_age}"]),
  paragraphWithRuns(["Educational Remainder Age: {educational_trust_remainder_age}"]),
  paragraphWithRuns(["Educational Termination Age: {educational_trust_termination_age}"]),
].join("\n");

writeFileSync(out, createDocxFromDocumentXml(wrapDocumentXml(body)));
console.log(`wrote ${out}`);
