// Cold Outreach — Free-Plan Router (task T4, PART H §H4).
//
// Pure, deterministic, unit-testable. Given a NEED and a RouterContext (which connectors are
// enabled for the org + whether each is within quota), it returns the ordered fallback ladder and
// the chosen step. Cost-first design: every ladder ends in a free/manual step that is ALWAYS usable,
// so the chosen step is never null — a need can degrade gracefully but never hard-block.
//
// Phase-1 active connectors: gemini (AI, free BYO) + hunter (verify).
// Upgrade connectors (claude / openai) are declared and usable once the org enables them.
// snov / apify / places / brevo / gmail / fluentsmtp are forward-compat stubs.

import type { ConnectorNeed, FallbackStep, RouterContext, ResolvedLadder } from "./types";

export const LADDERS: Record<ConnectorNeed, FallbackStep[]> = {
  ai_generation: [
    // Upgrade tier — higher quality, client pays for their own key
    { provider: "claude",        kind: "byo",    connectorName: "claude",        requiresConnector: true,  note: "客戶 BYO Claude key（品質最高，繁中尤佳）" },
    { provider: "openai",        kind: "byo",    connectorName: "openai",        requiresConnector: true,  note: "客戶 BYO OpenAI key（GPT-4o-mini 預設）" },
    // Free tier — default path, zero cost to client
    { provider: "gemini",        kind: "byo",    connectorName: "gemini",        requiresConnector: true,  note: "客戶 BYO Gemini free key（成本歸客戶，乘客戶數）" },
    { provider: "gemini_agency", kind: "agency", connectorName: "gemini_agency", requiresConnector: true,  note: "agency Gemini key（受 quota guard 限制）" },
    // Fallback — no key at all
    { provider: "manual_prompt", kind: "manual",                                  requiresConnector: false, note: "產 prompt 讓 operator 手動貼 ChatGPT/Claude（極省模式）" },
  ],
  email_verification: [
    { provider: "hunter",          kind: "byo",  connectorName: "hunter", requiresConnector: true,  note: "客戶 BYO Hunter（只驗 score>=80）" },
    { provider: "snov",            kind: "byo",  connectorName: "snov",   requiresConnector: true,  note: "客戶 BYO Snov（Phase 3）" },
    { provider: "mx_syntax",       kind: "free",                          requiresConnector: false, note: "免費 MX / syntax 檢查" },
    { provider: "mark_unverified", kind: "manual",                        requiresConnector: false, note: "標 unverified，不付費" },
  ],
  lead_scraping: [
    // Cost-first: manual is preferred so paid credit is reserved for high-value leads (PART H §H3).
    { provider: "manual",            kind: "manual",                         requiresConnector: false, note: "手動 / Google Maps 目視（最先用）" },
    { provider: "places",            kind: "free", connectorName: "places",  requiresConnector: true,  note: "Google Places API free credit（Phase 3）" },
    { provider: "apify",             kind: "byo",  connectorName: "apify",   requiresConnector: true,  note: "客戶 BYO Apify $5（只抓高價值，Phase 3）" },
    { provider: "mark_needs_manual", kind: "manual",                         requiresConnector: false, note: "標 needs_manual" },
  ],
  email_sending: [
    { provider: "gmail",      kind: "byo",    connectorName: "gmail",      requiresConnector: true,  note: "冷信：客戶 Gmail draft（人工寄）" },
    { provider: "fluentsmtp", kind: "byo",    connectorName: "fluentsmtp", requiresConnector: true,  note: "暖信：客戶自有 FluentSMTP" },
    { provider: "brevo",      kind: "free",   connectorName: "brevo",      requiresConnector: true,  note: "暖信 fallback：Brevo free 300/日" },
    { provider: "resend",     kind: "agency",                              requiresConnector: false, note: "交易信：Resend（agency 共用，永遠可用）" },
  ],
};

function isUsable(step: FallbackStep, ctx: RouterContext): boolean {
  if (!step.requiresConnector) return true; // free / manual / agency-always-on
  const name = step.connectorName;
  if (!name) return false;
  return ctx.enabledConnectors.has(name) && ctx.quotaOk(name);
}

/** Resolve the cost-first fallback ladder for a need. `chosen` is the first usable step. */
export function resolveLadder(need: ConnectorNeed, ctx: RouterContext): ResolvedLadder {
  const steps = LADDERS[need];
  const usable = steps.filter((s) => isUsable(s, ctx));
  return { need, steps, usable, chosen: usable[0] ?? null };
}
