// What the customer hears when the AI hands a conversation to a human, and the one-question name
// capture that rides on it. Pure functions only: the Chatwoot calls live in
// app/api/webhooks/chatwoot/route.ts, which owns the system-mode gate (T27: a blocking mode sends no
// automatic reply, so no acknowledgement either).
//
// No state is stored: a customer message is an answer to the name question exactly when the public
// message right before it is that question (same text, recomputed from csVoice). That holds per
// conversation, survives several pipelines asking at once, and needs nothing cleared afterwards.
//
// Why ask at all: Messenger contacts whose profile Chatwoot cannot read (no Advanced Access, which
// needs business verification) are created as "John Doe" -- Chatwoot v4.18
// app/builders/messages/facebook/message_builder.rb process_contact_params_result.

import { hitsCrisis } from "@/lib/cs/autonomy";
import type { CisProfile } from "@/lib/cs/types";

/** Names Chatwoot invents when it cannot read a profile. Only these are ever overwritten. */
const PLACEHOLDER_NAMES = new Set(["", "john doe"]);

export function isPlaceholderContactName(name: string | null | undefined): boolean {
  return PLACEHOLDER_NAMES.has((name ?? "").trim().toLowerCase());
}

/**
 * The acknowledgement text. csVoice.escalationTone (form label 轉真人時回客人的話) replaces the
 * acknowledgement sentence; csVoice.askName replaces the name question. Defaults follow the
 * page's honorific and emoji policy.
 */
export function handoffAckText(cis: CisProfile, askName: boolean, customerText = "", crisis = hitsCrisis(customerText), intentReply?: string): string {
  const v = cis.csVoice ?? {};
  const you = v.honorifics === "你" ? "你" : "您";
  if (crisis) {
    const english = !NON_LATIN.test(customerText);
    const ack = english ? CRISIS_ACK_EN : crisisAckZh(you);
    return askName ? `${ack}\n${english ? ASK_NAME_EN : askNameZh(cis)}` : ack;
  }
  // An intent's own reply (refund: ask the reason; medical: see a doctor) replaces the ordinary sentence;
  // the help lines above always win over it.
  const ack = intentReply?.trim() || v.escalationTone?.trim() || `已收到${you}的訊息，我們會盡快回覆${you}${v.emojiPolicy === "none" ? "。" : " 🙏"}`;
  if (!askName) return ack;
  return `${ack}\n${askNameZh(cis)}`;
}

/** An acknowledgement that ends with the name question -- ordinary, crisis, or an intent's own reply. */
export function isNameQuestionAck(cis: CisProfile, content: string | null | undefined): boolean {
  const c = content ?? "";
  return c.endsWith(`\n${askNameZh(cis)}`) || c.endsWith(`\n${ASK_NAME_EN}`);
}

/** A crisis acknowledgement, with or without the name question (dedupe: another pipeline already sent the help lines). */
export function isCrisisAck(cis: CisProfile, content: string | null | undefined): boolean {
  const you = cis.csVoice?.honorifics === "你" ? "你" : "您";
  const c = content ?? "";
  return c.startsWith(crisisAckZh(you)) || c.startsWith(CRISIS_ACK_EN);
}

function askNameZh(cis: CisProfile): string {
  const v = cis.csVoice ?? {};
  return v.askName?.trim() || `請問怎麼稱呼${v.honorifics === "你" ? "你" : "您"}呢？`;
}

// Self-harm / suicide (lib/cs/config.ts CS_CRISIS_KEYWORDS): help lines on top of "a person will reply".
// Wording follows the customer's language; both regions are listed because a Chinese-speaking
// customer may be in Australia (Soulful) or in Taiwan (Aware Wave). Not tenant-editable: the numbers
// must not drift with a page setting. Operator decision 2026-10-16 (WORKLOG). Numbers: Taiwan 119
// emergency, 1925 安心專線, 1995 生命線; Australia 000 emergency, Lifeline 13 11 14 -- all 24 h.
const NON_LATIN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const ASK_NAME_EN = "May I ask your name?";
const CRISIS_ACK_EN = [
  "Thank you for telling us. We have your message, and someone from our team will reply to you personally as soon as possible.",
  "If you are in immediate danger, please call emergency services now: 000 in Australia, 119 in Taiwan.",
  "To talk to someone any time: Lifeline 13 11 14 (Australia), 1925 or 1995 (Taiwan).",
].join("\n");

