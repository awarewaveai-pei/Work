import assert from "node:assert/strict";
import test from "node:test";
import { assertAuthoritativeEntityCount, normalize, parseCsv, splitExactList, uuidV5 } from "./art-therapy-transform.mjs";

test("CSV parser preserves commas, quotes and line breaks", () => {
  const rows = parseCsv('a,b\n"x,y","line 1\nline 2"\n');
  assert.deepEqual(rows, [{ a: "x,y", b: "line 1\nline 2" }]);
});

test("normalization and exact-list splitting are deterministic", () => {
  assert.equal(normalize(" Mixed‑Media 創作 "), normalize("mixed media創作"));
  assert.deepEqual(splitExactList("甲, 乙、丙\n丁"), ["甲", "乙", "丙", "丁"]);
  assert.equal(uuidV5("same"), uuidV5("same"));
  assert.notEqual(uuidV5("same"), uuidV5("different"));
});

test("canonical identities cannot exceed their authoritative source table", () => {
  assert.doesNotThrow(() => assertAuthoritativeEntityCount("support_methods", 54, 54));
  assert.throws(
    () => assertAuthoritativeEntityCount("support_methods", 406, 54),
    /support_methods identity count must equal its authoritative source table: expected 54, got 406/u,
  );
});
