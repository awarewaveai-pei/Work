// /deploy_status — read-only deploy visibility for travel ops (low risk).
// Reads the deploy events that auto-deploy-next-admin.sh already POSTs to
// /api/webhooks/deploy (source='deploy' rows in ops_incidents, tags carry
// deployed_commit / origin_commit / behind / run_at). No filesystem / git /
// SSH access; server runs inside container without repo — same constraint
// as /status. Deploy TRIGGER stays exclusively on GitHub workflow_dispatch
// (.github/workflows/sg-deploy.yml); Telegram is hard-blocked from high-risk
// commands by policyEngine and this handler must never gain write paths.

import type { CommandHandler } from "../commandRouter";

interface DeployTags {
  app?: string;
  deployed_commit?: string;
  origin_commit?: string;
  behind?: number;
  run_at?: string;
}

export const deployStatusHandler: CommandHandler = async (_request, { supabase }) => {
  // Intentionally NOT scoped to organization_id: deploy events are global SG
  // infra signals (webhooks/deploy writes no org). Do not add an org filter.
  // title/app are interpolated raw into Markdown — same posture as /status;
  // telegramSender retries as plain text on Markdown 400, which is the
  // project-standard mitigation.
  const { data, error } = await supabase
    .from("ops_incidents")
    .select("title, message, severity, status, last_seen_at, tags")
    .eq("source", "deploy")
    .order("last_seen_at", { ascending: false })
    .limit(12);

  if (error) {
    return { text: `*Deploy Status*\n_query failed:_ \`${error.message}\``, error: error.message };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      text: [
        "*Deploy Status*",
        "_no deploy events recorded yet_",
        "",
        "事件來源：SG `auto-deploy-next-admin.sh` → `/api/webhooks/deploy`。",
        "若長期空白，檢查 SG cron 與 `OPS_INBOX_INGEST_TOKEN`。",
      ].join("\n"),
      summary: { events: 0 },
    };
  }

  // Latest event per app (rows are already newest-first).
  const latestByApp = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const tags = (row.tags ?? {}) as DeployTags;
    const app = tags.app ?? "unknown";
    if (!latestByApp.has(app)) latestByApp.set(app, row);
  }

  const lines = ["*Deploy Status (SG)*", ""];
  let maxBehind = 0;
  for (const [app, row] of latestByApp) {
    const tags = (row.tags ?? {}) as DeployTags;
    const rawBehind = Number(tags.behind ?? 0);
    const behind = Number.isFinite(rawBehind) ? rawBehind : 0;
    if (behind > maxBehind) maxBehind = behind;
    const deployed = String(tags.deployed_commit ?? "?").substring(0, 8);
    const icon = row.severity === "high" ? "🔴" : behind > 0 ? "🟡" : "🟢";
    lines.push(
      `${icon} *${app}* — ${row.title}`,
      `   commit \`${deployed}\` · behind ${behind} · ${formatTime(tags.run_at ?? row.last_seen_at)}`,
    );
  }

  lines.push(
    "",
    maxBehind > 0
      ? `⚠️ drift：落後 ${maxBehind} commit(s)。部署：GitHub app → Actions → *SG Deploy* → Run workflow。`
      : "✅ 與 origin/main 對齊。",
  );

  return {
    text: lines.join("\n"),
    summary: { events: rows.length, apps: latestByApp.size, max_behind: maxBehind },
  };
};

function formatTime(iso: string | null): string {
  if (!iso) return "?";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}
