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

    const body = {
      text: `${sevEmoji} ${i.severity.toUpperCase()}${ruleLabel} · ${i.source} · ${i.title}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${here}${sevEmoji} *${i.severity.toUpperCase()}${ruleLabel}* · _${i.source}_ · *${i.service ?? "(host-level)"}* · ${i.environment}`,
          },
        },
        { type: "section", text: { type: "mrkdwn", text: `*${i.title}*\n${i.message ?? ""}` } },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `Occurrences: *${i.occurrence_count}* · fp:${fp}` },
            { type: "mrkdwn", text: `<${incidentUrl}|Open in Inbox>` },
          ],
        },
        ...repairActionBlocks(i),
      ],
    };

    try {
      const r = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
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
