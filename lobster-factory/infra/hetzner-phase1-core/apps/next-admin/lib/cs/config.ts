// cs-engine config — models, thresholds, and the HARD red-lines.
//
// Everything tunable lives here so the pipeline files stay logic-only. The red-line constants
// (A3 keywords, MAX_REFUND_CENTS) are deliberately code constants, NOT DB config — an LLM (or a
// compromised DB row) must never be able to raise the ceiling on money / identity actions.
// See agency-os/docs/Customer_service/Customer_service_automation_plan.md §3.4, §14.

import { CLAUDE_FAST_MODEL } from "@/lib/ai/claude-params";

export const CS_MODELS = {
  /** Cheap, fast — intent classification + supervisor grounding verdict. */
  classify: CLAUDE_FAST_MODEL,
  supervisor: CLAUDE_FAST_MODEL,
  /** Main customer-facing generation. */
  generate: "claude-opus-5-5",
  /** Cross-provider failover when Claude errors/times out. */
  geminiFallback: "gemini-2.0-flash-lite",
} as const;

// Embedding + retrieval fan-out constants moved to lib/kb/config.ts in K0 (ADR 011 §決策 3):
// they were referenced only by the retrieval path, never by customer-service decision logic.

export const CS_TIMEOUTS = {
  classifyMs: 8_000,
  generateMs: 20_000,
  supervisorMs: 8_000,
  toolMs: 10_000,
  /** Outbound Chatwoot Account API calls (send reply/draft, toggle status). Every other outbound
   * fetch in lib/cs/ has a bound (see llm.ts); chatwoot-client.ts previously had none — an unreachable
   * Chatwoot could hang the webhook handler past a platform timeout, past even the catch block's
   * own Sentry capture. */
  chatwootMs: 10_000,
} as const;

export const CS_THRESHOLDS = {
  /** Min retrieval cosine similarity for the top chunk; below ⇒ knowledge gap ⇒ handoff. */
  minRetrievalScore: 0.5,
  /** Default intent confidence floor; per-intent override in cs_intents.confidence_threshold. */
  defaultConfidence: 0.8,
  /** Max agentic tool-call rounds per turn (chain-length cap, §3.3). */
  maxToolRounds: 4,
} as const;

/**
 * A3 red-line: money / identity / legal / medical that may NEVER be handled autonomously. Matched
 * case-insensitively (substring) in TWO places: the customer message — autonomy.ts hitsRedLine,
 * which forces handoff in decideAnswerAction — AND the tool NAME — tools.ts resolveToolDecision,
 * which forces pending_human even if the DB risk column was mis-tagged. Hitting either ⇒ human.
 */
export const CS_RED_LINE_KEYWORDS = [
  "refund", "退款", "退費", "chargeback", "扣款", "退訂",
  "password", "密碼", "reset account", "帳號變更", "改密碼", "身分驗證", "identity",
  "delete account", "刪除帳號", "刪除資料", "delete my data",
  "legal", "法律", "lawsuit", "合約爭議", "醫療", "medical", "診斷",
  // Medication: whether to stop, cut or change a drug is medical advice (exam 2026-10-16 m1:
  // 「可以停藥嗎」 reached a human only because retrieval missed). The bare 藥／药 catches every
  // phrasing (調整我的藥, 停藥, 安眠藥); words without it are listed beside it.
  "藥", "药", "劑量", "剂量", "處方", "处方", "抗憂鬱", "抗抑鬱", "抗焦慮", "抗抑郁", "抗忧郁", "抗焦虑",
  "鎮定劑", "镇定剂", "百憂解", "樂復得", "克憂果", "贊安諾", "百忧解", "乐复得", "赞安诺",
  "medication", "medicine", "meds", "drug", "pill", "antidepressant", "anti-depressant",
  "ssri", "prescription", "dose", "prozac", "zoloft", "lexapro", "xanax",
] as const;

/**
 * Crisis: self-harm / suicide. Its own list, not part of the red-line: the red-line is also matched
 * against tool names (tools.ts), and a crisis needs its own handoff reason so the acknowledgement can
 * differ from the ordinary one (operator decision pending, TASKS.md). Matched as autonomy.ts hitsAny
 * does; deliberately wide -- a false hit only costs a human reply. Euphemisms no list can hold are
 * the classifier's job: a tenant intent with isSensitive (safetyGate).
 */
