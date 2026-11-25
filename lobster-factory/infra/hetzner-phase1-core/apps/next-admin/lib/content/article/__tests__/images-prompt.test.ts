// An article asks for images only when images are requested: nothing fills an image URL otherwise (unrequested images
// came back as invented example.com links). Requested ones are numbered placeholders that the image step fills.
import { describe, expect, it, vi } from "vitest";
import { prepareArticleGeneration } from "@/lib/content/article/generate-core";

const base = { keyword: "正念呼吸", externalLinks: ["https://www.who.int/"] };

async function prompts(body: Record<string, unknown>) {
  const r = await prepareArticleGeneration(body as never);
  if (!r.ok) throw new Error("prepare failed");
  return r.config;
}

describe("article image instructions", () => {
  it("no requested images: the prompt forbids any image and never asks for placeholders", async () => {
    const c = await prompts(base);
    expect(c.userPrompt).toContain("IMAGES: none");
    expect(`${c.system}\n${c.userPrompt}`).not.toMatch(/image placeholder|IMAGE_PLACEHOLDER|PUBLISH_DATE/i);
  });

  it("source search region follows a natively written language (繁體中文 -> tw, 日本語 -> jp), not the US default", async () => {
    const prev = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ organic: [] })));
    try {
      await prepareArticleGeneration({ keyword: "正念呼吸", language: "繁體中文" } as never);
      await prepareArticleGeneration({ keyword: "マインドフルネス", language: "日本語" } as never);
      expect(fetchSpy.mock.calls.map((c) => JSON.parse(String(c[1]?.body)).gl)).toEqual(["tw", "jp"]);
    } finally {
      fetchSpy.mockRestore();
      if (prev === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prev;
    }
  });

  it("requested images: numbered placeholders the image step replaces", async () => {
    const c = await prompts({ ...base, media: { aiImages: "flux", imageCount: 2 } });
    expect(c.userPrompt).toContain('![alt-text here](IMAGE_PLACEHOLDER_N "English scene description")');
    expect(c.userPrompt).not.toContain("IMAGES: none");
  });

  it("requested images with meta: the meta block asks for the cover's scene, short title and subtitle (K10)", async () => {
    const c = await prompts({ ...base, generateMeta: true, media: { aiImages: "flux", imageCount: 2 } });
    for (const k of ["COVER_SCENE:", "COVER_TITLE:", "COVER_SUBTITLE:"]) expect(c.userPrompt).toContain(k);
    expect((await prompts({ ...base, generateMeta: true })).userPrompt).not.toContain("COVER_SCENE:");
  });

  it("K27: body scenes and the cover scene name each person's look, differ across the article and never follow the site's country", async () => {
    const c = await prompts({ ...base, generateMeta: true, targetCountry: "Taiwan", media: { aiImages: "flux", imageCount: 2 } });
    const rule = c.userPrompt.split("\n").find((l) => l.startsWith("- PEOPLE IN PICTURES"))!;
    for (const s of ["age range, gender, and an ethnic or regional background", "different people from different parts of the world",
      "never follow the site's target country", "no posed group of diverse people", "Good:", "Bad:"]) expect(rule).toContain(s);
    expect(c.userPrompt).not.toContain("people are fine");
    expect(c.userPrompt.split("\n").find((l) => l.startsWith("COVER_SCENE:"))).toContain("people follow PEOPLE IN PICTURES above, someone different from every body picture");
    expect(c.userPrompt.indexOf("- PEOPLE IN PICTURES")).toBeLessThan(c.userPrompt.indexOf("COVER_SCENE:"));
    expect((await prompts(base)).userPrompt).not.toContain("PEOPLE IN PICTURES");
  });
});
