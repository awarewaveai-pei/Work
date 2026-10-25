// /client_status [slug] — show health + WP plugin update status for clients with a site (or the ones matching slug).
// Low-risk: read-only, calls the same Supabase data that /ops/clients reads.
// Optional arg: client slug or name (partial match, searched on the server, at most STATUS_MATCH_LIMIT).
// No arg = the earliest STATUS_PROBE_LIMIT clients that have a site_url: every WordPress buyer is an organization, so
// probing them all would time out the command.
//
// Phase 2c — 2026-05-08

import type { CommandHandler } from "../commandRouter";
import type { ClientConfig, WpUpdateLatest } from "../../../app/api/ops/clients/route";
import { orgNameFilter, orgSearchTerm } from "../../org-search";

export const STATUS_PROBE_LIMIT = 30;
export const STATUS_MATCH_LIMIT = 10;

function relativeDay(isoStr: string | null | undefined): string {
  if (!isoStr) return "未執行";
  const days = Math.floor((Date.now() - new Date(isoStr).getTime()) / 86_400_000);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  return `${days}天前`;
}

function healthEmoji(ok: boolean | null | undefined): string {
  return ok ? "✅" : "❌";
}

export const clientStatusHandler: CommandHandler = async (request, { supabase }) => {
  // Optional: first word of args as slug filter
  const slugFilter = (request.args?.slug ?? request.args?._ ?? "").toString().trim().toLowerCase();

  const term = orgSearchTerm(slugFilter);
  let query = supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata", term ? undefined : { count: "exact" })
    .order("created_at", { ascending: true });
  query = term
    ? query.or(orgNameFilter(term)).limit(STATUS_MATCH_LIMIT)
    : query.not("metadata->client_config->>site_url", "is", null).limit(STATUS_PROBE_LIMIT);
  // a filter of only stripped characters matches nothing (never every client)
  const { data, error, count } = slugFilter && !term ? { data: [], error: null, count: 0 } : await query;

  if (error) {
    return {
      text: `❌ 無法讀取客戶資料：${error.message}`,
      summary: { error: error.message },
    };
  }

  const orgs = data ?? [];

  if (orgs.length === 0) {
    return {
      text: slugFilter
        ? `找不到 slug 包含「${slugFilter}」的客戶`
        : "沒有設定網站網址的客戶",
      summary: { count: 0 },
    };
  }

  // Health probe all in parallel (best-effort, 5s timeout)
  const healthResults = await Promise.all(
    orgs.map(async (org) => {
      const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
      if (!cfg.site_url) return { ok: null as boolean | null, statusCode: null, latencyMs: null };
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const resp = await fetch(cfg.site_url, { method: "HEAD", signal: ctrl.signal });
        clearTimeout(timer);
        return {
          ok: resp.ok || resp.status < 400,
          statusCode: resp.status,
          latencyMs: Date.now() - t0,
        };
      } catch {
        return { ok: false, statusCode: null, latencyMs: null };
      }
    }),
  );

  const upCount = healthResults.filter((h) => h.ok === true).length;

  // Build response
  const lines: string[] = [];

  if (orgs.length === 1 && slugFilter) {
    // ── Single-client detailed view ──────────────────────────────────────
    const org = orgs[0];
    const h = healthResults[0];
    const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
    const wp = ((org.metadata as Record<string, unknown>)?.wp_update_latest as WpUpdateLatest) ?? null;

    lines.push(`*${org.name}*`);
    lines.push(`slug: \`${org.slug}\` · ${org.type} · ${org.status}`);
    lines.push(`platform: ${cfg.platform ?? "—"} / ${cfg.hosting_type ?? "—"}`);
    lines.push(`url: ${cfg.site_url ?? "—"}`);
    lines.push(
      `health: ${h.ok === null ? "no URL" : h.ok ? `✅ HTTP ${h.statusCode} (${h.latencyMs}ms)` : `❌ DOWN${h.statusCode ? ` HTTP ${h.statusCode}` : ""}`}`,
    );

    if (cfg.platform === "wordpress") {
      lines.push("");
      lines.push("*WP 外掛更新*");
      if (!wp) {
        lines.push("尚無更新記錄");
      } else {
        lines.push(`最後執行：${relativeDay(wp.ran_at)} (${wp.ran_at?.slice(0, 10) ?? "?"})`);
        lines.push(`已更新：${wp.updated_count ?? 0}　失敗：${wp.failed_count ?? 0}　需授權：${wp.results?.filter((r) => r.status === "skipped_license").length ?? 0}`);
        lines.push(`健康：${wp.health_final ?? "?"} · Wave：${wp.plugins_group ?? "?"}`);
        if (wp.results && wp.results.length > 0) {
          lines.push("");
          lines.push("最後一批更新：");
          wp.results.slice(0, 8).forEach((r) => {
            const icon = r.status === "updated" ? "✅" : r.status === "failed" ? "❌" : "🔑";
            lines.push(`  ${icon} ${r.plugin} ${r.from} → ${r.to}`);
          });
          if (wp.results.length > 8) lines.push(`  …共 ${wp.results.length} 個`);
        }
      }

      // Wave assignments
      if (cfg.waves) {
        lines.push("");
        lines.push("*Wave 分配*");
        lines.push(`wave1 (高風險): ${cfg.waves.wave1?.join(", ") || "未設定"}`);
        lines.push(`wave2 (中風險): ${cfg.waves.wave2?.join(", ") || "未設定"}`);
        lines.push(`wave3 (低風險): ${cfg.waves.wave3?.join(", ") || "未設定"}`);
      }
    }

    lines.push("");
    lines.push(`🔗 https://app.aware-wave.com/ops/clients/${org.slug}`);
  } else {
    // ── Multi-client summary view ─────────────────────────────────────────
    lines.push(`*客戶狀態 (${upCount}/${orgs.length} 上線)*`);
    lines.push("");

    orgs.forEach((org, i) => {
      const h = healthResults[i];
      const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
      const wp = ((org.metadata as Record<string, unknown>)?.wp_update_latest as WpUpdateLatest) ?? null;

      const healthStr =
        h.ok === null
          ? "no URL"
          : h.ok
            ? `✅ HTTP ${h.statusCode}`
            : `❌ DOWN`;

      lines.push(`*${org.name}*  ${healthStr}`);
      lines.push(`  \`${org.slug}\` · ${cfg.platform ?? org.type} · ${cfg.hosting_type ?? org.status}`);

      if (cfg.platform === "wordpress") {
        if (wp) {
          const pendingLicense = wp.results?.filter((r) => r.status === "skipped_license").length ?? 0;
          const wpLine = [
            `  WP: ${healthEmoji(wp.ok)} ${wp.updated_count ?? 0} 已更新`,
            wp.failed_count ? `${wp.failed_count} 失敗` : null,
            pendingLicense ? `${pendingLicense} 需授權` : null,
            `· ${relativeDay(wp.ran_at)}`,
          ]
            .filter(Boolean)
            .join("  ");
          lines.push(wpLine);
        } else {
          lines.push("  WP: 尚無更新記錄");
        }
      }

      lines.push("");
    });

    if (!slugFilter && (count ?? 0) > orgs.length) {
      lines.push(`共 ${count} 個有網站的客戶，這裡只探測最早的 ${orgs.length} 個；其他請用 /client_status <slug>。`);
    } else if (slugFilter && orgs.length >= STATUS_MATCH_LIMIT) {
      lines.push(`只列前 ${STATUS_MATCH_LIMIT} 個符合的，請打得更完整。`);
    }
    lines.push(`🔗 https://app.aware-wave.com/ops/clients`);
  }

  return {
    text: lines.join("\n"),
    summary: {
      total: orgs.length,
      clientsWithSite: slugFilter ? null : count ?? orgs.length,
      healthy: upCount,
      filter: slugFilter || null,
    },
  };
};
