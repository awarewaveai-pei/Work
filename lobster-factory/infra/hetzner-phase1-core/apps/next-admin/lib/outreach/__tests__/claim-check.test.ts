// The fact check's verdict is code's: code splits the email into sentences, the model labels every one, only a sentence
// about the recipient needs evidence, and only an approved id that exists counts as evidence.
import { describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({ replies: [] as string[], calls: 0 }));
vi.mock("@/lib/ai/cheap-json", () => ({ generateCheapJsonText: async () => { ai.calls++; return { ok: true, raw: ai.replies.shift() ?? "", model: "gpt-5.4-mini" }; } }));

const { checkClaimsVoted, parseClaimCheck, sentencesOf } = await import("../claim-check");

const ids = new Set(["e1", "e2"]);
const reply = (sentences: unknown[]) => JSON.stringify({ sentences });

describe("sentencesOf", () => {
  it("splits after sentence ends and at line breaks", () => {
    expect(sentencesOf("貴站有療癒模組。想請教您？\n\n王小明")).toEqual(["貴站有療癒模組。", "想請教您？", "王小明"]);
  });
});

describe("parseClaimCheck", () => {
  const four = ["貴站有藝術治療的療癒模組。", "我們提供網站維護。", "想請教您要不要看一個簡短的想法？", "如果不適合，我就不再打擾。"];
  it("questions, the sender's own lines and courtesy need no evidence (C15.4: these were flagged)", () => {
    expect(parseClaimCheck(reply([
      { n: 1, about: "recipient", evidence: "e1" }, { n: 2, about: "sender", evidence: null },
      { n: 3, about: "question", evidence: null }, { n: 4, about: "courtesy", evidence: null },
    ]), four, ids)).toEqual({ verdict: "supported" });
  });
  it("a recipient sentence without evidence, or citing an id that is not approved evidence, is unsupported", () => {
    const s = ["你們上月擴店。", "你們有 3 位老師。", "你們週末開課。"];
    expect(parseClaimCheck(reply([
      { n: 1, about: "recipient", evidence: null }, { n: 2, about: "recipient", evidence: "e9" }, { n: 3, about: "recipient", evidence: "[e2]" },
    ]), s, ids)).toEqual({ verdict: "unsupported", claims: ["你們上月擴店。", "你們有 3 位老師。"] });
  });
  it("a sentence stating facts from several rows cites them all; one unknown id among them makes it unsupported", () => {
    const s = ["貴司有台北、台中、高雄公司，也提供售後保固。"];
    expect(parseClaimCheck(reply([{ n: 1, about: "recipient", evidence: ["e1", "e2"] }]), s, ids)).toEqual({ verdict: "supported" });
    expect(parseClaimCheck(reply([{ n: 1, about: "recipient", evidence: ["e1", "e9"] }]), s, ids).verdict).toBe("unsupported");
    expect(parseClaimCheck(reply([{ n: 1, about: "recipient", evidence: [] }]), s, ids).verdict).toBe("unsupported");
  });
  it("a sentence left out, repeated or out of range is doubt, not a pass (Codex 2026-11-04)", () => {
    const s = ["你們上月擴店。", "如果不適合，我就不再打擾。"];
    expect(parseClaimCheck(reply([{ n: 2, about: "courtesy", evidence: null }]), s, ids).verdict).toBe("error");
    expect(parseClaimCheck(reply([{ n: 2, about: "courtesy" }, { n: 2, about: "courtesy" }]), s, ids).verdict).toBe("error");
    expect(parseClaimCheck(reply([{ n: 1, about: "sender" }, { n: 3, about: "courtesy" }]), s, ids).verdict).toBe("error");
  });
  it("an unknown kind, the old one-word verdict, or no JSON is doubt", () => {
    expect(parseClaimCheck(reply([{ n: 1, about: "other", evidence: null }]), ["x。"], ids).verdict).toBe("error");
    expect(parseClaimCheck('{"verdict":"supported"}', ["x。"], ids).verdict).toBe("error");
    expect(parseClaimCheck("ok", ["x。"], ids).verdict).toBe("error");
  });
});

describe("checkClaimsVoted", () => {
  const S = reply([{ n: 1, about: "recipient", evidence: ["e1"] }]), U = reply([{ n: 1, about: "recipient", evidence: [] }]);
  const vote = async (...replies: string[]) => {
    ai.replies = [...replies];
    ai.calls = 0;
    const r = await checkClaimsVoted({ body: "你們週末開課。", recipient: { name: "x", website: null }, grant: {} as never,
      evidence: [{ id: "e1", claim: "週末開課", excerpt: null, source_url: "https://a.example", status: "approved" }] });
    return [r.verdict, ai.calls];
  };
  it("two runs that agree decide; a third run is made only to break a tie, and the majority wins", async () => {
    expect(await vote(S, S)).toEqual(["supported", 2]);
    expect(await vote(U, U)).toEqual(["unsupported", 2]);
    expect(await vote(S, U, S)).toEqual(["supported", 3]);
    expect(await vote(S, U, U)).toEqual(["unsupported", 3]);
  });
  it("three different answers are doubt: never supported", async () => {
    expect((await vote(S, U, "not json"))[0]).not.toBe("supported");
    expect((await vote("not json", S, U))[0]).not.toBe("supported");
  });
});
