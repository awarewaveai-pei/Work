import { describe, expect, it } from "vitest";
import { handoffAckText, isPlaceholderContactName, parseNameReply } from "@/lib/cs/handoff-ack";

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

describe("placeholder names", () => {
  it("only Chatwoot's invented names count", () => {
    expect(isPlaceholderContactName("John Doe")).toBe(true);
    expect(isPlaceholderContactName(undefined)).toBe(true);
    expect(isPlaceholderContactName("John Smith")).toBe(false);
  });
});
