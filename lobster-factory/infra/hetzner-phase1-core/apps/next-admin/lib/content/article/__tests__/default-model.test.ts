// K15: articles default to gpt-6.2-sol (2026-11-22 blind test); everything already picked/saved stays; no OpenAI key -> shared default.
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareArticleGeneration } from "@/lib/content/article/generate-core";
import { AI_TEXT_MODELS, DEFAULT_AI_TEXT_MODEL, DEFAULT_ARTICLE_TEXT_MODEL, normalizeAiTextModel } from "@/lib/ai/text-model-options";
import { TEXT_FEATURES, TEXT_RATES } from "@/lib/ai/cost-model";

async function modelOf(body: Record<string, unknown>) {
  const r = await prepareArticleGeneration({ keyword: "職場倦怠", externalLinks: ["https://www.who.int/"], ...body } as never);
  if (!r.ok) throw new Error("prepare failed");
  return r.config.model;
}

afterEach(() => vi.unstubAllEnvs());

describe("article default model", () => {
  it("none picked -> gpt-6.2-sol; the shared default is untouched", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(await modelOf({})).toBe("gpt-6.2-sol");
    expect(DEFAULT_ARTICLE_TEXT_MODEL).toBe("gpt-6.2-sol");
    expect(normalizeAiTextModel(undefined)).toBe(DEFAULT_AI_TEXT_MODEL);
    expect(DEFAULT_AI_TEXT_MODEL).not.toBe("gpt-6.2-sol");
  });
  it("an old saved pick (site setting, draft, page choice) is kept as is, key or no key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await modelOf({ model: "claude-opus-5-5" })).toBe("claude-opus-5-5");
    expect(await modelOf({ model: "gpt-5.4-mini" })).toBe("gpt-5.4-mini");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(await modelOf({ model: "claude-haiku-5-5" })).toBe("claude-haiku-5-5");
  });
  it("a retired id keeps its registry successor; junk -> the article default", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(await modelOf({ model: "claude-haiku-4-5" })).toBe("claude-haiku-5-5");
    expect(await modelOf({ model: "nope" })).toBe("gpt-6.2-sol");
  });
  it("no OpenAI key and none picked -> the shared default, so an Anthropic-only install can still write", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await modelOf({})).toBe(DEFAULT_AI_TEXT_MODEL);
  });
  it("the article price row uses an active menu model", () => {
    const row = TEXT_FEATURES.find((f) => f.key === "article")!;
    expect(row.model).toBe(DEFAULT_ARTICLE_TEXT_MODEL);
    expect(TEXT_RATES[row.model].status).toBe("active");
    expect(AI_TEXT_MODELS.some((m) => m.value === row.model)).toBe(true);
  });
});