function crisisAckZh(you: string): string {
  return [
    `謝謝${you}願意告訴我們。訊息我們收到了，工作人員會盡快親自回覆${you}。`,
    `如果${you}現在有立即的危險，請馬上打緊急電話：台灣 119、澳洲 000。`,
    "想找人說說話，24 小時都有人接：台灣 1925 安心專線、1995 生命線；澳洲 Lifeline 13 11 14。",
  ].join("\n");
}

/**
 * A crisis message while a human already owns the conversation (route.ts human_owns_thread). Only
 * what is true: the system received it, a staff member will reply personally, the help lines. Never
 * "we saw it" (nobody has read it yet), no name question. Wording by GPT, approved by the operator
 * 2026-10-17 (WORKLOG 2026-10-17 續3); the English help-line part follows CRISIS_ACK_EN.
 */
export function crisisHoldingText(cis: CisProfile, customerText: string): string {
  if (!NON_LATIN.test(customerText)) return CRISIS_HOLDING_EN;
  const you = cis.csVoice?.honorifics === "你" ? "你" : "您";
  return [
    `系統已收到${you}的訊息，工作人員會親自回覆${you}。`,
    `如果${you}現在有立即的危險，請馬上撥打緊急電話：台灣 119、澳洲 000。`,
    "24 小時求助專線：台灣 1925 安心專線、1995 生命線；澳洲 Lifeline 13 11 14。",
  ].join("\n");
}

const CRISIS_HOLDING_EN = [
  "Your message has been received, and a staff member will reply to you personally.",
  "If you are in immediate danger, please call emergency services now: Taiwan 119, Australia 000.",
  "24-hour support lines: Lifeline 13 11 14 (Australia), 1925 or 1995 (Taiwan).",
].join("\n");

// A reply that reads like a question or a request is not a name. Deliberately conservative: a
// missed name costs nothing (the agent can still ask), a wrong one makes the agent greet the
// customer by a sentence.
const NOT_A_NAME = /[?？0-9０-９@/:]|嗎|呢|什麼|甚麼|怎麼|多少|請問|想問|可以|能不能|課程|報名|價格|費用|時間|地址|退款|謝謝你|不用|不要|沒有|需要|幫|救|難過|痛苦|害怕|好累|不想|想要/;
// A Latin reply with a pronoun or a verb of need is a sentence about the customer ("I need help"
// after the crisis acknowledgement, Codex 2026-10-16 partialreview-58beec4d), not a name. Checked
// after the lead-in is stripped, so "my name is Hiro" still yields Hiro.
const LATIN_SENTENCE = /\b(?:i|we|you|me|my|need|want|help|please|can|could|would|not|no|dont|don't|what|how|why|feel|have|am|is|are|sorry)\b/i;
// Latin greetings and lead-ins need a separator after them, so "Hiro" and "Imogen" stay whole.
const LEADING = /^(?:(?:您好|你好|哈囉|嗨)[\s,，!！~～。.]*|(?:hi|hello|hey)[\s,，!！~～。.]+)?(?:(?:我的名字是|我的名字叫|名字是|我叫做|我叫|叫我|我是|我姓)\s*|(?:my name is|i am|i'm|im|this is|call me|it's|its)\s+)?/i;
const TRAILING = /(?:就好了?|就可以了?|即可|就行了?)?[\s喔哦噢唷呦啦囉耶呀~～。．.!！,，]*$/;

// Short replies that acknowledge rather than answer (compared after trimming, case-insensitive).
const ACKNOWLEDGEMENTS = new Set([
  "好", "好的", "好喔", "好哦", "好唷", "好啊", "好呀", "ok", "okay", "嗯", "嗯嗯", "恩", "恩恩", "收到", "了解", "瞭解",
  "知道了", "沒問題", "是", "是的", "對", "對的", "謝謝", "感謝", "感恩", "多謝", "辛苦了", "yes", "no", "thanks",
  "thank you", "thx", "hi", "hello", "hey", "您好", "你好", "哈囉", "嗨", "👍", "🙏",
]);

/** The name in a reply to the name question, or null when the reply does not look like one. */
export function parseNameReply(text: string): string | null {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  if (!firstLine || NOT_A_NAME.test(firstLine) || hitsCrisis(text)) return null;
  const name = firstLine.replace(LEADING, "").replace(TRAILING, "").trim();
  if (!name || ACKNOWLEDGEMENTS.has(name.toLowerCase())) return null;
  const chars = [...name].length;
  const latin = /[a-z]/i.test(name);
  if (latin && LATIN_SENTENCE.test(name)) return null;
  if (chars > 20) return null;
  if (latin && name.split(/\s+/).length > 4) return null;
  // A CJK name longer than 6 characters is a sentence (我下午再過去看看).
  if (!latin && chars > 6) return null;
  return name;
}
