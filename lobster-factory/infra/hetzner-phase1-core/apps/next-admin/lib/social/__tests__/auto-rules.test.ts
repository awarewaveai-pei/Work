import { describe, expect, it } from "vitest";
import { matchAutoRule, parseAutoRule, RuleError, splitKeywords } from "../auto-rules";
import type { AutoRule } from "../store";

const rule = (patch: Partial<AutoRule> = {}): AutoRule => ({
  id: "00000000-0000-4000-8000-000000000001", post_id: null, name: "報名", trigger: "comment",
  keywords: ["報名"], platforms: ["facebook"], action: "reply", reply: "收到", active: true, hits: 0, ...patch,
});

describe("auto-reply rules", () => {
  it("splits multilingual comma input and rejects empty replies", () => {
    expect(splitKeywords(" 報名, 怎麼報，價格、 ")).toEqual(["報名", "怎麼報", "價格"]);
    expect(() => parseAutoRule({ trigger: "comment", action: "reply", keywords: ["報名"], platforms: ["facebook"], reply: "" })).toThrow(RuleError);
  });

  it("matches active trigger, platform and keyword case-insensitively", () => {
    expect(matchAutoRule([rule()], { trigger: "comment", platform: "facebook", text: "請問報名方式" })?.reply).toBe("收到");
    expect(matchAutoRule([rule()], { trigger: "dm", platform: "facebook", text: "報名" })).toBeNull();
    expect(matchAutoRule([rule()], { trigger: "comment", platform: "instagram", text: "報名" })).toBeNull();
    expect(matchAutoRule([rule({ keywords: ["FAQ"] })], { trigger: "comment", platform: "facebook", text: "my faq please" })?.reply).toBe("收到");
  });

  it("gives an active post-specific rule priority over a brand rule", () => {
    const brand = rule({ reply: "品牌" });
    const own = rule({ id: "00000000-0000-4000-8000-000000000002", post_id: "00000000-0000-4000-8000-000000000099", reply: "貼文" });
    expect(matchAutoRule([brand, own], { postId: own.post_id, trigger: "comment", platform: "facebook", text: "報名" })?.reply).toBe("貼文");
    expect(matchAutoRule([brand, own], { postId: "00000000-0000-4000-8000-000000000098", trigger: "comment", platform: "facebook", text: "報名" })?.reply).toBe("品牌");
  });

  it("does not let an inactive post rule fall through to the brand rule", () => {
    const brand = rule({ reply: "品牌" });
    const inactive = rule({ id: "00000000-0000-4000-8000-000000000002", post_id: "00000000-0000-4000-8000-000000000099", active: false, reply: "停用" });
    expect(matchAutoRule([inactive, brand], { postId: inactive.post_id, trigger: "comment", platform: "facebook", text: "報名" })).toBeNull();
  });
});
