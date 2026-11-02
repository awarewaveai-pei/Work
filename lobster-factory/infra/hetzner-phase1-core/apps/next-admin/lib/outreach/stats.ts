// Outreach stats (SPEC §5.9, card C7): the pure aggregation behind /api/outreach/stats and its CSV.
// Cohort = the messages created in the date range. A lead belongs to the group (service profile × variant × angle) of its
// first cold email, so reply / meeting / customer / lost are counted once per lead and land next to the sends that earned
// them. A bounce event carries a message id and is counted by that message's group. There is no open rate on purpose.

export interface StatsMessage { id: string; lead_id: string; output_type: string; variant_label: string | null; angle: string | null; created_at: string }
export interface StatsEvent { message_id: string | null; lead_id: string | null; event_type: string }
export interface StatsReply { lead_id: string; kind: string; reply_type: string | null }
export interface StatsLead { id: string; service_profile_id: string | null; status: string }

export interface StatsRow {
  service_profile_id: string | null;
  service_name: string;
  variant_label: string;
  angle: string;
  generated: number; drafted: number; sent: number; bounced: number;
  replied: number; positive: number; meeting_booked: number; customer: number; lost: number;
  reply_rate: number | null; positive_rate: number | null;
}

export const POSITIVE_REPLY_TYPES = new Set(["interested", "pricing", "more_info", "case_study"]);
const BOUNCE_EVENTS = new Set(["hard_bounced", "soft_bounced"]);
const NONE = "（未指定）";

type Counts = Omit<StatsRow, "service_profile_id" | "service_name" | "variant_label" | "angle" | "reply_rate" | "positive_rate">;
const zero = (): Counts => ({ generated: 0, drafted: 0, sent: 0, bounced: 0, replied: 0, positive: 0, meeting_booked: 0, customer: 0, lost: 0 });
const rate = (n: number, d: number) => (d > 0 ? n / d : null);

export function aggregateStats(input: {
  messages: StatsMessage[]; events: StatsEvent[]; replies: StatsReply[]; leads: StatsLead[]; profileNames: Map<string, string>;
}): StatsRow[] {
  const leadById = new Map(input.leads.map((l) => [l.id, l]));
  const keyOf = (profileId: string | null, variant: string | null, angle: string | null) =>
    JSON.stringify([profileId, variant?.trim() || NONE, angle?.trim() || NONE]);
  const groups = new Map<string, { profileId: string | null; variant: string; angle: string; c: Counts }>();
  const group = (profileId: string | null, variant: string | null, angle: string | null) => {
    const k = keyOf(profileId, variant, angle);
    let g = groups.get(k);
    if (!g) { g = { profileId, variant: variant?.trim() || NONE, angle: angle?.trim() || NONE, c: zero() }; groups.set(k, g); }
    return g;
  };

  // Only outbound mail counts; a proposal summary is a draft for a reply, not a send.
  const messages = input.messages.filter((m) => m.output_type === "cold_email" || m.output_type === "followup");
  const msgKey = new Map<string, string>();
  const leadKey = new Map<string, string>();
  const firstEmailAt = new Map<string, string>();
  for (const m of messages) {
    const profileId = leadById.get(m.lead_id)?.service_profile_id ?? null;
    const g = group(profileId, m.variant_label, m.angle);
    g.c.generated += 1;
    msgKey.set(m.id, keyOf(profileId, m.variant_label, m.angle));
    if (m.output_type === "cold_email" && (!firstEmailAt.has(m.lead_id) || m.created_at < firstEmailAt.get(m.lead_id)!)) {
      firstEmailAt.set(m.lead_id, m.created_at);
      leadKey.set(m.lead_id, keyOf(profileId, m.variant_label, m.angle));
    }
  }
  const byKey = (k: string | undefined) => (k ? groups.get(k) : undefined);

  const seen = new Set<string>();
  const once = (tag: string, id: string) => { const s = `${tag}|${id}`; if (seen.has(s)) return false; seen.add(s); return true; };
  for (const e of input.events) {
    const field = e.event_type === "draft_created" ? "drafted" : e.event_type === "sent" ? "sent" : BOUNCE_EVENTS.has(e.event_type) ? "bounced" : null;
    if (!field) continue;
    const g = byKey((e.message_id && msgKey.get(e.message_id)) || (e.lead_id ? leadKey.get(e.lead_id) : undefined));
    if (g && once(field, e.message_id ?? `lead:${e.lead_id}`)) g.c[field] += 1;
  }
  for (const r of input.replies) {
    if (r.kind !== "reply" || r.reply_type === "unprocessed") continue;
    const g = byKey(leadKey.get(r.lead_id));
    if (!g) continue;
    if (once("replied", r.lead_id)) g.c.replied += 1;
    if (r.reply_type && POSITIVE_REPLY_TYPES.has(r.reply_type) && once("positive", r.lead_id)) g.c.positive += 1;
  }
  for (const [leadId, k] of leadKey) {
    const status = leadById.get(leadId)?.status;
    const g = byKey(k);
    if (g && (status === "meeting_booked" || status === "customer" || status === "lost")) g.c[status] += 1;
  }

  return [...groups.values()]
    .map((g): StatsRow => ({
      service_profile_id: g.profileId,
      service_name: (g.profileId && input.profileNames.get(g.profileId)) || NONE,
      variant_label: g.variant, angle: g.angle, ...g.c,
      reply_rate: rate(g.c.replied, g.c.sent), positive_rate: rate(g.c.positive, g.c.sent),
    }))
    .sort((a, b) => b.sent - a.sent || b.generated - a.generated || a.service_name.localeCompare(b.service_name));
}

const pct = (n: number | null) => (n === null ? "" : `${(n * 100).toFixed(1)}%`);
// A cell starting with = + - @ would run as an Excel formula (critic m5): prefix it with '.
const cell = (v: string | number) => `"${(typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : String(v)).replace(/"/g, '""')}"`;

/** CSV with a BOM so Excel reads the Chinese headers as UTF-8. */
export function statsToCsv(rows: StatsRow[]): string {
  const head = ["服務", "版本", "切角", "產生", "草稿", "寄出", "退信", "回覆", "正向回覆", "約到會議", "成交", "失去", "回覆率", "正向回覆率"];
  const lines = rows.map((r) => [r.service_name, r.variant_label, r.angle, r.generated, r.drafted, r.sent, r.bounced, r.replied, r.positive,
    r.meeting_booked, r.customer, r.lost, pct(r.reply_rate), pct(r.positive_rate)].map(cell).join(","));
  return `﻿${[head.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}
