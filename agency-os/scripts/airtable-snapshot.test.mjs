import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSnapshot } from "./airtable-snapshot.mjs";

function fixture() {
  return {
    baseId: "appFixture00000001",
    extractedAt: "2026-09-14T00:00:00.000Z",
    expectedTableCount: 2,
    tables: [
      { id: "tblSource00000001", name: "來源", primaryFieldId: "fldName0000000001", fields: [
        { id: "fldName0000000001", name: "名稱", type: "singleLineText" },
        { id: "fldLink0000000001", name: "關聯", type: "multipleRecordLinks" },
      ] },
      { id: "tblTarget00000001", name: "目標", primaryFieldId: "fldName0000000002", fields: [
        { id: "fldName0000000002", name: "名稱", type: "singleLineText" },
      ] },
    ],
    schemaDetails: [
      { tableId: "tblSource00000001", fields: [
        { id: "fldName0000000001", type: "singleLineText" },
        { id: "fldLink0000000001", type: "multipleRecordLinks", config: { linkedTableId: "tblTarget00000001" } },
      ] },
      { tableId: "tblTarget00000001", fields: [{ id: "fldName0000000002", type: "singleLineText" }] },
    ],
    pages: [
      { tableId: "tblSource00000001", pageIndex: 0, cursorIn: null, nextCursor: null, totalRecordCount: 1, records: [
        { id: "recSource00000001", createdTime: "2026-01-01T00:00:00.000Z", cellValuesByFieldId: {
          fldName0000000001: "來源一", fldLink0000000001: [{ id: "recTarget00000001", name: "目標一" }],
        } },
      ] },
      { tableId: "tblTarget00000001", pageIndex: 0, cursorIn: null, nextCursor: null, totalRecordCount: 1, records: [
        { id: "recTarget00000001", createdTime: "2026-01-01T00:00:00.000Z", cellValuesByFieldId: { fldName0000000002: "目標一" } },
      ] },
    ],
  };
}

test("creates a field-ID keyed snapshot and validates links", async () => {
  const parent = await mkdtemp(join(tmpdir(), "airtable-snapshot-test-"));
  const output = join(parent, "snapshot");
  const result = await createSnapshot(fixture(), output);
  assert.equal(result.validation.status, "PASS");
  assert.equal(result.validation.tableCount, 2);
  assert.equal(result.validation.recordCount, 2);
  assert.equal(result.validation.linkedValueCount, 1);
  assert.equal(result.validation.supabaseApplicationWrites, 0);
  const record = JSON.parse((await readFile(join(output, "tables", "tblSource00000001", "records.jsonl"), "utf8")).trim());
  assert.deepEqual(record.rawValueByFieldId.fldLink0000000001, [{ id: "recTarget00000001", name: "目標一" }]);
  assert.deepEqual(record.displayValueByFieldId.fldLink0000000001, ["目標一"]);
});

test("fails closed on an unknown source field", async () => {
  const bundle = fixture();
  bundle.pages[0].records[0].cellValuesByFieldId.fldUnknown0000001 = "unexpected";
  const parent = await mkdtemp(join(tmpdir(), "airtable-snapshot-test-"));
  const result = await createSnapshot(bundle, join(parent, "snapshot"));
  assert.equal(result.validation.status, "FAIL");
  assert.match(result.validation.errors.join("\n"), /unknown field/);
});

test("fails closed when attachment metadata exists but the file was not downloaded", async () => {
  const bundle = fixture();
  bundle.tables[0].fields.push({ id: "fldAttach000000001", name: "附件", type: "multipleAttachments" });
  bundle.schemaDetails[0].fields.push({ id: "fldAttach000000001", type: "multipleAttachments" });
  bundle.pages[0].records[0].cellValuesByFieldId.fldAttach000000001 = [{
    id: "attFixture00000001", filename: "evidence.pdf", url: "https://example.invalid/evidence.pdf", size: 42,
  }];
  const parent = await mkdtemp(join(tmpdir(), "airtable-snapshot-test-"));
  const result = await createSnapshot(bundle, join(parent, "snapshot"));
  assert.equal(result.validation.status, "FAIL");
  assert.match(result.validation.errors.join("\n"), /attachment\(s\) not downloaded/);
});
