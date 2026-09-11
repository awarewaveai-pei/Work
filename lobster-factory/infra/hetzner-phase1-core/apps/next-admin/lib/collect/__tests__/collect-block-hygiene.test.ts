// "Blocks may not call global fetch" as a mechanical gate.
//
// The plan calls for a lint rule; this project has no ESLint configuration (checked: no .eslintrc*,
// no eslint.config.*, no lint script in package.json), so the rule lives where it can actually run
// — the test suite, which is already part of the deploy gate. If ESLint is ever introduced, this
// becomes a rule there and this file goes away.
//
// What it protects: ctx.fetch is the single place that enforces the SSRF gate on every redirect
// hop, the byte ceiling, the timeout, robots, the per-host token bucket and budget accounting. A
// block reaching for global fetch loses all six at once, silently, and looks like it works.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const COLLECT_DIR = path.resolve(__dirname, "..");

/** Files that are ALLOWED to touch the network directly — the door itself, and its tests. */
const DOOR_FILES = new Set(["net/fetcher.ts", "net/ssrf.ts", "net/providers.ts"]);

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : walk(full, rel);
    return rel.endsWith(".ts") ? [rel] : [];
  });
}

describe("collection block hygiene", () => {
  const files = walk(COLLECT_DIR);

  it("finds the module (a guard over an empty file list guards nothing)", () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files).toContain("orchestrator.ts");
    expect(files).toContain("sinks/null.ts");
  });

  it("keeps global fetch out of every file except the fetcher itself", () => {
    const offenders = files.filter((rel) => {
      if (DOOR_FILES.has(rel)) return false;
      const src = readFileSync(path.join(COLLECT_DIR, rel), "utf8")
        .replace(/\/\/.*$/gm, "") // comments may name it freely
        .replace(/^\s*fetch\s*\([^)]*\)\s*:\s*Promise[^;]*;/gm, ""); // the CollectCtx type signature
      // `ctx.fetch(...)` / `opts.fetch(...)` / `this.fetcher(...)` are fine; a bare `fetch(` is not.
      return /(^|[^.\w])fetch\s*\(/m.test(src);
    });
    expect(offenders, "these files call global fetch instead of ctx.fetch").toEqual([]);
  });

  it("keeps every OTHER way out to the network out of the module", () => {
    // The fetch check above only stops the one spelling. These are the rest of the doors: a block
    // importing any of them would bypass the SSRF gate, robots, the byte cap and the budget just as
    // completely, and nothing else in the codebase would notice.
    const BANNED = [
      /from\s+"node:https?"/,
      /from\s+"node:(net|tls|dgram|http2)"/,
      /from\s+"(undici|axios|node-fetch|got|superagent|request)"/,
      /require\(\s*"(node:)?(http|https|net|tls|undici|axios|node-fetch)"/,
      /\b(globalThis|window|global)\.fetch\b/,
      /child_process/,
    ];
    const offenders = files.flatMap((rel) => {
      if (DOOR_FILES.has(rel)) return [];
      const src = readFileSync(path.join(COLLECT_DIR, rel), "utf8").replace(/\/\/.*$/gm, "");
      return BANNED.filter((re) => re.test(src)).map((re) => `${rel}: ${re}`);
    });
    expect(offenders, "these files reach the network without going through ctx.fetch").toEqual([]);
  });

  it("contains no stray control characters", () => {
    // A real bug, twice, from patch scripts writing "\b" as a literal backspace: the regex
    // `/<link\b[^>]*>/` was written with a real 0x08 instead, matching nothing. Nothing failed — the
    // parser simply returned no open-access links for every arXiv paper, and the author fallback in
    // the HTML collector quietly never fired. Invisible bytes produce invisible failures, so this
    // checks for the whole class rather than for those two regexes.
    // Tests included on purpose. The guard used to skip __tests__, and the third instance of this
    // bug landed in a test file, where a dead regex makes an assertion quietly stop asserting.
    const offenders: string[] = [];
    const testFiles = readdirSync(path.join(COLLECT_DIR, "__tests__"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `__tests__/${f}`);
    expect(testFiles.length, "no test files found to scan").toBeGreaterThan(5);
    for (const rel of [...files, ...testFiles]) {
      const src = readFileSync(path.join(COLLECT_DIR, rel), "utf8");
      const hit = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.exec(src);
      if (hit) offenders.push(`${rel}: 0x${hit[0].charCodeAt(0).toString(16)} at ${hit.index}`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps node:dns out of everything but the SSRF gate", () => {
    // A block resolving names itself would be re-implementing half the gate, badly.
    const offenders = files.filter(
      (rel) => rel !== "net/ssrf.ts" && /from\s+"node:dns/.test(readFileSync(path.join(COLLECT_DIR, rel), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("registers the built-in blocks when lib/collect/blocks.ts is imported", async () => {
    // A registry-driven caller that imports nothing finds nothing and crawls nothing, silently.
    const { collectors, sinks } = await import("@/lib/collect/blocks");
    expect(collectors().map((b) => b.id)).toContain("collect/http-html");
    expect(sinks().map((b) => b.id)).toEqual(expect.arrayContaining(["sink/null", "sink/kb"]));
  });

  it("makes every caller of the catalogue register the blocks first", () => {
    // The failure this prevents has no error attached to it: sourceCatalogue() on an unregistered
    // registry returns [], so the ops source picker renders zero sources and reads as "the product
    // supports nothing". Caught for real while writing collect-catalogue-live.test.ts, which did
    // exactly this. The registration is one import; forgetting it must be loud.
    const APP = path.resolve(__dirname, "../../..");
    const searched = [
      "app/api/ops/clients/[slug]/collection-sources/route.ts",
      "lib/collect/run.ts",
    ];
    const callers = searched.filter((rel) => {
      const src = readFileSync(path.join(APP, rel), "utf8");
      return /\b(sourceCatalogue|catalogueEntry|collectorById|collectors)\s*\(/.test(src);
    });
    // A guard over an empty list guards nothing: these two files are the surfaces that exist today.
    expect(callers.length).toBeGreaterThan(0);
    for (const rel of callers) {
      const src = readFileSync(path.join(APP, rel), "utf8");
      expect([rel, /import\s+"@\/lib\/collect\/blocks"/.test(src)]).toEqual([rel, true]);
    }
  });

  it("gives every query source its own scheme, and a match() that answers to it", async () => {
    // Routing is by match() alone. Two query sources sharing a scheme would contend for each
    // other's work, and a source whose match() ignores its declared scheme would simply never run —
    // the operator would see it in the catalogue, configure it, and get silence.
    const { collectors } = await import("@/lib/collect/blocks");
    const queryBlocks = collectors().filter((b) => b.describe?.entry === "query");
    expect(queryBlocks.length, "no query sources found to check").toBeGreaterThan(1);

    const schemes = queryBlocks.map((b) => b.describe!.queryScheme);
    for (const [i, b] of queryBlocks.entries()) {
      expect([b.id, typeof schemes[i]]).toEqual([b.id, "string"]);
      const t = { uri: `${schemes[i]}://x`, canonicalUri: `${schemes[i]}://x`, scope: { hosts: [] }, tier: 0 } as Parameters<typeof b.match>[0];
      expect([b.id, b.match(t) > 0]).toEqual([b.id, true]);
    }
    expect(new Set(schemes).size, `two query sources share a scheme: ${schemes.join(", ")}`).toBe(schemes.length);
  });

  it("keeps the knowledge base out of the collection core", () => {
    // Collection must survive with no knowledge base at all (ADR 011): only a sink may know about
    // lib/kb, and today none does — sink/kb arrives in C1.
    const offenders = files.filter(
      (rel) => !rel.startsWith("sinks/") && /from\s+"@\/lib\/kb/.test(readFileSync(path.join(COLLECT_DIR, rel), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
