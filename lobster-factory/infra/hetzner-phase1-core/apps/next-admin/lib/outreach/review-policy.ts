// Cold Outreach v2 — the review policy of a service profile (SPEC D23). Decisions are pure and deterministic (a hash of the
// lead id, never Math.random), so the same lead always gets the same variant and the same sample decision, and an audit
// can recompute both.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAngle, type Angle } from "./generation-schema";

const MIN_WEIGHT_HISTORY = 30;
export type ReviewMode = "manual" | "sampled";
/** Human-approved first emails a profile needs before it may switch to sampled. */
export const SAMPLED_MIN_HUMAN_APPROVED = 50;

const hash = (s: string): number => createHash("sha256").update(s).digest().readUInt32BE(0);

/** Sampled mode keeps one first email per lead. With no winning angle (C16.3): A on an even hash, B on an odd one. With
 *  one: the variant carrying it on FAVOURED_SHARE % of leads, the other on the rest -- never fixed (the other keeps >= 20 %),
 *  so a wrong winner keeps being measured. */
export const FAVOURED_SHARE = 75;
export function pickVariant(leadId: string, favoured: "A" | "B" | null = null): "A" | "B" {
  if (!favoured) return hash(leadId) % 2 === 0 ? "A" : "B";
  const other = favoured === "A" ? "B" : "A";
  return hash(`variant:${leadId}`) % 100 < FAVOURED_SHARE ? favoured : other;
}

// ── C16.1 risk-weighted sampling (SPEC D24 ①) ──
/** A profile's first auto-approvals are still being watched. */
export const FIRST_AUTO_APPROVALS = 20;
/** Evidence below this claim-support score (co_evidence.confidence; 0.5 is the approval floor) is low confidence. */
export const LOW_CONFIDENCE = 0.7;
/** A profile x angle needs this many sent in the window before its bad rate is compared with the organization's. */
export const MIN_SEGMENT_SENT = 10;
/** Weight added per risk flag; a mail with none weighs 1. */
export const RISK_EXTRA = { newProfile: 4, newIndustry: 2, lowConfidence: 2, badSegment: 3 } as const;
export type RiskFlag = keyof typeof RISK_EXTRA;
export const sampleWeight = (flags: readonly RiskFlag[]): number => 1 + flags.reduce((n, f) => n + RISK_EXTRA[f], 0);

/** What the weights are measured against; read once per profile per tick (loadSampleContext). */
export interface SampleContext {
  /** auto-approved first emails of the profile so far */
  autoApproved: number;
  /** industries the profile has mailed; null = unknown, never flags */
  mailedIndustries: ReadonlySet<string> | null;
  /** mean sample weight of the organization's recent decided first emails: the divisor that keeps the total at pct */
  meanWeight: number;
  /** this profile's 7-day sent and bad (bounced or negative reply) per angle, and the organization's overall bad rate */
  angleRates: ReadonlyMap<string, { sent: number; bad: number }>;
  orgBadRate: number | null;
  /** the profile's winning angle (C16.3); null until two angles have MIN_SENT_PER_ANGLE sends each */
  winner: Angle | null;
}
/** Nothing known, nothing flagged: weight 1 against a mean of 1, so the probability is exactly review_sample_pct. */
export const NEUTRAL_SAMPLE_CONTEXT: SampleContext = {
  autoApproved: FIRST_AUTO_APPROVALS, mailedIndustries: null, meanWeight: 0, angleRates: new Map(), orgBadRate: null, winner: null,
};

export interface SampleInput {
  leadId: string; pct: number; industry?: string | null; angle?: string | null;
  /** lowest claim-support score among the lead's approved evidence; null = none recorded */
  minConfidence: number | null;
}
export interface SampleDecision { sampled: boolean; weight: number; mean: number; p: number; flags: RiskFlag[] }

export function riskFlags(ctx: SampleContext, i: Pick<SampleInput, "industry" | "angle" | "minConfidence">): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (ctx.autoApproved < FIRST_AUTO_APPROVALS) flags.push("newProfile");
  const industry = i.industry?.trim();
  if (industry && ctx.mailedIndustries && !ctx.mailedIndustries.has(industry)) flags.push("newIndustry");
  if (i.minConfidence !== null && i.minConfidence < LOW_CONFIDENCE) flags.push("lowConfidence");
  const seg = i.angle ? ctx.angleRates.get(i.angle) : undefined;
  if (seg && seg.sent >= MIN_SEGMENT_SENT && ctx.orgBadRate !== null && seg.bad / seg.sent > ctx.orgBadRate) flags.push("badSegment");
  return flags;
}

/** P(sampled) = pct x weight / mean weight, capped at 1. */
export const sampleProbability = (pct: number, weight: number, meanWeight: number): number =>
  Math.min(1, (Math.max(0, Math.min(100, pct)) / 100) * weight / Math.max(meanWeight, 1));

/** Same lead, pct, weight and mean always give the same answer (hash, never Math.random); an audit recomputes it from the
 *  weight and mean kept in gate_snapshot.sample. */
