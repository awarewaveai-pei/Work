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
export function handoffAckText(cis: CisProfile, askName: boolean): string {
  const v = cis.csVoice ?? {};
  const you = v.honorifics === "你" ? "你" : "您";
  const ack = v.escalationTone?.trim() || `已收到${you}的訊息，我們會盡快回覆${you}${v.emojiPolicy === "none" ? "。" : " 🙏"}`;
  if (!askName) return ack;
  return `${ack}\n${v.askName?.trim() || `請問怎麼稱呼${you}呢？`}`;
}

// A reply that reads like a question or a request is not a name. Deliberately conservative: a
// missed name costs nothing (the agent can still ask), a wrong one makes the agent greet the
// customer by a sentence.
const NOT_A_NAME = /[?？0-9０-９@/:]|嗎|呢|什麼|甚麼|怎麼|多少|請問|想問|可以|能不能|課程|報名|價格|費用|時間|地址|退款|謝謝你|不用|不要|沒有/;
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
  if (!firstLine || NOT_A_NAME.test(firstLine)) return null;
  const name = firstLine.replace(LEADING, "").replace(TRAILING, "").trim();
  if (!name || ACKNOWLEDGEMENTS.has(name.toLowerCase())) return null;
  const chars = [...name].length;
  const latin = /[a-z]/i.test(name);
  if (chars > 20) return null;
  if (latin && name.split(/\s+/).length > 4) return null;
  // A CJK name longer than 6 characters is a sentence (我下午再過去看看).
  if (!latin && chars > 6) return null;
  return name;
}
