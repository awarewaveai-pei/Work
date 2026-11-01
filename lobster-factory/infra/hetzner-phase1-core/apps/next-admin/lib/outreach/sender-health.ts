// The daily health of the sender-pool mailboxes (card C11.3; SPEC D21, deliverability §12 and §15.3). For every active
// cold mailbox in send_mode='auto': ① DNS of its domain (SPF includes Google, DKIM google._domainkey, DMARC) -- a gap is
// 'warning' + timeline + one push, a gap still there the next Taipei day is 'paused'; ② 7-day hard-bounce rate -- at
// least 30 sent and >= 3% is 'paused' + push; ③ warm-up step -- the last 5 send days each at >= 70% of the stage cap
// and a 7-day hard-bounce rate under 2% moves w1 -> w2 -> w3 -> full. A paused mailbox comes back only through
// recheckSender (the Connectors page button): DNS complete and the bounce rate below the pause line, else it stays and
// the reasons are shown. 'blocked' is a person's decision and is never touched. The run also deletes send claims older
// than 31 days (0152; the 30-day recipient cap never reads them). Draft mailboxes are not checked: they never send, and
// a free-mail address has no DNS of ours.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEXT_STAGE, stageCap, taipeiDay, type WarmupStage } from "./sender";
import { FREE_MAIL } from "./research-extract";

/** Why an address may not join the sender pool, or null. The main domain never sends cold mail (SPEC I10, D12); a
 *  free-mail box has no DNS of ours to check or warm up. Pool mailboxes live on their own subdomains. */
export function poolEmailRefusal(email: string, mainDomain: string): string | null {
  const domain = (email.trim().toLowerCase().split("@")[1] ?? "").replace(/\.$/, "");
  const main = mainDomain.trim().toLowerCase();
  if (!domain) return "不是 email 地址";
  if (main && domain === main) return `主網域 ${main} 永不寄冷信，寄件池要用次網域`;
  if (FREE_MAIL.some((p) => domain === p || domain.endsWith(`.${p}`))) return "免費信箱不能進寄件池";
  return null;
}

export interface DnsFound { spf: boolean | null; dkim: boolean | null; dmarc: boolean | null }  // null = DNS did not answer
export interface DnsStatus { spf: boolean; dkim: boolean; dmarc: boolean; checked: string; missing_since: string | null }
export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}

export interface PoolSender {
  id: string;
  organization_id: string | null;
  email: string;
  daily_limit: number;
  warmup_stage: string;
  health_status: string;
  dns_status: DnsStatus | null;
}

export interface SenderStats {
  sent7: number;
  hardBounced7: number;
  /** sent per Taipei day, newest first, days with nothing sent left out */
  sendDays: number[];
}

export const BOUNCE_MIN_SENT = 30;
export const BOUNCE_PAUSE_RATE = 0.03;
export const PROMOTE_MAX_BOUNCE_RATE = 0.02;
export const PROMOTE_DAYS = 5;
export const PROMOTE_FILL = 0.7;
export const CLAIM_KEEP_DAYS = 31;

const NO_RECORD = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

async function lookup<T>(q: () => Promise<T[]>, match: (rows: T[]) => boolean): Promise<boolean | null> {
  try {
    return match(await q());
  } catch (e) {
    return NO_RECORD.has((e as { code?: string }).code ?? "") ? false : null;
  }
}

/** Google Workspace sending setup for one domain (deliverability §12). */
export async function checkDns(domain: string, r: DnsResolver): Promise<DnsFound> {
  const txt = (rows: string[][]) => rows.map((parts) => parts.join(""));
  const spf = await lookup(() => r.resolveTxt(domain),
    (rows) => txt(rows).some((t) => /^v=spf1\s/i.test(t) && /\binclude:_spf\.google\.com\b/i.test(t)));
  const dmarc = await lookup(() => r.resolveTxt(`_dmarc.${domain}`), (rows) => txt(rows).some((t) => /^v=DMARC1\b/i.test(t)));
  const dkimName = `google._domainkey.${domain}`;
  let dkim = await lookup(() => r.resolveTxt(dkimName), (rows) => txt(rows).some((t) => /\bp=[A-Za-z0-9+/]/.test(t)));
  if (dkim !== true) {
    const viaCname = await lookup(() => r.resolveCname(dkimName), (rows) => rows.length > 0);
    dkim = viaCname === true ? true : dkim === null || viaCname === null ? null : false;
  }
  return { spf, dkim, dmarc };
}

