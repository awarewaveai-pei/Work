// /status — quick system snapshot from existing tables only.
// No filesystem / git access; server runs inside container without repo.

import type { CommandHandler } from "../commandRouter";

export const statusHandler: CommandHandler = async (request, { supabase }) => {
  const orgId = request.organization_id;

  const [modeRes, recentRes, incidentRes, failedRes] = await Promise.all([
    supabase
      .from("system_modes")
      .select("mode, set_at, reason")
      .or(
        `and(scope_type.eq.client,scope_id.eq.${orgId}),and(scope_type.eq.global,scope_id.is.null)`,
      )
      .limit(2),
    supabase
      .from("command_requests")
      .select("command, status, source, received_at")
      .eq("organization_id", orgId)
      .order("received_at", { ascending: false })
      .limit(5),
    supabase
      .from("incidents")
      .select("title, severity, status, first_seen_at")
      .eq("organization_id", orgId)
      .in("status", ["open", "investigating"])
      .order("first_seen_at", { ascending: false })
      .limit(3),
    supabase
      .from("command_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "failed")
      .gte("received_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);

  const mode = (modeRes.data ?? []).find((r) => r.mode) ?? null;
  const recent = recentRes.data ?? [];
  const incidents = incidentRes.data ?? [];
  const failed24h = failedRes.count ?? 0;

  const lines = [
    "*System Status*",
    `mode: \`${mode?.mode ?? "unknown"}\`${mode?.reason ? ` (${mode.reason})` : ""}`,
    `failed commands (24h): ${failed24h}`,
    "",
    "*Recent commands*",
    recent.length === 0
      ? "_none_"
      : recent
          .map((r) => `• ${r.command} [${r.status}] · ${r.source} · ${formatTime(r.received_at)}`)
          .join("\n"),
    "",
    "*Open incidents*",
    incidents.length === 0
      ? "_none_"
      : incidents
          .map((i) => `• [${i.severity}] ${i.title} · ${formatTime(i.first_seen_at)}`)
          .join("\n"),
  ];

  return {
    text: lines.join("\n"),
    summary: { mode: mode?.mode ?? null, failed_24h: failed24h, recent: recent.length },
  };
};

function formatTime(iso: string | null): string {
  if (!iso) return "?";
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}
