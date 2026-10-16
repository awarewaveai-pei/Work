// cs-engine guardrails — deterministic input/output checks. Pure (no I/O), unit-testable.
//
// These are defence-in-depth alongside the LLM supervisor (generate.ts). The input guards run
// BEFORE generation (cheap rejection); the output guards run on the drafted reply BEFORE send.
// The prompt-injection check here is a lightweight heuristic; the production design layers a
// PromptGuard-2 model on top (plan §5.4) — wire it in `inputGuards` when available.

import type { GuardrailResult } from "@/lib/cs/types";
import { hitsCrisis, hitsSensitive } from "@/lib/cs/autonomy";

const PASS: GuardrailResult = { pass: true };

/** Known prompt-injection / jailbreak phrasings (EN + zh-Hant). Heuristic, case-insensitive. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|above|prior) (instructions|prompt)/i,
  /disregard (your|the) (instructions|rules|system)/i,
  /you are now (a|an|the)\b/i,
  /system prompt/i,
  /reveal (your|the) (prompt|instructions|system)/i,
  /前述|忽略.*(指令|指示|規則)/,
  /你現在(是|要扮演)/,
  /洩漏.*(提示|指令|系統)/,
  /\bDAN\b|developer mode|jailbreak/i,
];

/** Input guard: reject obvious prompt-injection attempts. */
export function checkPromptInjection(text: string): GuardrailResult {
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      return { pass: false, reason: "prompt_injection_pattern", handoffReason: "prompt_injection" };
    }
  }
  return PASS;
}

/** Input guard: self-harm / suicide goes to a human under its own reason (runs first in inputGuards). */
export function checkCrisis(text: string): GuardrailResult {
  return hitsCrisis(text) ? { pass: false, reason: "crisis", handoffReason: "crisis" } : PASS;
}

/** Input guard: route sensitive topics (refund/identity/legal/complaint…) straight to a human. */
export function checkSensitiveIntent(text: string): GuardrailResult {
  if (hitsSensitive(text)) {
    return { pass: false, reason: "sensitive_topic", handoffReason: "sensitive_intent" };
  }
  return PASS;
}

/** Run all input guards; first failure wins. */
export function inputGuards(text: string): GuardrailResult {
  const checks = [checkCrisis, checkPromptInjection, checkSensitiveIntent];
  for (const check of checks) {
    const r = check(text);
    if (!r.pass) return r;
  }
  return PASS;
}

// ── Output guards ────────────────────────────────────────────────────────────

// Credit-card-ish (13-19 digit run, optional spaces/dashes) and Taiwan national id (A123456789,
// case-insensitive). Run AFTER NFKC normalization so fullwidth digits / Unicode dashes can't evade.
const CARD_RE = /(?:\d[ -]?){13,19}/;
const TW_ID_RE = /\b[A-Za-z][12]\d{8}\b/;

/** Output guard: refuse to send a reply that leaks card numbers / national ids. */
export function checkPiiLeak(reply: string): GuardrailResult {
  // NFKC folds fullwidth digits → ASCII; then unify Unicode hyphen/minus variants to ASCII '-'
  // (U+2010..U+2015 dashes, U+2212 minus, U+FE63 small hyphen, U+FF0D fullwidth hyphen).
  const norm = reply.normalize("NFKC").replace(/[‐-―−﹣－]/g, "-");
  // Card-like = a 13-19 digit run (with optional spaces/dashes) AND ≥13 raw digits overall,
  // so short order numbers like "#AW-20847" don't trip it.
  const digitCount = norm.replace(/[^\d]/g, "").length;
  if (digitCount >= 13 && CARD_RE.test(norm)) {
    return { pass: false, reason: "pii_card_like", handoffReason: "guardrail_block" };
  }
  if (TW_ID_RE.test(norm)) {
    return { pass: false, reason: "pii_national_id", handoffReason: "guardrail_block" };
  }
  return PASS;
}

/** Output guard: reply must be non-empty and within a sane length. */
export function checkReplyShape(reply: string): GuardrailResult {
  const t = reply.trim();
  if (!t) return { pass: false, reason: "empty_reply", handoffReason: "guardrail_block" };
  if (t.length > 4000) return { pass: false, reason: "reply_too_long", handoffReason: "guardrail_block" };
  return PASS;
}

/** Run all output guards on a drafted reply; first failure wins. */
export function outputGuards(reply: string): GuardrailResult {
  for (const check of [checkReplyShape, checkPiiLeak]) {
    const r = check(reply);
    if (!r.pass) return r;
  }
  return PASS;
}