export function inWeightedSample(leadId: string, pct: number, weight: number, meanWeight: number): boolean {
  return hash(`sample:${leadId}`) % 10000 < sampleProbability(pct, weight, meanWeight) * 10000;
}

/** Whether this lead's email goes to a person anyway, with no risk information (weight = mean = 1). */
export const inSample = (leadId: string, pct: number): boolean => inWeightedSample(leadId, pct, 1, 1);

export function decideSample(ctx: SampleContext, i: SampleInput): SampleDecision {
  const flags = riskFlags(ctx, i);
  const weight = sampleWeight(flags);
  const mean = ctx.meanWeight > 0 ? ctx.meanWeight : weight;
  return { sampled: inWeightedSample(i.leadId, i.pct, weight, mean), weight, mean,
    p: sampleProbability(i.pct, weight, mean), flags };
}

/** Lowest claim-support score among approved evidence that has one. */
export function minConfidence(evidence: ReadonlyArray<{ status: string; confidence?: number | null }>): number | null {
  const v = evidence.filter((e) => e.status === "approved" && typeof e.confidence === "number").map((e) => e.confidence as number);
  return v.length ? Math.min(...v) : null;
}

// ── C16.3 angle feedback (SPEC D24 ③) ──
/** Sent first emails per angle a profile needs before an angle can be called the winner. */
export const MIN_SENT_PER_ANGLE = 30;
/** Best reply rate among the angles with MIN_SENT_PER_ANGLE sends; needs two such angles and a strict lead. */
export function winningAngle(rows: ReadonlyArray<{ angle: string; sent: number; replied: number }>): Angle | null {
  const ranked = rows.filter((r) => isAngle(r.angle) && r.sent >= MIN_SENT_PER_ANGLE)
    .map((r) => ({ angle: r.angle as Angle, rate: r.replied / r.sent })).sort((a, b) => b.rate - a.rate);
  return ranked.length >= 2 && ranked[0].rate > ranked[1].rate ? ranked[0].angle : null;
}
/** The variant carrying the winning angle; null when none or both do (then the plain hash decides). */
export function favouredLabel(winner: Angle | null, variants: ReadonlyArray<{ label: string | null; angle: string | null }>): "A" | "B" | null {
  if (!winner) return null;
  const hit = variants.filter((v) => v.angle === winner && (v.label === "A" || v.label === "B"));
  return hit.length === 1 ? (hit[0].label as "A" | "B") : null;
}

export type ClaimCheck = { verdict: "supported" } | { verdict: "unsupported"; claims: string[] } | { verdict: "error"; error: string };

/** Auto-approve only when all three hold; anything else stays a draft in the person's queue. block never passes. */
export function autoApproves(args: { gate: "pass" | "warn" | "block"; sampled: boolean; claim: ClaimCheck | null }): boolean {
  return args.gate === "pass" && !args.sampled && args.claim?.verdict === "supported";
}

/** First emails a person approved (gate_snapshot.auto is not true) under this profile: the count that unlocks sampled.
 *  The profile is the one recorded when the email was written (gate_snapshot.profile_id), not the lead's current one:
 *  moving approved leads onto another profile must not unlock it. */
export async function humanApprovedCount(db: SupabaseClient, profileId: string, organizationId: string | null): Promise<number> {
  let q = db
    .from("co_messages")
    .select("id", { count: "exact", head: true })
    .eq("gate_snapshot->>profile_id", profileId)
    .eq("output_type", "cold_email")
    .not("approved_at", "is", null)
    .or("gate_snapshot->>auto.is.null,gate_snapshot->>auto.neq.true");
  q = organizationId ? q.eq("organization_id", organizationId) : q.is("organization_id", null);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// ── the batch read behind SampleContext ──
const NEGATIVE_REPLIES = ["reject", "unsubscribe", "no_need"];
const BOUNCES = ["hard_bounced", "soft_bounced"];
const WINDOW_MS = 7 * 86_400_000;
const IN_CHUNK = 200;
const MAIL_LIMIT = 5000;
type DbResult = { data: unknown; error: { message: string } | null };
const rows = <T>(what: string, r: DbResult): T[] => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return (r.data ?? []) as T[];
};
async function chunked<T>(ids: string[], what: string, read: (part: string[]) => PromiseLike<DbResult>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(...rows<T>(what, await read(ids.slice(i, i + IN_CHUNK))));
  return out;
}

/** Everything the risk weights and the angle winner need for one profile: five reads plus two chunked ones, per profile per
 *  tick, never per mail. A failed read throws: the caller must not sample on guesses. */
