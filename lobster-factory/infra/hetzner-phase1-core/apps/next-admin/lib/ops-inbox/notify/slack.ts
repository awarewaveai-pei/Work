import type { NotificationContext, NotificationResult, Notifier } from "./types";

export class SlackNotifier implements Notifier {
  constructor(
    public readonly id: string,
    private readonly webhookUrl: string,
  ) {}

  async send(ctx: NotificationContext): Promise<NotificationResult> {
    if (!this.webhookUrl) return { status: "failed", error: "webhook_url_missing" };

    const i = ctx.incident;
    const fp = i.fingerprint.slice(0, 8);
    const sevEmoji = i.severity === "critical" ? "🔴" : i.severity === "high" ? "🟠" : i.severity === "medium" ? "🟡" : "🔵";
    const incidentUrl = `${ctx.publicUrl}/ops/inbox/${i.id}`;
    const ruleLabel =
      ctx.rule === "severity_escalation"
        ? " · ESCALATED"
        : ctx.rule === "reopen"
          ? " · REOPENED"
          : ctx.rule === "critical_immediate"
            ? " · CRITICAL"
            : ctx.rule === "duplicate_occurrence"
              ? " · REPEAT"
              : "";
    const here = ctx.rule === "critical_immediate" ? "<!here> " : "";

    const SEV_CN: Record<string, string> = { critical: "緊急", high: "重要", medium: "注意", low: "提示" };
    const SOURCE_CN: Record<string, string> = {
      sentry: "應用程式錯誤", uptime_kuma: "上線監測", netdata: "系統資源",
      grafana: "效能指標", posthog: "使用者分析",
    };
    const RULE_CN: Record<string, string> = {
      severity_escalation: "已升級 (ESCALATED)", reopen: "重新開啟 (REOPENED)",
      critical_immediate: "緊急警報 (CRITICAL)", duplicate_occurrence: "重複發生 (REPEAT)",
    };
    const sevLabel = SEV_CN[i.severity] ?? i.severity;
    const srcLabel = SOURCE_CN[i.source] ?? i.source;
    const ruleLabelCN = RULE_CN[ctx.rule] ?? "新告警 (NEW)";

    const body = {
      text: `${sevEmoji} ${sevLabel}告警 — ${srcLabel}｜${ruleLabelCN}\n${i.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${here}${sevEmoji} *${sevLabel}告警* — ${srcLabel}｜${ruleLabelCN}`,
          },
        },
        { type: "section", text: { type: "mrkdwn", text: `*${i.title}*\n${i.message ?? ""}` } },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `發生次數：*${i.occurrence_count}*` },
            { type: "mrkdwn", text: `（技術資訊：severity=${i.severity} source=${i.source} rule=${ctx.rule} fp=${fp}）` },
            { type: "mrkdwn", text: `<${incidentUrl}|在 Ops Inbox 查看>` },
          ],
        },
        ...repairActionBlocks(i),
      ],
    };

    return this.post(body);
  }

  /** Pre-formatted text, same channel (the host-schedule alerts, lib/schedules/alerts.ts). */
  async sendText(text: string): Promise<NotificationResult> {
    if (!this.webhookUrl) return { status: "failed", error: "webhook_url_missing" };
    return this.post({ text });
  }

  private async post(body: unknown): Promise<NotificationResult> {
    try {
      const r = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return { status: "failed", error: `slack_${r.status}` };
      return { status: "sent" };
    } catch (e: any) {
      return { status: "failed", error: String(e?.message ?? e) };
    }
  }
}

function repairActionBlocks(i: NotificationContext["incident"]): any[] {
  if (i.status === "resolved" || i.status === "ignored") return [];
  const repairable = i.source === "sentry" || i.source === "uptime_kuma" || i.source === "grafana";
  const netdata = i.source === "netdata";
  if (!repairable && !netdata) return [];

  const label =
    i.source === "sentry"
      ? "Approve repair"
      : i.source === "uptime_kuma" || i.source === "grafana"
        ? "Approve analysis"
        : "Acknowledge";

  return [
    {
      type: "actions",
      elements: [
        ...(repairable
          ? [
              {
                type: "button",
                text: { type: "plain_text", text: label },
                style: "primary",
                action_id: "approve_repair",
                value: i.id,
              },
            ]
          : []),
        {
          type: "button",
          text: { type: "plain_text", text: netdata ? "Acknowledge" : "View only" },
          action_id: "acknowledge_only",
          value: i.id,
        },
      ],
    },
  ];
}