const DNS_LABEL: Record<keyof DnsFound, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC" };

/** missing = records not there; unknown = DNS did not answer (no verdict on those today, the old value stays). */
export function judgeDns(prev: DnsStatus | null, found: DnsFound, today: string, checkedIso: string):
  { status: DnsStatus; missing: string[]; unknown: string[]; pause: boolean } {
  const keys = Object.keys(DNS_LABEL) as Array<keyof DnsFound>;
  const value = (k: keyof DnsFound): boolean => found[k] ?? prev?.[k] ?? false;
  const missing = keys.filter((k) => found[k] === false).map((k) => DNS_LABEL[k]);
  const unknown = keys.filter((k) => found[k] === null).map((k) => DNS_LABEL[k]);
  const gap = keys.some((k) => !value(k));
  const missing_since = gap ? prev?.missing_since ?? today : null;
  return {
    status: { spf: value("spf"), dkim: value("dkim"), dmarc: value("dmarc"), checked: checkedIso, missing_since },
    missing, unknown,
    pause: missing.length > 0 && missing_since !== null && missing_since < today,
  };
}

export function judgeBounce(sent7: number, hardBounced7: number): { rate: number; pause: boolean } {
  const rate = sent7 > 0 ? hardBounced7 / sent7 : 0;
  return { rate, pause: sent7 >= BOUNCE_MIN_SENT && rate >= BOUNCE_PAUSE_RATE };
}

/** The stage after this one when the last 5 send days each filled 70% of the current cap, else null. Days sent at an
 *  earlier stage cannot qualify: every lower cap is under 70% of the next one. */
export function nextStage(stage: string, dailyLimit: number, stats: SenderStats): WarmupStage | null {
  const next = NEXT_STAGE[stage as WarmupStage] ?? null;
  if (!next) return null;
  const days = stats.sendDays.slice(0, PROMOTE_DAYS);
  const need = PROMOTE_FILL * stageCap(stage, dailyLimit);
  if (days.length < PROMOTE_DAYS || days.some((n) => n < need)) return null;
  return judgeBounce(stats.sent7, stats.hardBounced7).rate < PROMOTE_MAX_BOUNCE_RATE ? next : null;
}

export interface SenderVerdict {
  patch: Record<string, unknown>;
  health: string;
  reasons: string[];
  /** a timeline line for this run, when something is wrong or changed */
  timeline: string | null;
  /** one push, only when the mailbox newly turns warning or paused */
  notify: string | null;
}

const pct = (r: number): string => `${(r * 100).toFixed(1)}%`;

/** The daily verdict for one mailbox. */
export function evaluateSender(s: PoolSender, found: DnsFound, stats: SenderStats, today: string, nowIso: string): SenderVerdict {
  const domain = s.email.split("@")[1] ?? "";
  const dns = judgeDns(s.dns_status, found, today, nowIso);
  const bounce = judgeBounce(stats.sent7, stats.hardBounced7);
  const patch: Record<string, unknown> = { dns_status: dns.status, dns_checked_at: nowIso };
  const reasons: string[] = [];
  if (dns.missing.length) reasons.push(`${domain} 缺 ${dns.missing.join("、")}`);
  if (dns.unknown.length) reasons.push(`${domain} 的 ${dns.unknown.join("、")} 今天查不到（DNS 沒回應），沿用上次結果`);
  if (bounce.pause) reasons.push(`7 天退信率 ${pct(bounce.rate)}（${stats.hardBounced7}/${stats.sent7}）`);

  if (s.health_status === "paused" || s.health_status === "blocked") {
    return { patch, health: s.health_status, reasons, timeline: null, notify: null };
  }
  let health = "healthy";
  if (dns.pause || bounce.pause) health = "paused";
  else if (dns.status.missing_since) health = "warning";  // a gap, seen today or kept from the last answer
  patch.health_status = health;

  let timeline: string | null = null;
  let notify: string | null = null;
  if (health !== "healthy") {
    timeline = `${s.email}：${health === "paused" ? "已暫停" : "警告"}，${reasons.join("；")}`;
    if (health !== s.health_status) notify = `寄件信箱${health === "paused" ? "已暫停自動寄出" : "設定有缺"}：${s.email}\n${reasons.join("\n")}`;
  } else {
    const step = nextStage(s.warmup_stage, s.daily_limit, stats);
    if (step) {
      patch.warmup_stage = step;
      timeline = `${s.email}：暖機升到 ${step}（每日上限 ${stageCap(step, s.daily_limit)}）`;
    } else if (s.health_status === "warning") {
      timeline = `${s.email}：DNS 已補齊，恢復正常`;
    }
  }
  return { patch, health, reasons, timeline, notify };
}

