import type { IncidentSeverity } from "../types";
import type { NotificationContext, NotificationResult, Notifier } from "./types";
import { canApprovePolicy, policyForIncident } from "@/lib/repair-center/policy";

const TELEGRAM_API = "https://api.telegram.org";
const MAX_LEN = 4000;

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * One Telegram delivery in the three states site-watch's notifier needs (invariant I2 in
 * packages/db/migrations/0091_site_watch.sql). sendMessage has no idempotency key, so anything that MAY have
 * reached Telegram counts as delivered:
 *   sent      — HTTP 2xx
 *   rejected  — HTTP 4xx: Telegram answered and refused; surely not delivered
 *   uncertain — HTTP 5xx, timeout/abort, network error
 */
export type TelegramDelivery =
  | { kind: "sent" }
  | { kind: "rejected"; code: string }
  | { kind: "uncertain"; code: string };

/** On the fetch itself — an outer Promise.race would not stop a late delivery. */
export const TELEGRAM_SEND_TIMEOUT_MS = 10_000;

/**
 * Many chats → one outcome. "rejected" only when NO chat could have received it; any sent/uncertain
 * chat next to a failure makes the whole send uncertain (a retry re-sends to all: at most one
 * duplicate, never a lost message).
 */
export function combineDeliveries(results: TelegramDelivery[]): TelegramDelivery {
  if (results.length === 0) return { kind: "rejected", code: "telegram_no_chats" };
  if (results.every((r) => r.kind === "sent")) return { kind: "sent" };
  const code = results.flatMap((r) => (r.kind === "sent" ? [] : [r.code])).join(";");
  return results.every((r) => r.kind === "rejected") ? { kind: "rejected", code } : { kind: "uncertain", code };
}

export class TelegramNotifier implements Notifier {
  constructor(
    public readonly id: string,
    private readonly botToken: string,
    private readonly chatIds: string,
    private readonly minSeverity: IncidentSeverity,
  ) {}

  /** Chats one send fans out to; each can take up to TELEGRAM_SEND_TIMEOUT_MS. */
  get chatCount(): number {
    return parseChatIds(this.chatIds).length;
  }

  meetsMinSeverity(severity: IncidentSeverity): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[this.minSeverity];
  }

  /** Pre-formatted text to every chat. Missing config = rejected: no request left this process. */
  async sendText(text: string): Promise<TelegramDelivery> {
    if (!this.botToken) return { kind: "rejected", code: "telegram_bot_token_missing" };
    const chats = parseChatIds(this.chatIds);
    if (!chats.length) return { kind: "rejected", code: "telegram_chat_ids_missing" };
    const results: TelegramDelivery[] = [];
    for (const chatId of chats) {
      const r = await sendTelegram(this.botToken, chatId, clip(text));
      results.push(r.kind === "sent" ? r : { ...r, code: `${chatId}:${r.code}` });
    }
    return combineDeliveries(results);
  }

  async send(ctx: NotificationContext): Promise<NotificationResult> {
    if (!this.botToken) return { status: "failed", error: "telegram_bot_token_missing" };

    const chats = parseChatIds(this.chatIds);
    if (!chats.length) return { status: "failed", error: "telegram_chat_ids_missing" };

    if (!this.meetsMinSeverity(ctx.incident.severity)) {
      return {
        status: "skipped",
        reason: `below_min_severity:${this.minSeverity}`,
      };
    }

    const result = await this.sendText(formatTelegramIncident(ctx));
    if (result.kind !== "sent") return { status: "failed", error: result.code };
    return { status: "sent", externalRef: `telegram:${chats.length}` };
  }
}

/**
 * The operator channel as configured for ops-inbox, or null when switched off
 * (OPS_INBOX_TELEGRAM_NOTIFY_ENABLED). One reader for the dispatcher and site-watch: same switch,
 * token, chats and minimum severity.
 */
