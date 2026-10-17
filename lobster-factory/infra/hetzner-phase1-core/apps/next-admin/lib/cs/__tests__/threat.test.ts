// Threat to hurt others (operator decision 2026-10-17): own keyword list, own handoff reason, own page.
import { describe, expect, it } from "vitest";
import { hitsSensitive, hitsThreat, safetyGate } from "@/lib/cs/autonomy";
import { inputGuards } from "@/lib/cs/guardrails";
import { matchFaq } from "@/lib/cs/faq";
import { handoffAckText, parseNameReply, threatReplyText } from "@/lib/cs/handoff-ack";
import { crisisAlertText } from "@/lib/cs/crisis-alert";
import type { Intent } from "@/lib/cs/types";

const intent = (key: string, isSensitive: boolean): Intent => ({
  key, label: key, answerLevel: "L1", actionLevel: "A0", isSensitive, confidenceThreshold: 0.7, canaryPct: 0, graduated: false,
});

describe("threat to hurt others", () => {
  it("the operator's test message and its variants hit; everyday words do not", () => {
    for (const t of ["我要殺光所有的人", "我要殺了你", "我要讓你們好看", "给我等着", "I'm going to kill everyone", "I will hurt you"]) expect(hitsThreat(t)).toBe(true);
    for (const t of ["可以殺價嗎", "我只是在殺時間", "課程內容", "我討厭你們", "photo shoot"]) expect(hitsThreat(t)).toBe(false);
  });

  it("routes to a human under its own reason, and self-harm still wins", () => {
    expect(safetyGate(intent("other", false), "我要殺光所有的人")).toEqual({ action: "handoff", handoffReason: "threat" });
    expect(safetyGate(intent("other", false), "我要殺光所有的人然後自殺")?.handoffReason).toBe("crisis");
    expect(inputGuards("我要殺光所有的人")).toMatchObject({ pass: false, handoffReason: "threat" });
  });

  it("the classifier's threat intent routes like a keyword; an unrelated sensitive intent cannot borrow it", () => {
    expect(safetyGate(intent("threat_to_others", true), "你們等著瞧")?.handoffReason).toBe("threat");
    expect(safetyGate(intent("refund", true), "你們等著瞧")?.handoffReason).toBe("sensitive_intent");
  });

  it("the FAQ never answers a threat, and a threat is never taken as a name", () => {
    expect(hitsSensitive("有什麼課 我要殺光所有的人")).toBe(true);
    expect(matchFaq([{ id: "courses", keywords: ["有什麼課"], answer: "四個模組" }], "有什麼課 我要殺光所有的人")).toBeNull();
    expect(parseNameReply("殺了你")).toBeNull();
  });

  it("the customer hears the operator-approved sentence, in their language; self-harm help lines still win", () => {
    const cis = { organizationId: "o" };
    expect(threatReplyText(cis, "我要殺光所有的人")).toBe("系統已收到您的訊息。工作人員會親自回覆您。如果有人現在有立即危險，請撥打台灣119或澳洲000。");
    expect(threatReplyText(cis, "I will hurt you")).toBe(
      "The system has received your message. A staff member will reply to you personally. If anyone is in immediate danger, call 119 in Taiwan or 000 in Australia.",
    );
    expect(handoffAckText(cis, true, "我要殺光所有的人")).toBe(threatReplyText(cis, "我要殺光所有的人"));
    expect(handoffAckText(cis, true, "我要殺光所有的人然後自殺")).toContain("1925");
  });

  it("the page says what it is about; the self-harm page is unchanged", () => {
    expect(crisisAlertText("o", "9", undefined, "threat").split("\n")[0]).toBe("🔴 客服：客人的訊息提到要傷害別人");
    expect(crisisAlertText("o", "9").split("\n")[0]).toBe("🔴 客服：客人的訊息提到自傷或自殺");
  });
});
