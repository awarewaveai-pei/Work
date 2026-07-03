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

export class TelegramNotifier implements Notifier {
  constructor(
    public readonly id: string,
    private readonly botToken: string,
    private readonly chatIds: string,
    private readonly minSeverity: IncidentSeverity,
  ) {}

  async send(ctx: NotificationContext): Promise<NotificationResult> {
    if (!this.botToken) return { status: "failed", error: "telegram_bot_token_missing" };

    const chats = parseChatIds(this.chatIds);
    if (!chats.length) return { status: "failed", error: "telegram_chat_ids_missing" };

    if (SEVERITY_RANK[ctx.incident.severity] < SEVERITY_RANK[this.minSeverity]) {
      return {
        status: "skipped",
        reason: `below_min_severity:${this.minSeverity}`,
      };
    }

    const text = formatTelegramIncident(ctx);
    const errors: string[] = [];

    for (const chatId of chats) {
      const result = await sendTelegram(this.botToken, chatId, text);
      if (result) errors.push(`${chatId}:${result}`);
    }

    if (errors.length) {
      return { status: "failed", error: errors.join(";") };
    }
    return { status: "sent", externalRef: `telegram:${chats.length}` };
  }
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

  const text = lines.join("\n");
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}\n\n...[truncated]` : text;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<string | null> {
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
    });
    if (!r.ok) return `telegram_${r.status}`;
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}
