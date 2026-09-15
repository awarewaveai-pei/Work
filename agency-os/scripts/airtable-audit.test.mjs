import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseDispositionMatrix, verifyChecksumManifest } from "./airtable-audit.mjs";

test("parses only numbered disposition rows", () => {
  const markdown = `| # | Airtable table | V2 建議 | 說明 |\n|---:|---|---|---|\n| 1 | Tools | Canonical | \`tools\` |\n| 2 | Clients | Exclude | sensitive |`;
  const parsed = parseDispositionMatrix(markdown);
  assert.equal(parsed.size, 2);
  assert.deepEqual(parsed.get("Tools"), { order: 1, recommendation: "Canonical", explanation: "`tools`" });
});

test("rejects a snapshot whose content no longer matches its checksum", async () => {
  const directory = await mkdtemp(join(tmpdir(), "airtable-audit-checksum-"));
  try {
    await writeFile(join(directory, "source.json"), "{\"changed\":true}\n", "utf8");
    await writeFile(join(directory, "checksums.sha256"), `${"0".repeat(64)}  source.json\n`, "utf8");
    await assert.rejects(verifyChecksumManifest(directory), /Checksum mismatch: source\.json/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
