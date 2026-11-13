// post-language.ts: the language a social post must be in, read from the writing system (no AI call, no cost).
import { describe, expect, it } from "vitest";
import { inLanguage, postLanguage, scriptOf, scriptOfLanguage } from "../post-language";

describe("scriptOf", () => {
  it("reads the writing system most of the text is in", () => {
    expect(scriptOf("萬聖節親子活動不只是要糖果！用5個變裝情緒遊戲，陪孩子認出生氣、害怕與開心。")).toBe("zh");
    expect(scriptOf("Did you know a Halloween costume can help your child find words for feelings?")).toBe("latin");
    expect(scriptOf("ハロウィンの仮装で子どもの気持ちを話そう")).toBe("ja");
    expect(scriptOf("할로윈 의상으로 아이의 감정을 이야기해요")).toBe("ko");
  });

  it("a Chinese keyword at the front of an English post is still English (the 2026-10-29 draft)", () => {
    expect(scriptOf("萬聖節親子活動 can teach feelings, not just fun. Try 7 simple costume games that help kids name, show, and calm emotions at hom")).toBe("latin");
  });

  it("a Chinese post naming English brands, with English hashtags and a link, is Chinese", () => {
    expect(scriptOf("用 ChatGPT 和 Canva 做萬聖節卡片，孩子玩得很開心 https://example.com/a #Halloween #DIY")).toBe("zh");
  });

  it("Chinese full of English product names or code is still Chinese (critic 2026-11-13)", () => {
    expect(scriptOf("用 Claude Code 和 Cursor 寫 TypeScript，效率翻倍")).toBe("zh");
    expect(scriptOf("新功能上線！支援 Next.js、React Server Components 與 Supabase Realtime")).toBe("zh");
    expect(scriptOf("教學：先安裝套件\n```bash\nnpm install --save-dev typescript eslint prettier vitest\n```\n再執行 `npx tsc --noEmit` 檢查型別。")).toBe("zh");
    expect(postLanguage("教學：先安裝套件\n```bash\nnpm install --save-dev typescript eslint prettier vitest\n```\n再執行檢查。", "繁體中文")).toBe("繁體中文");
  });

  it("too few letters to tell is null", () => {
    expect(scriptOf("a")).toBeNull();
    expect(scriptOf("🎃 #萬聖節 https://x.example")).toBeNull();
  });
});

describe("language names (the site setting is free text)", () => {
  it.each([["繁體中文", "zh"], ["简体中文", "zh"], ["zh-TW", "zh"], ["Traditional Chinese", "zh"], ["日本語", "ja"], ["日文", "ja"], ["繁中", "zh"], ["華文", "zh"],["한국어", "ko"], ["English", "latin"], ["Español", "latin"]] as const)(
    "%s -> %s", (name, script) => expect(scriptOfLanguage(name)).toBe(script));
});

describe("postLanguage", () => {
  it("is the article's language; the site's name for it when the scripts agree", () => {
    expect(postLanguage("這是一篇繁體中文的文章內容。", "English")).toBe("繁體中文");
    expect(postLanguage("這是一篇繁體中文的文章內容。", "zh-TW")).toBe("zh-TW");
    expect(postLanguage("An English article about costumes.", "繁體中文")).toBe("English");
    expect(postLanguage("An English article about costumes.", "Español")).toBe("Español");
  });

  it("an article too short to read falls back to the site's language", () => {
    expect(postLanguage("a", "繁體中文")).toBe("繁體中文");
  });
});

describe("inLanguage", () => {
  it("refuses only what is clearly another language", () => {
    expect(inLanguage("萬聖節其實是一堂情緒課。", "繁體中文")).toBe(true);
    expect(inLanguage("Halloween is a feelings lesson.", "繁體中文")).toBe(false);
    expect(inLanguage("🎃", "繁體中文")).toBe(true);
  });
});
