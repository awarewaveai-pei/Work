// Free automatic answers: the operator writes question entries (trigger keywords + the answer, in
// client_config.csFaq) and a customer message that contains an entry's keywords gets that answer,
// sent as written. No model call and no credit: app/api/webhooks/chatwoot/route.ts runs this before
// the credit reservation and the AI pipeline ("能用寫程式就用寫的", operator 2026-10-12/2026-10-15).
//
// Wrong answers are the cost to avoid, so anything uncertain goes to a human instead: no keyword
// hit, two entries tied for the best match, or a message touching money/legal/complaints. An entry
// marked `handoff` answers AND hands over, for questions a person has to follow up (booking, prices).

import { hitsSensitive } from "@/lib/cs/autonomy";
import type { CisProfile, CsFaqEntry } from "@/lib/cs/types";

/** Limits shared by the API sanitizer and the editor. */
export const CS_FAQ_LIMITS = { entries: 50, keywords: 20, keywordChars: 30, answerChars: 1000 } as const;

/** Full-width to half-width, case-folded: "ＯＫ", "Ok" and "ok" are the same keyword. */
function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** The entry whose keywords the message contains most, or null when none match or the best is tied. */
export function matchFaq(entries: readonly CsFaqEntry[], text: string): CsFaqEntry | null {
  if (!text.trim() || hitsSensitive(text)) return null;
  const message = normalize(text);
  let best: CsFaqEntry | null = null;
  let bestScore = 0;
  let tied = false;
  for (const entry of entries) {
    if (!entry.answer.trim()) continue;
    const score = new Set(entry.keywords.map(normalize).filter((k) => k && message.includes(k))).size;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }
  return best && !tied ? best : null;
}

/** The FAQ answer a tenant gives this message, or null. The FAQ only answers where there is a
 * Chatwoot to send through; the webhook and the offline exam both ask here, so they cannot drift
 * (Codex 2026-10-16 partialreview-e9405b9c F1). */
export function tenantFaqAnswer(cis: Pick<CisProfile, "chatwoot" | "csFaq">, text: string): CsFaqEntry | null {
  return cis.chatwoot ? matchFaq(cis.csFaq ?? [], text) : null;
}

/** Validates operator input (cis API) and stored config (loadCis) alike; drops what does not fit. */
export function sanitizeFaq(raw: unknown): CsFaqEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CsFaqEntry[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const answer = typeof e.answer === "string" ? e.answer.trim().slice(0, CS_FAQ_LIMITS.answerChars) : "";
    const keywords = Array.isArray(e.keywords)
      ? [...new Set(e.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim().slice(0, CS_FAQ_LIMITS.keywordChars)).filter(Boolean))].slice(0, CS_FAQ_LIMITS.keywords)
      : [];
    if (!answer || !keywords.length) continue;
    let id = typeof e.id === "string" && /^[\w-]{1,40}$/.test(e.id) && !used.has(e.id) ? e.id : "";
    for (let n = out.length + 1; !id; n++) if (!used.has(`faq-${n}`)) id = `faq-${n}`;
    used.add(id);
    out.push({ id, keywords, answer, ...(e.handoff === true ? { handoff: true } : {}) });
    if (out.length >= CS_FAQ_LIMITS.entries) break;
  }
  return out;
}