export const CS_CRISIS_KEYWORDS = [
  "自殺", "自傷", "自殘", "傷害自己", "傷害我自己", "想死", "去死", "不想活", "不想再活", "活不下去",
  "撐不下去", "活著沒意義", "死了算了", "不如死", "一了百了", "結束生命", "結束自己", "了結自己", "輕生",
  "尋死", "割腕", "跳樓", "燒炭", "上吊", "遺書", "想消失", "離開這個世界",
  "自杀", "自伤", "自残", "伤害自己", "伤害我自己", "撑不下去", "活着没意义", "结束生命", "结束自己",
  "了结自己", "轻生", "寻死", "跳楼", "烧炭", "遗书", "离开这个世界",
  "suicid", "kill myself", "killing myself", "end my life", "ending my life", "take my own life",
  "end it all", "to end things", "end everything", "self-harm", "self harm", "selfharm", "hurt myself",
  "hurting myself", "harm myself", "harming myself", "cut myself", "cutting myself", "want to die",
  "wanna die", "better off dead", "don't want to live", "dont want to live", "do not want to live",
  "no reason to live", "not worth living", "not be here anymore", "can't go on anymore",
  "cant go on anymore", "can't go on like this", "cant go on like this", "can't take it anymore",
  "cant take it anymore", "overdose",
] as const;

/**
 * A tenant intent with this key AND is_sensitive is the classifier's catch for what CS_CRISIS_KEYWORDS
 * cannot list (euphemisms). It routes exactly like a keyword hit: reason "crisis", help lines,
 * operator page. A specific key, so an unrelated "crisis" intent (financial, PR) never pages anyone
 * (Codex 2026-10-16 partialreview-6e23abdb). Soulful has it since 2026-10-16 (WORKLOG). Not covered:
 * paths where no classification runs (credit exhausted, a human already owns the thread) -- keywords only.
 */
export const CS_CRISIS_INTENT_KEY = "self_harm";

/**
 * Threats to hurt other people (operator decision 2026-10-17: 「我要殺光所有的人」 was answered only by
 * the ordinary acknowledgement, and a second one went unseen while a human owned the conversation).
 * Paged to the operator like a crisis, in both states. Phrases, not bare characters: 殺 alone would
 * page on 殺價 / 殺時間. Wide on purpose -- a false hit costs one page and a human reply. Euphemisms
 * are the classifier's job (CS_THREAT_INTENT_KEY).
 */
export const CS_THREAT_KEYWORDS = [
  "殺光", "殺死", "殺掉", "殺了你", "殺了他", "殺了她", "殺人", "砍死", "砍人", "砍你", "打死你", "打死他",
  "弄死", "宰了你", "捅死", "捅你", "炸死", "炸掉", "炸彈", "放火燒", "縱火", "開槍", "槍殺", "毒死",
  "報復你", "同歸於盡", "血洗", "屠殺", "傷害你們", "傷害別人", "傷害他人", "傷害他們", "讓你們好看",
  "讓你好看", "給我等著",
  "杀光", "杀死", "杀掉", "杀了你", "杀了他", "杀了她", "杀人", "打死你", "宰了你", "炸弹", "纵火",
  "开枪", "枪杀", "报复你", "同归于尽", "屠杀", "伤害你们", "伤害别人", "伤害他人", "伤害他们",
  "让你们好看", "让你好看", "给我等着",
  "kill you", "kill them", "kill him", "kill her", "kill everyone", "kill everybody", "kill all",
  "going to kill", "gonna kill", "murder", "shoot you", "shoot them", "shoot everyone", "bomb",
  "stab you", "stab them", "hurt you", "hurt them", "hurt someone", "hurt people", "burn it down",
  "burn down", "make you pay",
] as const;

/**
 * A tenant intent with this key AND is_sensitive is the classifier's catch for threats no list holds;
 * it pages like a keyword hit. Same rule as CS_CRISIS_INTENT_KEY: only this key, so an unrelated
 * intent never pages. Not covered: a human already owns the thread (no classification) -- keywords only.
 */
export const CS_THREAT_INTENT_KEY = "threat_to_others";

/**
 * A crisis message while a human owns the conversation gets the help lines at most once per
 * conversation per this window (operator decision 2026-10-17; state in migration 0104).
 */
export const CS_CRISIS_HOLDING_WINDOW_SECONDS = 30 * 60;
/** A claim whose send was never confirmed stops blocking after this long (a send in flight; 0104). */
export const CS_CRISIS_HOLDING_INFLIGHT_SECONDS = 120;

/**
 * The AI stays silent in a conversation while a staff member has replied there in public within this
 * window; otherwise it answers as usual, also in a conversation already handed to a human (operator
 * decision 2026-10-17, N = 30 minutes; state in migration 0108). Private notes do not count.
 */
export const CS_STAFF_ACTIVE_WINDOW_SECONDS = 30 * 60;

/** Sensitive intents → always handoff (broader than red-line; includes complaints/escalation). */
export const CS_SENSITIVE_KEYWORDS = [
  ...CS_RED_LINE_KEYWORDS,
  ...CS_CRISIS_KEYWORDS,
  ...CS_THREAT_KEYWORDS,
  "complaint", "投訴", "客訴", "申訴", "退貨爭議", "情緒", "威脅", "threaten",
] as const;

/**
 * Hard ceiling for any money-moving tool, as a CODE constant. The A2 gate (tools.ts) refuses any
 * tool call whose amount exceeds this; only a human can authorize beyond it. Cents to avoid floats.
 */
export const MAX_REFUND_CENTS = 0; // 0 = no autonomous money movement at all in U1; raise deliberately later.
