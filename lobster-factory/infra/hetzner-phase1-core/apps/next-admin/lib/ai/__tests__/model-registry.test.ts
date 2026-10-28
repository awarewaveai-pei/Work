// TEXT_RATES (lib/ai/cost-model.ts) is the text-model registry: every model id the code can send is a key there, so a
// vendor retiring an id shows up in one place and scripts/probe-models.mjs can test all of them.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TEXT_RATES } from "../cost-model";
import { AI_TEXT_MODELS } from "../text-model-options";

const ROOT = path.resolve(__dirname, "../../..");
const VIDEO_SERVICE = path.resolve(ROOT, "../video-service");
const SKIP_DIRS = new Set(["__tests__", "node_modules", ".venv", ".next"]);
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js)$/;
const MODEL_LITERAL = /["'`]((?:claude|gpt|gemini)-[A-Za-z0-9._-]*[A-Za-z0-9])["'`]/g;
// Strings that look like model ids but are not text models sent to a vendor API.
const NOT_TEXT_MODELS: Record<string, string> = {
  "gemini-cli": "terminal tool id (ops/tools page, inbox copy button), not an API model",
  "gemini-web": "web tool id (ops/tools page), not an API model",
  "gpt-image-2": "image model, priced by OPENAI_IMAGE_TOKEN_RATES; TEXT_RATES covers text models only",
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

/** Model-id string literals outside comments, as `file -> id`. */
function modelLiterals(): Array<{ file: string; id: string }> {
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
    for (const m of src.matchAll(MODEL_LITERAL)) found.push({ file: path.relative(ROOT, file), id: m[1] });
  }
  return found;
}

describe("text-model registry (TEXT_RATES)", () => {
  it("(a) every claude-/gpt-/gemini- literal in lib, app, scripts and video-service is a TEXT_RATES key", () => {
    const literals = modelLiterals();
    expect(literals.length).toBeGreaterThan(10);
    const unregistered = literals
      .filter(({ id }) => !Object.hasOwn(TEXT_RATES, id) && !Object.hasOwn(NOT_TEXT_MODELS, id))
      .map(({ file, id }) => `${file}: ${id}`);
    expect(unregistered).toEqual([]);
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
    const { parseTextRates } = await import("../../../scripts/probe-models.mjs");
    const parsed = parseTextRates(readFileSync(path.join(ROOT, "lib/ai/cost-model.ts"), "utf8"));
    const expected = Object.entries(TEXT_RATES).map(([id, r]) => ({ id, vendor: r.vendor, status: r.status, fallback: r.fallback, verifiedAt: r.verifiedAt }));
    expect(parsed).toEqual(expected);
  });
});
