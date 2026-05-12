import type { IncidentSeverity } from "../types";
import type { NotificationContext, NotificationResult, Notifier } from "./types";

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
    return { status: "sent", externalRef: chats.join(",") };
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

  const lines = [
    `[Ops Inbox] ${i.severity.toUpperCase()} ${ruleLabel}`,
    `${i.source} / ${i.service ?? "host-level"} / ${i.environment}`,
    i.title,
    i.message ?? "",
    `Occurrences: ${i.occurrence_count} / fp:${fp}`,
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
