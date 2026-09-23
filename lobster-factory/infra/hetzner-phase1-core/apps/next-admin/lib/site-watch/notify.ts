// C8 notification step: resume every owed alert/recovery from DB state (I2), one Telegram message per
// transition, three-state delivery. Runs inside the target's lease; every state write is fenced.
import type { IncidentSeverity } from "@/lib/ops-inbox/types";
import { TELEGRAM_SEND_TIMEOUT_MS, type TelegramDelivery } from "@/lib/ops-inbox/notify/telegram";
import { minLeaseForSend, severityFor } from "./config";
import { alertText, incidentDraft, recoveryText } from "./messages";
import type { NotifyOutcome, NotifyPhase, OrgRef, PageStateRow, SiteWatchStore } from "./store";

/** The part of TelegramNotifier this step uses (lib/ops-inbox/notify/telegram.ts). */
export interface TextNotifier {
  readonly chatCount: number;
  meetsMinSeverity(severity: IncidentSeverity): boolean;
  sendText(text: string): Promise<TelegramDelivery>;
}

export class LeaseLost extends Error {
  constructor() {
    super("site_watch_lease_lost");
  }
}

export interface NotifyContext {
  store: SiteWatchStore;
  /** null = operator Telegram switched off: owed messages are recorded as skipped, never sent. */
  notifier: TextNotifier | null;
  publicUrl: string;
  targetId: string;
  gen: number;
  windowS: number;
  org: OrgRef;
}

export interface NotifyStepResult {
  pageId: string;
  kind: string;
  phase: NotifyPhase;
  outcome: NotifyOutcome | "deferred" | "closed_by_operator" | "stale";
}

export function needsNotification(s: PageStateRow): boolean {
  return (s.recovery_state === "none" && (s.alert_state === "pending" || s.alert_state === "uncertain")) || s.recovery_state !== "none";
}

/**
 * One owed message. The state goes to 'uncertain' BEFORE the request leaves, so a crash mid-send is
 * retried as "may have been delivered" (I2); a send starts only while the lease outlives its timeouts.
 */
async function deliver(ctx: NotifyContext, s: PageStateRow, phase: NotifyPhase, text: string): Promise<NotifyStepResult["outcome"]> {
  const { store, notifier, targetId, gen } = ctx;
  if (!notifier || !notifier.meetsMinSeverity(severityFor(s.kind))) {
    if (!(await store.notifyBegin(targetId, gen, s, phase))) return "stale";
    await store.notifyFinish(targetId, gen, s, phase, "skipped");
    return "skipped";
  }
  const remaining = await store.renew(targetId, gen, ctx.windowS);
  if (remaining === null) throw new LeaseLost();
  if (remaining < minLeaseForSend(notifier.chatCount, TELEGRAM_SEND_TIMEOUT_MS)) return "deferred";
  if (!(await store.notifyBegin(targetId, gen, s, phase))) return "stale";
  const delivery = await notifier.sendText(text);
  // A fenced finish (lease lost after the send) leaves 'uncertain': the next owner re-sends at most once.
  await store.notifyFinish(targetId, gen, s, phase, delivery.kind);
  return delivery.kind;
}

export async function runNotifications(ctx: NotifyContext, states: PageStateRow[]): Promise<NotifyStepResult[]> {
  const out: NotifyStepResult[] = [];
  for (const s of states.filter(needsNotification)) {
    if (s.recovery_state === "none") {
      let st = s;
      if (!st.incident_id) {
        const incidentId = await ctx.store.upsertIncident(incidentDraft(ctx.org, st));
        if (!(await ctx.store.attachIncident(ctx.targetId, ctx.gen, st, incidentId))) {
          out.push({ pageId: s.page_id, kind: s.kind, phase: "alert", outcome: "stale" });
          continue;
        }
        st = { ...st, incident_id: incidentId };
      }
      const outcome = await deliver(ctx, st, "alert", alertText(ctx.org, st, ctx.publicUrl));
      out.push({ pageId: s.page_id, kind: s.kind, phase: "alert", outcome });
      continue;
    }

    let st = s;
    if (st.recovery_state === "pending_resolve") {
      const r = await ctx.store.resolveForRecovery(ctx.targetId, ctx.gen, st);
      if (r === "fenced") throw new LeaseLost();
      if (r !== "pending_send") {
        out.push({ pageId: s.page_id, kind: s.kind, phase: "recovery", outcome: r });
        continue;
      }
      st = { ...st, recovery_state: "pending_send" };
    }
    const outcome = await deliver(ctx, st, "recovery", recoveryText(ctx.org, st, ctx.publicUrl));
    out.push({ pageId: s.page_id, kind: s.kind, phase: "recovery", outcome });
  }
  return out;
}
