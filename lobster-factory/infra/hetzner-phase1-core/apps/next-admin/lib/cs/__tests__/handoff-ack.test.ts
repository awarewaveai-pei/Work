import { describe, expect, it } from "vitest";
import { handoffAckText, isNameQuestionAck, isPlaceholderContactName, parseNameReply } from "@/lib/cs/handoff-ack";

const ORG = "o";

describe("parseNameReply", () => {
  it.each([
    ["小美", "小美"],
    ["我叫小美", "小美"],
    ["我是王小姐～", "王小姐"],
    ["叫我 Amy 就好", "Amy"],
    ["你好，我是陳大文。", "陳大文"],
    ["My name is Hiro", "Hiro"],
    ["Hiro", "Hiro"],
    ["Imogen", "Imogen"],
    ["hi, I'm Mary Ann", "Mary Ann"],
  ])("%s -> %s", (text, name) => expect(parseNameReply(text)).toBe(name));

  it.each([
    "請問課程什麼時候開始？",
    "可以報名嗎",
    "我下午再過去看看好了",
    "0912345678",
    "好的",
    "OK",
    "嗯嗯",
    "謝謝",
    "收到～",
    "",
    "I would like to ask about the workshop next week",
    "I need help",
    "我需要幫忙",
  ])("not a name: %s", (text) => expect(parseNameReply(text)).toBeNull());
});

describe("handoffAckText", () => {
  it("default follows honorific and emoji policy", () => {
    expect(handoffAckText({ organizationId: ORG }, false)).toBe("已收到您的訊息，我們會盡快回覆您 🙏");
    expect(handoffAckText({ organizationId: ORG, csVoice: { honorifics: "你", emojiPolicy: "none" } }, true)).toBe(
      "已收到你的訊息，我們會盡快回覆你。\n請問怎麼稱呼你呢？",
    );
  });

  it("per-page text replaces both sentences", () => {
    const cis = { organizationId: ORG, csVoice: { escalationTone: "收到囉，小幫手馬上來！", askName: "怎麼稱呼你？" } };
    expect(handoffAckText(cis, true)).toBe("收到囉，小幫手馬上來！\n怎麼稱呼你？");
  });
});

// Operator decision 2026-10-16: a crisis acknowledgement carries the help lines and still asks the name.
describe("crisis acknowledgement", () => {
  const LINES = ["119", "000", "1925", "1995", "13 11 14"];
  it("Chinese message: Chinese wording, both regions' lines, name question last", () => {
    const t = handoffAckText({ organizationId: ORG }, true, "我最近一直想傷害自己");
    for (const n of LINES) expect(t).toContain(n);
    expect(t.split("\n").at(-1)).toBe("請問怎麼稱呼您呢？");
    expect(isNameQuestionAck({ organizationId: ORG }, t)).toBe(true);
  });
  it("English message: English wording, same lines, English name question", () => {
    const t = handoffAckText({ organizationId: ORG }, true, "I want to kill myself");
    for (const n of LINES) expect(t).toContain(n);
    expect(t.split("\n").at(-1)).toBe("May I ask your name?");
    expect(isNameQuestionAck({ organizationId: ORG }, t)).toBe(true);
  });
  it("an ordinary message keeps the ordinary acknowledgement", () => {
    expect(handoffAckText({ organizationId: ORG }, false, "想報名課程")).toBe("已收到您的訊息，我們會盡快回覆您 🙏");
  });
});

describe("placeholder names", () => {
  it("only Chatwoot's invented names count", () => {
    expect(isPlaceholderContactName("John Doe")).toBe(true);
    expect(isPlaceholderContactName(undefined)).toBe(true);
    expect(isPlaceholderContactName("John Smith")).toBe(false);
  });
});

describe("an intent's own handoff reply", () => {
  const cis = { organizationId: "o", csVoice: {} } as never;
  it("replaces the ordinary sentence, still asks the name, and is recognised as the name question", () => {
    const text = handoffAckText(cis, true, "我想退錢", false, "請先留下想退款的原因");
    expect(text).toBe("請先留下想退款的原因\n請問怎麼稱呼您呢？");
    expect(isNameQuestionAck(cis, text)).toBe(true);
  });
  it("never replaces the crisis help lines", () => {
    expect(handoffAckText(cis, false, "我想傷害自己", true, "請先留下想退款的原因")).not.toContain("退款");
  });
});
