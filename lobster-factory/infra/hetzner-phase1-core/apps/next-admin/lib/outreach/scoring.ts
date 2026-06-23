// Cold Outreach — deterministic lead scoring (task T6, spec §C1/§8). Pure + testable.
//
// IMPORTANT: Lead Quality and Contactability are FULLY MECHANICAL (no LLM needed). ICP Fit is
// partially mechanical (industry match, presence of AI-derived fields). The AI enrichment step
// (T-later) improves ICP by filling pain_guess / recommended_angle / social_summary — but a lead
// can already be scored + prioritised at import time with zero AI cost.

export interface ScorableLead {
  name?: string | null;
  industry?: string | null;
  website?: string | null;
  social_url?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  observation?: string | null;
  source_url?: string | null;
  // AI-derived (may be absent until enrichment):
  pain_guess?: string | null;
  social_summary?: string | null;
  recommended_angle?: string | null;
}

export interface ScoreOptions {
  isDuplicate?: boolean;
  emailVerified?: boolean;
  doNotContact?: boolean;
  serviceProfile?: { industry?: string | null; target_audiences?: string[] | null } | null;
}

export type Priority = "high" | "medium" | "low" | "not_recommended";

export interface LeadScores {
  lead_quality_score: number;
  contactability_score: number;
  icp_score: number;
  score: number; // overall (average of the three, rounded)
  priority: Priority;
}

const has = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";
const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

// §C1.1 Lead Quality (data quality) — fully mechanical.
export function scoreLeadQuality(l: ScorableLead, opts: ScoreOptions = {}): number {
  let s = 0;
  if (has(l.name)) s += 15;
  if (has(l.website) || has(l.social_url)) s += 15;
  if (has(l.email) || has(l.phone)) s += 20;
  if (has(l.industry)) s += 10;
  if (has(l.observation)) s += 20;
  if (has(l.source_url)) s += 10;
  if (!opts.isDuplicate) s += 10;
  return clamp100(s);
}

// §C1.2 Contactability — fully mechanical.
export function scoreContactability(l: ScorableLead, opts: ScoreOptions = {}): number {
  let s = 0;
  if (has(l.email)) s += 25;
  if (opts.emailVerified) s += 25;
  if (has(l.social_url)) s += 15;
  if (has(l.contact_role)) s += 15;
  if (has(l.contact_name)) s += 10;
  if (!opts.doNotContact) s += 10;
  return clamp100(s);
}

// §C1.3 ICP Fit — partially mechanical (industry match + presence of AI-derived signals).
export function scoreIcpFit(l: ScorableLead, opts: ScoreOptions = {}): number {
  let s = 0;
  const sp = opts.serviceProfile;
  const ind = l.industry?.trim().toLowerCase() ?? "";
  if (sp && ind) {
    const spInd = sp.industry?.trim().toLowerCase() ?? "";
    const aud = (sp.target_audiences ?? []).map((a) => a.trim().toLowerCase());
    if ((spInd && (ind === spInd || ind.includes(spInd) || spInd.includes(ind))) || aud.some((a) => a && (ind.includes(a) || a.includes(ind)))) {
      s += 25;
    }
  }
  if (has(l.pain_guess)) s += 20;
  if (has(l.social_summary)) s += 15;
  if (has(l.recommended_angle)) s += 20;
  if (has(l.contact_role)) s += 10;
  // budget possibility (10) left to manual/AI — not mechanically inferable.
  return clamp100(s);
}

// §8.4 priority thresholds applied to the overall score.
export function computePriority(overall: number): Priority {
  if (overall >= 80) return "high";
  if (overall >= 60) return "medium";
  if (overall >= 40) return "low";
  return "not_recommended";
}

export function scoreLead(l: ScorableLead, opts: ScoreOptions = {}): LeadScores {
  const q = scoreLeadQuality(l, opts);
  const c = scoreContactability(l, opts);
  const i = scoreIcpFit(l, opts);
  const overall = Math.round((q + c + i) / 3);
  return {
    lead_quality_score: q,
    contactability_score: c,
    icp_score: i,
    score: overall,
    priority: computePriority(overall),
  };
}