/** The Connectors page "重新檢查並恢復": healthy only when DNS is complete and answered and bounces are under the line. */
export function recoveryVerdict(s: PoolSender, found: DnsFound, stats: SenderStats, today: string, nowIso: string):
  { healthy: boolean; reasons: string[]; patch: Record<string, unknown> } {
  const domain = s.email.split("@")[1] ?? "";
  const dns = judgeDns(s.dns_status, found, today, nowIso);
  const bounce = judgeBounce(stats.sent7, stats.hardBounced7);
  const reasons: string[] = [];
  if (s.health_status === "blocked") reasons.push("這個信箱被人工封鎖，不能自動恢復");
  if (dns.missing.length) reasons.push(`${domain} 缺 ${dns.missing.join("、")}`);
  if (dns.unknown.length) reasons.push(`${domain} 的 ${dns.unknown.join("、")} 查不到（DNS 沒回應），稍後再試`);
  if (bounce.pause) reasons.push(`7 天退信率 ${pct(bounce.rate)}（${stats.hardBounced7}/${stats.sent7}），要低於 ${pct(BOUNCE_PAUSE_RATE)}`);
  const healthy = reasons.length === 0;
  const patch: Record<string, unknown> = { dns_status: dns.status, dns_checked_at: nowIso };
  if (healthy) patch.health_status = "healthy";
  return { healthy, reasons, patch };
}

/** sent per Taipei day (newest first, empty days left out) and the 7-day sent / hard-bounced counts. */
export function statsFrom(events: Array<{ event_type: string; created_at: string }>, now: Date): SenderStats {
  const since7 = now.getTime() - 7 * 86_400_000;
  const perDay = new Map<string, number>();
  let sent7 = 0, hardBounced7 = 0;
  for (const e of events) {
    const at = new Date(e.created_at);
    if (e.event_type === "sent") {
      const day = taipeiDay(at);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      if (at.getTime() >= since7) sent7++;
    } else if (e.event_type === "hard_bounced" && at.getTime() >= since7) hardBounced7++;
  }
  const sendDays = [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, n]) => n);
  return { sent7, hardBounced7, sendDays };
}

export interface HealthStore {
  poolSenders(): Promise<PoolSender[]>;
  sender(id: string): Promise<PoolSender | null>;
  /** sent and hard_bounced events of one mailbox since the given time */
  events(senderId: string, sinceIso: string): Promise<Array<{ event_type: string; created_at: string }>>;
  updateSender(id: string, patch: Record<string, unknown>): Promise<void>;
  timeline(sender: PoolSender, title: string, metadata: Record<string, unknown>): Promise<void>;
  deleteClaimsBefore(iso: string): Promise<number>;
}

export interface HealthDeps {
  store: HealthStore;
  resolver: DnsResolver;
  notify: (text: string) => Promise<void>;
  now?: Date;
}

const EVENTS_DAYS = 21;  // enough Taipei weekdays to find 5 send days

async function statsOf(deps: HealthDeps, s: PoolSender, now: Date): Promise<SenderStats> {
  return statsFrom(await deps.store.events(s.id, new Date(now.getTime() - EVENTS_DAYS * 86_400_000).toISOString()), now);
}

export interface HealthRunResult {
  checked: number;
  claimsDeleted: number;
  senders: Array<{ id: string; email: string; health: string; reasons: string[]; stage: string }>;
  errors: Array<{ id: string; error: string }>;
}

