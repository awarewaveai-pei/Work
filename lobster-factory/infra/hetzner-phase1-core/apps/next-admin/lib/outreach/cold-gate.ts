// Cold Outreach — Cold Gate + message lint + evidence snapshot (task T8, spec §C2/§C3/§D2). Pure.
//
// Two gates:
//  1. checkColdGate(): PRE-generation — refuse to generate a cold email without a concrete observation
//     + source_url (anti-spam / anti-hallucination) or for a do_not_contact lead.
//  2. lintMessage(): POST-generation — forbidden words (hard block), hard CTA / missing opt-out /
//     length (warn). Produces safety_score + quality_gate_status for co_messages.

// Default sensitive forbidden phrases (spec §C4) — merged with the service profile's own list.
export const DEFAULT_FORBIDDEN: string[] = [
  "治療焦慮", "治療憂鬱", "療效保證", "改善疾病", "診斷", "取代諮商", "保證療癒",
  "保證成交", "保證業績", "穩賺", "一定提升營收",
];

export interface ColdGateLead {
  name?: string | null;
  observation?: string | null;
  source_url?: string | null;
  pain_guess?: string | null;
  do_not_contact?: boolean | null;
}

export interface ColdGateResult {
  status: "pass" | "block";
  blockers: string[];
}

const has = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

export function checkColdGate(lead: ColdGateLead): ColdGateResult {
  const blockers: string[] = [];
  if (lead.do_not_contact) blockers.push("do_not_contact: 此 lead 標記不可聯絡");
  if (!has(lead.observation)) blockers.push("缺 observation：冷信必須有具體觀察點（反罐頭/反幻覺）");
  if (!has(lead.source_url)) blockers.push("缺 source_url：冷信必須有公開來源依據");
  return { status: blockers.length === 0 ? "pass" : "block", blockers };
}

export interface EvidenceSnapshot {
  used_observation: string | null;
  used_pain_guess: string | null;
  source_url: string | null;
  unsupported_claims: string[];
}

export function buildEvidenceSnapshot(lead: ColdGateLead): EvidenceSnapshot {
  return {
    used_observation: has(lead.observation) ? lead.observation!.trim() : null,
    used_pain_guess: has(lead.pain_guess) ? lead.pain_guess!.trim() : null,
    source_url: has(lead.source_url) ? lead.source_url!.trim() : null,
    unsupported_claims: [],
  };
}

export interface MessageLint {
  safety_score: number; // 0..100
  quality_gate_status: "pass" | "warn" | "block";
  findings: string[];
  forbidden_hits: string[];
}

const HARD_CTA = ["立即購買", "馬上下單", "現在就買", "限時", "把握機會"];

export function lintMessage(body: string, forbiddenWords: string[] = []): MessageLint {
  const text = (body ?? "").trim();
  const findings: string[] = [];
  let score = 100;

  const forbidden = Array.from(new Set([...DEFAULT_FORBIDDEN, ...forbiddenWords.filter(Boolean)]));
  const forbidden_hits = forbidden.filter((w) => w && text.includes(w));
  if (forbidden_hits.length > 0) {
    findings.push(`禁用詞命中：${forbidden_hits.join(", ")}`);
    score -= 60;
  }

  const ctaHits = HARD_CTA.filter((w) => text.includes(w));
  if (ctaHits.length > 0) {
    findings.push(`高壓 CTA：${ctaHits.join(", ")}（建議改低壓詢問）`);
    score -= 15;
  }

  // Cold email should offer a graceful opt-out (spec §D1).
  if (text && !/不再打擾|不適合|回覆.*移除|取消|stop/i.test(text)) {
    findings.push("缺拒收句（建議加：如果不適合，我就不再打擾）");
    score -= 10;
  }

  const len = text.length;
  if (len === 0) {
    findings.push("空白內容");
    score = 0;
  } else if (len > 1200) {
    findings.push(`過長（${len} 字，建議 < 600）`);
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const quality_gate_status = forbidden_hits.length > 0 || len === 0 ? "block" : findings.length > 0 ? "warn" : "pass";
  return { safety_score: score, quality_gate_status, findings, forbidden_hits };
}
