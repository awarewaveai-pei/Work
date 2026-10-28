// The server's module registry (AUTO_CONTENT plan P5.1): every page entry in the old order with its blurb, every
// module that calls AI has its own role, and every task's answer shape is pinned by a fixture the page can read.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_LIMITS } from "../../social/limits";
import { FORGE_MODULES, FORGE_NAV, forgePrompt, languageLine, type ForgeCtx } from "../modules";

const ctx: ForgeCtx = { lang: "繁體中文", sceneCount: 6, customScenes: 3, brand: null };

/** One sample answer per task, in the shape the page reads (add one with every migrated task). */
const FIXTURES: Record<string, unknown> = {
  "banner.design": { headline: "省 **50%** 起", ctaText: "立即選購" },
  "banner.copy": { variants: [{ headline: "h", subtext: "s" }] },
  "hook.hooks": { hooks: [{ type: "痛點型", hook: "你也這樣嗎？", why: "直擊痛點", score: 8 }] },
  "story_bible.check": { ok: true, violations: [] },
  "manual.angles": { angles: [{ id: 1, name: "反常識", type: "反常識", hook: "你畫不好不是沒天分", core: "練錯方向", why: "有衝突", risk: "太直接", score: 8 }] },
  "manual.script": { title: "t", hook: "h", scenes: [{ time: "0-3秒", visual: "v", dialogue: "d", subtitle: "s", shoot_tip: "", edit_tip: "" }], cta: "追蹤" },
  "result.score": { scores: { hook: 8, rhythm: 7, clarity: 8, emotion: 6, shootability: 8, conversion: 7 }, overall: 7.5, optimized_hook: "", optimized_cta: "" },
  "result.score_short": { scores: { hook: 8, rhythm: 7, clarity: 8, emotion: 6, shootability: 8, conversion: 7 }, overall: 7.5 },
  "result.platform": { title: "t", hook: "h", scenes: [{ time: "0-3秒", dialogue: "d" }], hashtags: ["x"], key_changes: "" },
  "brand_story.gen": { title: "t", hook: "h", story_arc: { opening: "o" }, scenes: [] },
  "sales.gen": { title: "t", opening: "o", pain_discovery: ["q"], objection_handlers: [{ objection: "貴", response: "r", follow_up: "f" }], close_lines: ["c"], full_script: "s" },
  "speech.gen": { title: "t", tagline: "g", hook: "h", structure: { opening: "o" }, full_script: "s" },
  "pitch.gen": { company: "c", elevator_pitch: "e", slides: [{ slide_number: 1, title: "t" }], full_script: "s" },
  "seo.gen": { seo_analysis: { primary_keyword: "k" }, title: "t", hook: "h", scenes: [] },
  "article.gen": { title: "t", hook: "h", scenes: [], cta: "c" },
  "industry.gen": { title: "t", hook: "h", scenes: [] },
  "ab.gen": { versions: [{ version: "A", type: "痛點型", title: "t", hook: "h", scenes: [], cta: "c" }], recommendation: "A" },
  "host.gen": { title: "t", segments: [{ id: 1, duration: "0-15秒", marked_text: "m" }] },
  "pain.gen": { pain_points: [{ id: 1, pain: "p", category: "恐懼", hook_potential: "h", urgency: "高" }] },
  "viral.analyze": { hook_analysis: { hook_text: "h" }, viral_factors: ["f"], template_extracted: { structure: "s" }, rating: { virality: 8 } },
  "thumbnail.gen": { options: [{ id: 1, style: "s", main_text: "m" }] },
  "repurpose.gen": { type: "Email文案", main_output: "o" },
  "translate.translate": { translations: [{ language: "English", flag: "x", translated_text: "t" }] },
  "predict.predict": { predicted_retention: { "3s_hook_rate": "60%" }, conversion_estimate: { conversion_rate: "2%" }, viral_coefficient: { score: 5 } },
  "brand_build.gen": { name: "n", voice: "v", audience: "a", forbidden: "f", brand_summary: "s" },
  "calendar.plan": { overview: "o", weeks: [{ week: 1, theme: "t", days: [] }] },
  "proposal.gen": { proposal_title: "t", client_name: "c", executive_summary: "e", content_strategy: { core_message: "m" }, execution_plan: { month1: "a" } },
};

