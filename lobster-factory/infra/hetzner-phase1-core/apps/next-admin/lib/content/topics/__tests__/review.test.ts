import { describe, expect, it } from "vitest";
import { articleChecks, MIN_BODY_CHARS, reviewOf, socialChecks } from "../review";
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
});