export async function loadSampleContext(db: SupabaseClient, organizationId: string | null, profileId: string, now: Date = new Date()): Promise<SampleContext> {
  // The builders' own generic types are too deep for tsc to keep checking through a constraint (TS2589): one cast here.
  const org = <Q>(q: Q): Q => {
    const f = q as unknown as { eq(c: string, v: string): Q; is(c: string, v: null): Q };
    return organizationId ? f.eq("organization_id", organizationId) : f.is("organization_id", null);
  };
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const [auto, decided, mailed, recent, mine] = await Promise.all([
    org(db.from("co_messages").select("id", { count: "exact", head: true }).eq("gate_snapshot->>profile_id", profileId)
      .eq("output_type", "cold_email").not("approved_at", "is", null).eq("gate_snapshot->>auto", "true")),
    // decided first emails carry gate_snapshot.sampled (and, from C16.1, sample.weight)
    org(db.from("co_messages").select("gate_snapshot").eq("output_type", "cold_email").not("gate_snapshot->>sampled", "is", null)
      .order("created_at", { ascending: false }).limit(300)),
    org(db.from("co_messages").select("co_leads!inner(industry)").eq("gate_snapshot->>profile_id", profileId).eq("output_type", "cold_email")
      .in("status", ["sending", "sent"]).limit(1000)),  // mailed = actually sent, not just approved (Codex C16 F2)
    org(db.from("co_messages").select("id, lead_id, angle, gate_snapshot").eq("output_type", "cold_email").eq("status", "sent")
      .gte("sent_at", since).limit(MAIL_LIMIT)),  // sent in the window, whenever drafted (Codex C16 F3)
    org(db.from("co_messages").select("id, lead_id, angle").eq("gate_snapshot->>profile_id", profileId).eq("output_type", "cold_email")
      .eq("status", "sent").not("angle", "is", null).limit(MAIL_LIMIT)),
  ]);
  if (auto.error) throw new Error(`auto-approved count: ${auto.error.message}`);

  const weights = rows<{ gate_snapshot: { sample?: { weight?: number } } | null }>("sample weights read", decided)
    .map((r) => r.gate_snapshot?.sample?.weight).filter((w): w is number => typeof w === "number" && w >= 1);
  // Too little history to know the mean: 0 = each mail is its own mean, so the rate is exactly pct (Codex C16 F1:
  // a new profile would otherwise be sampled at pct x 5).
  const meanWeight = weights.length >= MIN_WEIGHT_HISTORY ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
  type Industry = { industry: string | null } | null;
  const industries = new Set(rows<{ co_leads: Industry | Industry[] }>("mailed industries read", mailed)
    .flatMap((r) => (Array.isArray(r.co_leads) ? r.co_leads : [r.co_leads]).map((l) => l?.industry?.trim() ?? "")).filter(Boolean));

  type Mail = { id: string; lead_id: string; angle: string | null; gate_snapshot?: { profile_id?: string | null } | null };
  const week = rows<Mail>("7-day mail read", recent);
  const all = rows<Mail>("profile mail read", mine);
  const [bounces, replies] = await Promise.all([
    chunked<{ message_id: string }>([...new Set(week.map((m) => m.id))], "bounce events read",
      (p) => db.from("co_sending_events").select("message_id").in("event_type", BOUNCES).in("message_id", p)),
    chunked<{ lead_id: string; reply_type: string | null }>([...new Set([...week, ...all].map((m) => m.lead_id))], "replies read",
      (p) => db.from("co_replies").select("lead_id, reply_type").eq("kind", "reply").in("lead_id", p)),
  ]);
  const bounced = new Set(bounces.map((b) => b.message_id));
  const negative = new Set(replies.filter((r) => r.reply_type && NEGATIVE_REPLIES.includes(r.reply_type)).map((r) => r.lead_id));
  // classified replies only: a row still being classified (NULL) is not yet a reply (Codex C16 F4)
  const replied = new Set(replies.filter((r) => !!r.reply_type && r.reply_type !== "unprocessed").map((r) => r.lead_id));

  const angleRates = new Map<string, { sent: number; bad: number }>();
  let orgSent = 0, orgBad = 0;
  for (const m of week) {
    const bad = bounced.has(m.id) || negative.has(m.lead_id) ? 1 : 0;
    orgSent++; orgBad += bad;
    if (m.angle && m.gate_snapshot?.profile_id === profileId) {
      const a = angleRates.get(m.angle) ?? { sent: 0, bad: 0 };
      a.sent++; a.bad += bad; angleRates.set(m.angle, a);
    }
  }
  const byAngle = new Map<string, { angle: string; sent: number; replied: number; leads: Set<string> }>();
  for (const m of all) {
    const a = byAngle.get(m.angle!) ?? { angle: m.angle!, sent: 0, replied: 0, leads: new Set<string>() };
    a.sent++;
    if (replied.has(m.lead_id) && !a.leads.has(m.lead_id)) { a.leads.add(m.lead_id); a.replied++; }
    byAngle.set(m.angle!, a);
  }
  return { autoApproved: auto.count ?? 0, mailedIndustries: industries, meanWeight, angleRates,
    orgBadRate: orgSent > 0 ? orgBad / orgSent : null, winner: winningAngle([...byAngle.values()]) };
}
