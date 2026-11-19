import { describe, expect, it } from "vitest";
import { articleChecks, MIN_BODY_CHARS, reviewOf, socialChecks, uncheckedRequired } from "../review";
import type { RankMathReport } from "@/lib/seo/rankmath-checker";

const NOW = new Date("2026-11-03T02:00:00Z");
const green = { score: 86, grade: "green", checks: [], passed: 0, total: 0 } as unknown as RankMathReport;
const body = "字".repeat(MIN_BODY_CHARS);
const clean = { texts: ["fb text"], channels: 1, problems: [] };
const failed = (checks: ReturnType<typeof articleChecks>) => checks.filter((c) => !c.pass).map((c) => c.name);

describe("topic review", () => {
  it("passes a complete, long enough, green article with clean posts", () => {
    expect(reviewOf([...articleChecks(body, green, ["保證治癒"]), ...socialChecks(clean, ["保證治癒"])], NOW)).toMatchObject({ pass: true, at: NOW.toISOString() });
  });

  it("each article rule fails on its own", () => {
    expect(failed(articleChecks(`${body}<!-- GENERATION_TRUNCATED: x -->`, green, []))).toEqual(["complete"]);
    expect(failed(articleChecks("短", green, []))).toEqual(["length"]);
    expect(failed(articleChecks(body, { ...green, grade: "orange" } as RankMathReport, []))).toEqual(["seo"]);
    expect(failed(articleChecks(body, null, []))).toEqual(["seo"]);
  });

  it("posts fail on a writer problem or when no channel can be written for", () => {
    expect(failed(socialChecks({ ...clean, problems: ["x 太長"] }, []))).toEqual(["social"]);
    expect(failed(socialChecks({ texts: [], channels: 0, problems: [] }, []))).toEqual(["social"]);
  });

  it("a forbidden claim is found in the article or a post, whatever its spacing and marks", () => {
    expect(articleChecks(`${body}\n\n**保證 治癒**`, green, ["保證治癒"]).find((c) => c.name === "forbidden")?.detail).toBe("出現禁用說法：保證治癒");
    expect(failed(socialChecks({ ...clean, texts: ["真的 100%有效！"] }, ["100% 有效"]))).toEqual(["social_forbidden"]);
  });

  it("no checks is not a pass", () => {
    expect(reviewOf([], NOW).pass).toBe(false);
  });

  describe("required paragraphs (N1b)", () => {
    const DISCLAIMER = "本文僅供參考，不能取代專業治療。";
    const HOTLINE = "安心專線 1925";
    it("one missing paragraph fails and names it", () => {
      const c = articleChecks(`${body}\n\n${DISCLAIMER}`, green, [], [DISCLAIMER, HOTLINE]);
      expect(failed(c)).toEqual(["required"]);
      expect(c.find((x) => x.name === "required")?.detail).toBe(`缺少必附段落：「${HOTLINE}」`);
    });
    it("all present passes, whatever the spacing and full/half width", () => {
      const c = articleChecks(`${body}\n\n**本文僅供參考， 不能取代專業治療。**\n\n安心專線　１９２５`, green, [], [DISCLAIMER, HOTLINE]);
      expect(failed(c)).toEqual([]);
    });
    it("a link's hidden target does not count as the paragraph (Codex F2)", () => {
      expect(failed(articleChecks(`${body}\n\n[求助](https://example.com/1925)`, green, [], ["1925"]))).toEqual(["required"]);
      // the meta block publishing drops, and a paragraph split across two (Codex effcd83c F1/F2)
      expect(failed(articleChecks(`<!-- CONTENT_META_START -->\nMETA_DESC: ${HOTLINE}\n<!-- CONTENT_META_END -->\n\n${body}`, green, [], [HOTLINE]))).toEqual(["required"]);
      expect(failed(articleChecks(`${body}\n\n安心專線\n\n1925`, green, [], [HOTLINE]))).toEqual(["required"]);
    });
    it("a paragraph added after the article was checked stops auto publish; none set = as before (Codex F1)", () => {
      expect(uncheckedRequired([DISCLAIMER], [DISCLAIMER, HOTLINE])).toEqual([`「${HOTLINE}」`]);
      expect(uncheckedRequired(undefined, [DISCLAIMER])).toHaveLength(1);
      expect(uncheckedRequired(undefined, [])).toEqual([]);
      expect(uncheckedRequired([DISCLAIMER], [" 本文僅供參考，不能取代專業治療。"])).toEqual([]);
    });
    it("a site without the setting gets exactly the checks it got before", () => {
      for (const md of [body, "短", `${body}<!-- GENERATION_TRUNCATED: x -->`]) {
        const before = articleChecks(md, green, ["保證治癒"]);
        expect(articleChecks(md, green, ["保證治癒"], [])).toEqual(before);
        expect(before.map((c) => c.name)).toEqual(["complete", "length", "seo", "forbidden"]);
      }
    });
  });
});