export function buildOperatorTelegramNotifier(env: NodeJS.ProcessEnv = process.env): TelegramNotifier | null {
  const raw = env.OPS_INBOX_TELEGRAM_NOTIFY_ENABLED?.trim().toLowerCase();
  if (!(raw === "true" || raw === "1" || raw === "yes" || raw === "on")) return null;
  const chatIds = env.OPS_INBOX_TELEGRAM_CHAT_IDS?.trim() || env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || "";
  return new TelegramNotifier(
    "telegram:operator",
    env.TELEGRAM_BOT_TOKEN ?? "",
    chatIds,
    parseTelegramMinSeverity(env.OPS_INBOX_TELEGRAM_NOTIFY_MIN_SEVERITY),
  );
}

export function parseTelegramMinSeverity(raw: string | undefined): IncidentSeverity {
  const value = raw?.trim().toLowerCase();
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  return "medium";
}

function parseChatIds(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function formatTelegramIncident(ctx: NotificationContext): string {
  const i = ctx.incident;
  const fp = i.fingerprint.slice(0, 8);
  const incidentUrl = `${ctx.publicUrl}/ops/inbox/${i.id}`;
  const ruleLabel =
    ctx.rule === "severity_escalation"
      ? "ESCALATED"
      : ctx.rule === "reopen"
        ? "REOPENED"
        : ctx.rule === "critical_immediate"
          ? "CRITICAL"
          : ctx.rule === "duplicate_occurrence"
            ? "REPEAT"
            : "NEW";

  const SEV_CN: Record<string, string> = { critical: "🔴 緊急", high: "🟠 重要", medium: "🟡 注意", low: "🔵 提示" };
  const SOURCE_CN: Record<string, string> = {
    sentry: "應用程式錯誤 (Sentry)", uptime_kuma: "上線監測 (Uptime Kuma)",
    netdata: "系統資源 (Netdata)", grafana: "效能指標 (Grafana)", posthog: "使用者分析 (PostHog)",
  };
  const RULE_CN: Record<string, string> = {
    severity_escalation: "已升級 (ESCALATED)", reopen: "重新開啟 (REOPENED)",
    critical_immediate: "緊急警報 (CRITICAL)", duplicate_occurrence: "重複發生 (REPEAT)",
  };
  const sevLabel = SEV_CN[i.severity] ?? i.severity.toUpperCase();
  const srcLabel = SOURCE_CN[i.source] ?? i.source;
  const ruleLabelCN = RULE_CN[ctx.rule] ?? "新告警 (NEW)";

  // One-command approval (A3): production incidents whose source policy is
  // approvable can be pushed into the repair pipeline straight from the phone.
  // The command goes through the full command plane (allow-listed actors,
  // idempotency, kill-switch, policy) — this line is a shortcut, not a bypass.
  const approvable = i.environment === "production" && canApprovePolicy(policyForIncident(i.source, i.severity));

  const lines = [
    `${sevLabel}告警 — ${srcLabel}`,
    `狀態：${ruleLabelCN}`,
    i.title,
    i.message ?? "",
    `（技術資訊：severity=${i.severity} source=${i.source} rule=${ctx.rule} fp=${fp} count=${i.occurrence_count}）`,
    approvable ? `核准修復：/approve_repair ${i.id}` : "",
    incidentUrl,
  ].filter(Boolean);

  return lines.join("\n");
}

function clip(text: string): string {
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}\n\n...[truncated]` : text;
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<TelegramDelivery> {
  const body = new URLSearchParams({
    chat_id: chatId,
    text,
    disable_web_page_preview: "true",
  });

  try {
    const r = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TELEGRAM_SEND_TIMEOUT_MS),
    });
    if (r.ok) return { kind: "sent" };
    const code = `telegram_${r.status}`;
    return r.status >= 400 && r.status < 500 ? { kind: "rejected", code } : { kind: "uncertain", code };
  } catch (e: any) {
    return { kind: "uncertain", code: String(e?.message ?? e) };
  }
}
