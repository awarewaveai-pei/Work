import assert from "node:assert/strict";
import test from "node:test";

import { parseDispositionMatrix } from "./airtable-audit.mjs";

test("parses only numbered disposition rows", () => {
  const markdown = `| # | Airtable table | V2 建議 | 說明 |\n|---:|---|---|---|\n| 1 | Tools | Canonical | \`tools\` |\n| 2 | Clients | Exclude | sensitive |`;
  const parsed = parseDispositionMatrix(markdown);
  assert.equal(parsed.size, 2);
  assert.deepEqual(parsed.get("Tools"), { order: 1, recommendation: "Canonical", explanation: "`tools`" });
});
