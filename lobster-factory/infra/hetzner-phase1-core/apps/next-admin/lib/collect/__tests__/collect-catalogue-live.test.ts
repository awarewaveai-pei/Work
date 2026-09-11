// What the ops source picker actually offers on THIS machine, printed.
//
// Not a substitute for opening /ops/collect — it is the answer to "is the tool usable", which the
// page cannot give you when a missing key makes a source silently absent. Every source is listed
// with why it is or is not available, so "沒看到學術論文" is answerable without reading code.
//
//   COLLECT_CATALOGUE_REPORT=1 npx vitest run lib/collect/__tests__/collect-catalogue-live.test.ts

import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { describe, expect, it } from "vitest";
import "@/lib/collect/blocks"; // blocks self-register on import; without this the catalogue is empty
import { sourceCatalogue } from "@/lib/collect/catalogue";

loadEnvFile({ path: path.resolve(__dirname, "../../../.env.local"), override: false });

const REPORT = process.env.COLLECT_CATALOGUE_REPORT === "1";

describe.skipIf(!REPORT)("source catalogue on this machine", () => {
  it("lists every source with its availability", () => {
    const entries = sourceCatalogue();
    expect(entries.length).toBeGreaterThan(0);

    const lines = entries.map((e) => {
      const state = e.available ? "可用" : `不可用（缺 ${(e.missing).join(", ") || "?"}）`;
      return `${e.available ? "OK  " : "--  "} ${e.id.padEnd(26)} ${String(e.title).padEnd(14)} ${state}`;
    });
    console.log(`\n來源目錄（${entries.filter((e) => e.available).length}/${entries.length} 可用）\n${lines.join("\n")}\n`);

    // A source that is unavailable must say what is missing, or the picker shows a dead entry with
    // no way to act on it.
    for (const e of entries) {
      if (!e.available) expect(e.missing.length, `${e.id} is unavailable but names no missing key`).toBeGreaterThan(0);
    }
  });
});
