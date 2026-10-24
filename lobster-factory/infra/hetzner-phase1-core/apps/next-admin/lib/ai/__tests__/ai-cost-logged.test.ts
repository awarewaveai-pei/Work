// Every paid AI call is written to ai_call_logs (/ops/costs reads only that table). 2026-10-24: 13 call sites logged
// nothing -- the inbox, cs and outreach providers, embeddings, upscaling, tarot batch cards -- so the cost page undercounted
// without any error. A file that calls a provider logs its cost itself, or hands the call to callers that each do.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const CALL = /\.messages\.(create|stream)\(|\.generateContent(Stream)?\(|providerUrl\(|embedContent\(|\.embeddings\.create\(/;
const LOGS = /\b(logAiCall|logImageCost|logImageResult)\(/;
const DEFINES = new Set(["lib/ai/gateway.ts"]); // providerUrl itself
// A library whose result its callers log (they know the job id and the price unit): every caller of the named function
// must log, or be listed here too.
const CALLERS_LOG: Readonly<Record<string, string>> = {
  "lib/studio/bg-remover.ts": "removeBackground",
  "lib/studio/generative-fill.ts": "generativeFill",
  "lib/studio/inpaint.ts": "removeObject",
  "lib/tarot/video-motion-gen.ts": "generateVideoMotionBatch",
};

// One exported function picks a provider branch and logs once for whichever ran: alternative branches of one charge, not
// several charges (Codex 2026-10-25: image costs belong where whether-billed, model and grant account are all known).
const LOGS_ONCE_FOR_BRANCHES: Readonly<Record<string, string>> = {
  "lib/tarot/image-gen.ts": "generateTarotImage logs every result through logImageResult; callers pass costLog",
};

function sources(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.set(path.relative(ROOT, full).split(path.sep).join("/"), readFileSync(full, "utf8"));
    }
  };
  for (const d of ["app", "lib", "components"]) walk(path.join(ROOT, d));
  return out;
}
const FILES = sources();

describe("every paid AI call is logged to ai_call_logs", () => {
  it("a file that calls a provider logs its cost, or hands it to callers listed in CALLERS_LOG", () => {
    const silent = [...FILES].filter(([f, src]) => CALL.test(src) && !DEFINES.has(f) && !LOGS.test(src) && !(f in CALLERS_LOG)).map(([f]) => f);
    expect(silent, "add logAiCall / logImageCost next to the call (lib/ai/log-ai-call.ts)").toEqual([]);
  });

  // A logger elsewhere in the file must not cover a second paid call (Codex 2026-10-25 F5: video-pipeline's scene image
  // went unlogged because its motion call logged). A poll of a job already started is not a new charge.
  it("a file has at least as many cost-log calls as paid calls", () => {
    const count = (src: string, re: RegExp) => (src.match(new RegExp(re.source, "g")) ?? []).length;
    const POLL = /providerUrl\([^)]*\/predictions\/\$\{/;
    const over = [...FILES].filter(([f]) => !DEFINES.has(f) && !(f in CALLERS_LOG) && !(f in LOGS_ONCE_FOR_BRANCHES)).map(([f, src]) => {
      const calls = count(src, CALL) - count(src, POLL) + Object.values(CALLERS_LOG).reduce((n, fn) => n + count(src, new RegExp(`\\b${fn}\\(`)), 0);
      return { f, calls, logs: count(src, LOGS) };
    }).filter((x) => x.calls > x.logs).map((x) => `${x.f}: ${x.calls} paid calls, ${x.logs} logs`);
    expect(over).toEqual([]);
  });

  it("each library in CALLERS_LOG is still a provider caller, and every caller of its function logs", () => {
    for (const [lib, fn] of Object.entries(CALLERS_LOG)) {
      const src = FILES.get(lib) ?? "";
      const handsOn = Object.entries(CALLERS_LOG).some(([l, f]) => l !== lib && new RegExp(`\\b${f}\\(`).test(src));
      expect(CALL.test(src) || handsOn, `${lib}: listed but calls no provider and no listed library`).toBe(true);
      const callers = [...FILES].filter(([f, src]) => f !== lib && new RegExp(`\\b${fn}\\(`).test(src)).map(([f]) => f);
      expect(callers.length, `${lib}: nobody calls ${fn}`).toBeGreaterThan(0);
      expect(callers.filter((f) => !LOGS.test(FILES.get(f)!) && !(f in CALLERS_LOG)), `${lib} ${fn}: callers that do not log`).toEqual([]);
    }
  });

  it("a branch-logging file still calls a provider and logs", () => {
    for (const [f, why] of Object.entries(LOGS_ONCE_FOR_BRANCHES)) {
      const src = FILES.get(f) ?? "";
      expect(CALL.test(src) && LOGS.test(src), `${f}: ${why}`).toBe(true);
    }
  });
});
