// Cold Outreach — Cold Gate + message lint (task T8, spec §C2/§C3/§D2; v2 gateMessage below). Pure.
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

// v2 (SPEC §5.3): the subject is gated, and the parts code appends (signature, personal-data notice) must still be
// there -- an edited body is re-gated the same way (messages/route.ts PATCH), so a person cannot remove them unnoticed.
export const GATE_VERSION = "v2";
const SUBJECT_MAX = 25;
const SUBJECT_BANNED = ["免費", "限時"];

export function lintSubject(subject: string): string[] {
  const s = (subject ?? "").trim();
  const findings: string[] = [];
  if (!s) findings.push("主旨空白");
  if ([...s].length > SUBJECT_MAX) findings.push(`主旨過長（${[...s].length} 字，上限 ${SUBJECT_MAX}）`);
  const hits = Array.from(new Set([...HARD_CTA, ...SUBJECT_BANNED])).filter((w) => s.includes(w));
  if (hits.length) findings.push(`主旨含高壓字：${hits.join(", ")}`);
  return findings;
}

export interface RequiredParts { signature: string; notice: string | null }

export interface MessageGate extends MessageLint { gate_version: string }

/** One gate for every stored email: body lint + subject (first emails) + required parts. Any finding here blocks. */
export function gateMessage(args: { subject: string | null; body: string; forbidden: string[]; required: RequiredParts }): MessageGate {
  const lint = lintMessage(args.body, args.forbidden);
  const blocking: string[] = [];
  if (args.subject !== null) blocking.push(...lintSubject(args.subject));
  const body = (args.body ?? "").trim();
  if (!body.endsWith(args.required.signature.trim())) blocking.push("內文沒有以署名結尾");
  if (args.required.notice && !body.includes(args.required.notice)) blocking.push("缺個資告知行");
  const findings = [...lint.findings, ...blocking];
  const status = blocking.length ? "block" : lint.quality_gate_status;
  return { ...lint, findings, quality_gate_status: status, safety_score: blocking.length ? 0 : lint.safety_score, gate_version: GATE_VERSION };
}