/** The daily run. One mailbox failing (a DB error) is reported and the others still run. */
export async function runSenderHealth(deps: HealthDeps): Promise<HealthRunResult> {
  const now = deps.now ?? new Date();
  const today = taipeiDay(now);
  const out: HealthRunResult = { checked: 0, claimsDeleted: 0, senders: [], errors: [] };
  for (const s of await deps.store.poolSenders()) {
    try {
      const found = await checkDns(s.email.split("@")[1] ?? "", deps.resolver);
      const v = evaluateSender(s, found, await statsOf(deps, s, now), today, now.toISOString());
      await deps.store.updateSender(s.id, { ...v.patch, updated_at: now.toISOString() });
      if (v.timeline) await deps.store.timeline(s, v.timeline, { sender_account_id: s.id, health: v.health, reasons: v.reasons });
      if (v.notify) await deps.notify(v.notify);
      out.checked++;
      out.senders.push({ id: s.id, email: s.email, health: v.health, reasons: v.reasons, stage: String(v.patch.warmup_stage ?? s.warmup_stage) });
    } catch (e) {
      out.errors.push({ id: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  out.claimsDeleted = await deps.store.deleteClaimsBefore(new Date(now.getTime() - CLAIM_KEEP_DAYS * 86_400_000).toISOString());
  return out;
}

/** The recover button: rerun DNS and the bounce rate now; healthy only when both pass. */
export async function recheckSender(deps: HealthDeps, senderId: string): Promise<{ found: boolean; healthy: boolean; reasons: string[] }> {
  const now = deps.now ?? new Date();
  const s = await deps.store.sender(senderId);
  if (!s) return { found: false, healthy: false, reasons: [] };
  const found = await checkDns(s.email.split("@")[1] ?? "", deps.resolver);
  const v = recoveryVerdict(s, found, await statsOf(deps, s, now), taipeiDay(now), now.toISOString());
  await deps.store.updateSender(s.id, { ...v.patch, updated_at: now.toISOString() });
  if (v.healthy && s.health_status !== "healthy") {
    await deps.store.timeline(s, `${s.email}：重新檢查通過，恢復自動寄出`, { sender_account_id: s.id, health: "healthy" });
  }
  return { found: true, healthy: v.healthy, reasons: v.reasons };
}

const SENDER_COLS = "id, organization_id, email, daily_limit, warmup_stage, health_status, dns_status";

export function supabaseHealthStore(db: SupabaseClient): HealthStore {
  const fail = (what: string, error: { message: string } | null): void => { if (error) throw new Error(`${what}: ${error.message}`); };
  return {
    async poolSenders() {
      const { data, error } = await db.from("co_sender_accounts").select(SENDER_COLS)
        .eq("stream_type", "cold").eq("send_mode", "auto").eq("is_active", true).order("created_at").limit(500);
      fail("pool senders read failed", error);
      return (data ?? []) as PoolSender[];
    },
    async sender(id) {
      const { data, error } = await db.from("co_sender_accounts").select(SENDER_COLS).eq("id", id).maybeSingle();
      fail("sender read failed", error);
      return (data as PoolSender | null) ?? null;
    },
    async events(senderId, sinceIso) {
      // A pool mailbox sends at most 50 a day: 21 days stay far under one page.
      const { data, error } = await db.from("co_sending_events").select("event_type, created_at")
        .eq("sender_account_id", senderId).in("event_type", ["sent", "hard_bounced"]).gte("created_at", sinceIso).limit(5000);
      fail("sending events read failed", error);
      return (data ?? []) as Array<{ event_type: string; created_at: string }>;
    },
    async updateSender(id, patch) {
      const { error } = await db.from("co_sender_accounts").update(patch).eq("id", id);
      fail("sender update failed", error);
    },
    async timeline(sender, title, metadata) {
      const { error } = await db.from("co_timeline_events")
        .insert({ organization_id: sender.organization_id, lead_id: null, event_type: "sender_health", title, metadata });
      fail("timeline insert failed", error);
    },
    async deleteClaimsBefore(iso) {
      const { data, error } = await db.from("co_send_claims").delete().lt("claimed_at", iso).select("id");
      fail("claims cleanup failed", error);
      return (data ?? []).length;
    },
  };
}
