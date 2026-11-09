// TEXT_RATES (lib/ai/cost-model.ts) is the text-model registry: every model id the code can send is a key there, so a
// vendor retiring an id shows up in one place and scripts/probe-models.mjs can test all of them.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { MEDIA_MODELS, TEXT_RATES } from "../cost-model";
import { AI_TEXT_MODELS } from "../text-model-options";

const ROOT = path.resolve(__dirname, "../../..");
const VIDEO_SERVICE = path.resolve(ROOT, "../video-service");
const REPO = path.resolve(ROOT, "../../../../..");
// Model ids written as DEFAULTS outside next-admin (other apps' env fallbacks, the MCP wrappers and their smoke test, the
// Claude Code user-level template, the GitHub auto-repair workflow). 2026-11-09: smoke-test.mjs still sent claude-3-haiku and
// claude-sonnet-4-20250514 (retired), video-workbench defaulted to gpt-4.1-mini (shuts down 2027-01-14) -- none of them scanned.
// Every literal here must be an ACTIVE row (a default is sent as-is; only next-admin remaps legacy ids through `fallback`).
const DEFAULT_ROOTS = [
  path.resolve(ROOT, "../video-workbench/backend"),
  path.resolve(ROOT, "../video-workbench/scripts"),
  path.resolve(ROOT, "../meeting-service/lib"),
  path.join(REPO, "mcp-local-wrappers"),
  path.join(REPO, "mcp/registry.template.json"),
  path.join(REPO, "mcp/claude-userlevel/settings.template.json"),
  path.join(REPO, ".github/workflows"),
  path.join(REPO, "scripts/claude-account.py"),
];
const DEFAULT_EXT = /\.(ts|tsx|mjs|cjs|js|py|json|ya?ml)$/;
// A vendor id always carries a version digit ("claude-fast" / "gemini-latest" there are MCP server names, not ids), and it
// is matched by word boundaries, not quotes: `claude_args: "--model claude-haiku-5-5 --max-turns 10"` puts the id inside a
// longer string, which a quoted-literal pattern never sees (Codex review 2026-11-09 -- the workflow scanned vacuously).
const DEFAULT_MODEL_LITERAL = /(?<![\w.-])((?:claude|gpt|gemini)-[A-Za-z0-9._-]*\d[A-Za-z0-9._-]*?)(?![\w-])/g;
const SKIP_DIRS = new Set(["__tests__", "node_modules", ".venv", ".next"]);
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js)$/;
const MODEL_LITERAL = /["'`]((?:claude|gpt|gemini)-[A-Za-z0-9._-]*[A-Za-z0-9])["'`]/g;
// Strings that look like model ids but are not text models sent to a vendor API.
const NOT_TEXT_MODELS: Record<string, string> = {
  "gemini-cli": "terminal tool id (ops/tools page, inbox copy button), not an API model",
  "gemini-web": "web tool id (ops/tools page), not an API model",
  "claude-haiku-5": "family prefix for a startswith() thinking switch (video-service server.py), not an id",
};

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) codeFiles(full, out);
    } else if (CODE_EXT.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

// Media ids as the vendor sees them: Replicate owner/name in a slug/fluxModel field or a /v1/models/ path, a pinned
// 64-hex Replicate version, an OpenAI image model id.
const REPLICATE_SLUG = /(?:\b(?:slug|fluxModel):\s*|\/v1\/models\/)["'`]?([a-z0-9-]+\/[a-z0-9._-]+)["'`]/g;
const PINNED_VERSION = /["'`]([0-9a-f]{64})["'`]/g;
const OPENAI_IMAGE = /["'`]((?:dall-e|gpt-image)-[A-Za-z0-9._-]*[A-Za-z0-9])["'`]/g;
// The registry file spells retired ids as its own keys; every other file is a caller.
const REGISTRY_FILE = path.join("lib", "ai", "cost-model.ts");

/** Matches of `re` outside comments in lib, app, scripts and video-service, as `file -> id`. */
function codeLiterals(re: RegExp): Array<{ file: string; id: string }> {
  const files = [
    ...["lib", "app", "scripts"].flatMap((d) => codeFiles(path.join(ROOT, d))),
    ...readdirSync(VIDEO_SERVICE).filter((n) => n.endsWith(".py")).map((n) => path.join(VIDEO_SERVICE, n)),
  ];
  const found: Array<{ file: string; id: string }> = [];
  for (const file of files) {
    let src = readFileSync(file, "utf8");
    src = file.endsWith(".py")
      ? src.replace(/#.*$/gm, "")
      : src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(re)) found.push({ file: path.relative(ROOT, file), id: m[1] });
  }
  return found;
}
const modelLiterals = () => codeLiterals(MODEL_LITERAL);

/** Text-model and OpenAI-image literals in DEFAULT_ROOTS (comments stripped), as `file -> id`. */
function defaultLiterals(): Array<{ file: string; id: string }> {
  const files = DEFAULT_ROOTS.flatMap((p) => (statSync(p).isDirectory()
    ? readdirSync(p).filter((n) => DEFAULT_EXT.test(n) && !/\.(test|spec)\./.test(n)).map((n) => path.join(p, n))
    : [p]));
  const found: Array<{ file: string; id: string }> = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"])(\/\/|#).*$/gm, "$1");
    for (const re of [DEFAULT_MODEL_LITERAL, OPENAI_IMAGE]) for (const m of src.matchAll(re)) found.push({ file: path.relative(REPO, file), id: m[1].replace(/[.]$/, "") });
  }
  return found;
}
const callers = (re: RegExp) => codeLiterals(re).filter(({ file }) => file !== REGISTRY_FILE);
const notActiveMedia = (hits: Array<{ file: string; id: string }>) =>
  hits.filter(({ id }) => MEDIA_MODELS[id]?.status !== "active").map(({ file, id }) => `${file}: ${id}`);

describe("text-model registry (TEXT_RATES)", () => {
  it("(a) every claude-/gpt-/gemini- literal in lib, app, scripts and video-service is a TEXT_RATES key", () => {
    const literals = modelLiterals();
    expect(literals.length).toBeGreaterThan(10);
    const unregistered = literals
      .filter(({ id }) => !Object.hasOwn(TEXT_RATES, id) && !Object.hasOwn(MEDIA_MODELS, id) && !Object.hasOwn(NOT_TEXT_MODELS, id))
      .map(({ file, id }) => `${file}: ${id}`);
    expect(unregistered).toEqual([]);
  });

  it("(a') every model id used as a default outside next-admin (DEFAULT_ROOTS) is an ACTIVE registry row", () => {
    const literals = defaultLiterals();
    expect(literals.length).toBeGreaterThan(5);
    const notActive = literals
      .filter(({ id }) => (TEXT_RATES[id] ?? MEDIA_MODELS[id])?.status !== "active" && !Object.hasOwn(NOT_TEXT_MODELS, id))
      .map(({ file, id }) => `${file}: ${id}`);
    expect(notActive).toEqual([]);
  });

  it("(b) the model picker offers only active ids", () => {
    const notActive = AI_TEXT_MODELS.map((m) => m.value).filter((id) => TEXT_RATES[id]?.status !== "active");
    expect(notActive).toEqual([]);
  });

  it("(c) every fallback is another, active key", () => {
    const bad = Object.entries(TEXT_RATES)
      .filter(([id, r]) => r.fallback !== undefined && (r.fallback === id || TEXT_RATES[r.fallback]?.status !== "active"))
      .map(([id, r]) => `${id} -> ${r.fallback}`);
    expect(bad).toEqual([]);
  });

  it("probe-models.mjs reads the same rows as the TS object (it parses the source: no tsx in the image)", async () => {
    const { parseTextRates, parseMediaModels } = await import("../../../scripts/probe-models.mjs");
    const src = readFileSync(path.join(ROOT, "lib/ai/cost-model.ts"), "utf8");
    const expected = Object.entries(TEXT_RATES).map(([id, r]) => ({ id, vendor: r.vendor, status: r.status, fallback: r.fallback, verifiedAt: r.verifiedAt, retireOn: r.retireOn }));
    expect(parseTextRates(src)).toEqual(expected);
    const expectedMedia = Object.entries(MEDIA_MODELS).map(([id, r]) => ({ id, vendor: r.vendor, kind: r.kind, status: r.status, version: r.version, verifiedAt: r.verifiedAt, retireOn: r.retireOn }));
    expect(parseMediaModels(src)).toEqual(expectedMedia);
  });
});

describe("media-model registry (MEDIA_MODELS)", () => {
  it("(d) every Replicate slug the code sends is an active MEDIA_MODELS key", () => {
    const hits = callers(REPLICATE_SLUG);
    expect(hits.length).toBeGreaterThan(10);
    expect(notActiveMedia(hits)).toEqual([]);
  });

  it("(e) every pinned Replicate version is the version of an active MEDIA_MODELS row", () => {
    const pinned = new Set(Object.values(MEDIA_MODELS).filter((m) => m.status === "active" && m.version).map((m) => m.version));
    const hits = callers(PINNED_VERSION);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.filter(({ id }) => !pinned.has(id)).map(({ file, id }) => `${file}: ${id}`)).toEqual([]);
  });

  it("(e') hardFailures names an active row inside RETIRE_WARN_DAYS of its retireOn, not a legacy one", async () => {
    const { hardFailures, RETIRE_WARN_DAYS } = await import("../../../scripts/probe-models.mjs");
    const rows = [
      { id: "soon", status: "active", retireOn: "2027-01-14" },
      { id: "later", status: "active", retireOn: "2027-03-01" },
      { id: "old", status: "legacy", retireOn: "2027-01-14" },
    ];
    const ok = rows.map((r) => ({ id: r.id, ok: true }));
    expect(RETIRE_WARN_DAYS).toBe(30);
    expect(hardFailures(rows, ok, "2026-12-20")).toEqual(["soon retires 2027-01-14"]);
    expect(hardFailures(rows, ok, "2026-11-09")).toEqual([]);
  });

  it("(f) every OpenAI image model id in code is an active MEDIA_MODELS key", () => {
    const hits = callers(OPENAI_IMAGE);
    expect(hits.length).toBeGreaterThan(0);
    expect(notActiveMedia(hits)).toEqual([]);
  });
});