describe("ScriptForge module registry", () => {
  it("has the 24 page entries in the old order, each with a name and a one-line blurb", () => {
    expect(FORGE_NAV.map((m) => m.id)).toEqual(["story_bible", "manual", "article", "industry", "ab", "host", "brand_story", "sales",
      "speech", "pitch", "seo", "hook", "pain", "viral", "thumbnail", "repurpose", "translate", "preview", "predict", "brand_build",
      "brand", "calendar", "proposal", "history"]);
    for (const m of FORGE_NAV) expect(m.label && m.blurb, m.id).toBeTruthy();
  });

  it("the page list and the registry agree: each page entry is a module with the same name, icon, group and blurb", () => {
    for (const n of FORGE_NAV) {
      const m = FORGE_MODULES.find((x) => x.id === n.id);
      expect(m, n.id).toBeDefined();
      expect({ label: m?.label, icon: m?.icon, group: m?.group, blurb: m?.blurb, video: m?.video }, n.id)
        .toEqual({ label: n.label, icon: n.icon, group: n.group, blurb: n.blurb, video: n.video });
    }
    expect(FORGE_MODULES.filter((m) => m.nav !== false).map((m) => m.id)).toEqual(FORGE_NAV.map((n) => n.id));
  });

  it("no client file imports the registry (its prompts would ship in the page bundle)", () => {
    const root = path.resolve(__dirname, "..", "..", "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".next", "__tests__"].includes(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(f, "utf8");
          if (/^\s*["']use client["']/.test(src) && /script-forge\/modules["']/.test(src)) hits.push(path.relative(root, f));
        }
      }
    };
    for (const d of ["app", "components", "lib"]) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
    expect(hits).toEqual([]);
  });

  it("ids are unique and every module but history has its own role", () => {
    expect(new Set(FORGE_MODULES.map((m) => m.id)).size).toBe(FORGE_MODULES.length);
    for (const m of FORGE_MODULES.filter((x) => x.id !== "history")) expect(m.role.length, m.id).toBeGreaterThan(10);
    expect(new Set(FORGE_MODULES.map((m) => m.role).filter(Boolean)).size).toBe(FORGE_MODULES.length - 1);
  });

  it("every task has a shape and a fixture that has it", () => {
    for (const m of FORGE_MODULES) {
      for (const [id, t] of Object.entries(m.tasks)) {
        const key = `${m.id}.${id}`;
        expect(t.shape.length, key).toBeGreaterThan(0);
        const sample = FIXTURES[key] as Record<string, unknown> | undefined;
        expect(sample, `fixture for ${key}`).toBeDefined();
        for (const k of t.shape) expect(sample, `${key} needs ${k}`).toHaveProperty(k);
      }
    }
  });

  it("builds the module's own role, the shared rules and the brand's forbidden claims into the system text", () => {
    const out = forgePrompt("hook", "hooks", { topic: "失眠" }, { ...ctx, brand: { voice: "溫暖", forbidden: "治癒" } });
    expect(out?.system).toContain("開頭鉤子專家");
    expect(out?.system).toContain("純JSON");
    expect(out?.system).toContain("絕對不要使用這些說法：治癒");
    expect(out?.prompt.startsWith(languageLine(ctx))).toBe(true);
    expect(out?.prompt).toContain("針對「失眠」生成10種");
  });

  it("the platform rewrite prompt carries that platform's BODY_LIMITS cap and asks for hashtags; no mapped platform = no cap", () => {
    const tt = forgePrompt("result", "platform", { plat: "TikTok", platformId: "tiktok" }, ctx);
    expect(tt?.prompt).toContain(`不得超過 ${BODY_LIMITS.tiktok} 字`);
    expect(tt?.prompt).toContain('"hashtags"');
    const yt = forgePrompt("result", "platform", { plat: "YT Shorts", platformId: "shorts" }, ctx);
    expect(yt?.prompt).toContain(`不得超過 ${BODY_LIMITS.youtube} 字`);
    expect(forgePrompt("result", "platform", { plat: "Podcast", platformId: "podcast" }, ctx)?.prompt).not.toContain("不得超過");
  });

  it("a missing field prints nothing, never undefined", () => {
    expect(forgePrompt("hook", "hooks", {}, ctx)?.prompt).not.toContain("undefined");
  });

  it("an unknown module or task is refused", () => {
    expect(forgePrompt("nope", "hooks", {}, ctx)).toBeNull();
    expect(forgePrompt("hook", "nope", {}, ctx)).toBeNull();
    expect(forgePrompt("hook", "toString", {}, ctx)).toBeNull();
    expect(forgePrompt("history", "x", {}, ctx)).toBeNull();
  });
});
