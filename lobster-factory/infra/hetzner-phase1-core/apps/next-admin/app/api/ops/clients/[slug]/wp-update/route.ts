// POST /api/ops/clients/:slug/wp-update
// SSE-streaming endpoint that connects to the client's server via SSH (ssh2 pure-JS),
// runs WP-CLI plugin updates wave-by-wave, health-checks between each plugin,
// and writes the final result to organizations.metadata.wp_update_latest in Supabase.
//
// Wave strategy:
//   wave1 — high risk: update one-by-one; stop immediately on first failure or unhealthy response
//   wave2 — medium risk: update one-by-one; log failures but continue
//   wave3 — low risk: batch update all at once; health check at the end
//
// SSH key: stored as base64 in env var SSH_KEY_<cfg.ssh_key_name>.
// Auth: same dual-path as wp-report — Clerk role (operator+) OR X-Ops-Sync-Key header.
//
// Phase 2c — 2026-05-08

import { NextRequest } from "next/server";
import { Client as SshClient } from "ssh2";
import { resolveOpsRole, canSyncWpReport } from "../../../../../../lib/ops-role";
import {
  getSupabaseServerClient,
  getSupabaseWriteClient,
} from "../../../../../../lib/supabase-server";
import { timingSafeEqual } from "../../../../../../lib/ops-inbox/verifyIngestToken";
import type { ClientConfig } from "../../../../../../app/api/ops/clients/route";

export const dynamic = "force-dynamic";

const WP_PATH_RE = /^[A-Za-z0-9_/\-.]+$/;
const PLUGIN_SLUG_RE = /^[a-z0-9-]+$/;
export const maxDuration = 300;

// ── Auth ──────────────────────────────────────────────────────────────────────

const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

function isAuthorized(request: NextRequest): boolean {
  const { role } = resolveOpsRole(request);
  if (canSyncWpReport(role)) return true;
  const syncKey = request.headers.get("x-ops-sync-key") ?? "";
  return !!(SYNC_KEY && timingSafeEqual(syncKey, SYNC_KEY));
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

function connectSsh(opts: {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    conn.connect(opts);
  });
}

function sshExec(
  conn: SshClient,
  command: string,
  onLine: (line: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => {
        const s = data.toString();
        stdout += s;
        s.split("\n").filter(Boolean).forEach(onLine);
      });
      stream.stderr.on("data", (data: Buffer) => {
        const s = data.toString();
        stderr += s;
        s.split("\n")
          .filter(Boolean)
          .forEach((l) => onLine(`[stderr] ${l}`));
      });
      stream.on("close", (code: number) => resolve({ code, stdout, stderr }));
    });
  });
}

// ── ops_action_runs audit trail (2026-07-03) ─────────────────────────────────
// Every wave run is recorded so /ops/clients/[slug] 維護 tab「最近工作流程執行」
// shows maintenance history. Recording is fail-open: any failure here must
// never block the actual plugin updates.

const WP_UPDATE_ACTION_KEY = "ops.maintenance.wp-plugin-update";

async function beginActionRun(opts: {
  organizationId: string;
  clientSlug: string;
  actorRole: "owner" | "admin" | "operator" | "viewer";
  wave: string;
  plugins: string[];
}): Promise<string | null> {
  try {
    const supabaseWrite = getSupabaseWriteClient();
    if (!supabaseWrite) {
      // Without the service-role key no run is recorded and the 維護 tab history
      // silently goes empty — make the misconfiguration observable.
      console.warn("[wp-update] SUPABASE_SERVICE_ROLE_KEY missing — audit run not recorded");
      return null;
    }

    let { data: action } = await supabaseWrite
      .from("ops_action_catalog")
      .select("id")
      .eq("action_key", WP_UPDATE_ACTION_KEY)
      .maybeSingle();

    if (!action?.id) {
      // Self-seed — same values as migrations/0057_seed_wp_maintenance_action.sql
      // (keep in sync). Covers deploys where the migration hasn't been applied yet.
      const { data: seeded } = await supabaseWrite
        .from("ops_action_catalog")
        .upsert(
          {
            action_key: WP_UPDATE_ACTION_KEY,
            display_name: "WP plugin update (maintenance)",
            risk_level: "medium",
            environment_scope: "staging_and_production",
            enabled: true,
            metadata: { requires_approval: false, source: "wp-update-route-self-seed" },
          },
          { onConflict: "action_key" },
        )
        .select("id")
        .maybeSingle();
      action = seeded ?? null;
    }
    if (!action?.id) return null;

    const runId = crypto.randomUUID();
    const { error } = await supabaseWrite.from("ops_action_runs").insert({
      id: runId,
      action_id: action.id,
      organization_id: opts.organizationId,
      actor_role: opts.actorRole,
      status: "running",
      trace_id: `wp-update-${runId}`,
      input_payload: { wave: opts.wave, plugins: opts.plugins },
      metadata: {
        action_key: WP_UPDATE_ACTION_KEY,
        client_slug: opts.clientSlug,
        source: "web_ui",
      },
    });
    if (error) {
      console.warn("[wp-update] ops_action_runs insert failed (fail-open):", error.message);
      return null;
    }
    return runId;
  } catch (e) {
    console.warn("[wp-update] beginActionRun failed (fail-open):", e);
    return null;
  }
}

async function finishActionRun(
  runId: string | null,
  ok: boolean,
  output: Record<string, unknown>,
  errorSummary?: string,
): Promise<void> {
  if (!runId) return;
  try {
    const supabaseWrite = getSupabaseWriteClient();
    if (!supabaseWrite) return;
    await supabaseWrite
      .from("ops_action_runs")
      .update({
        status: ok ? "completed" : "failed",
        output_payload: output,
        error_summary: errorSummary ?? null,
        ended_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (e) {
    console.warn("[wp-update] finishActionRun failed (fail-open):", e);
  }
}

// ── Health probe ──────────────────────────────────────────────────────────────

async function checkHealth(url: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: resp.ok || resp.status < 400, status: resp.status };
  } catch {
    return { ok: false, status: null };
  }
}

// ── Plugin version query ───────────────────────────────────────────────────────

async function getPluginVersion(
  conn: SshClient,
  plugin: string,
  wpPath: string,
): Promise<string> {
  try {
    const { stdout } = await sshExec(
      conn,
      `wp plugin get ${plugin} --path="${wpPath}" --field=version --allow-root 2>/dev/null`,
      () => {},
    );
    return stdout.trim() || "?";
  } catch {
    return "?";
  }
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isAuthorized(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { slug } = await params;

  let body: { wave?: string };
  try {
    body = (await request.json()) as { wave?: string };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const wave = body.wave;
  if (wave !== "wave1" && wave !== "wave2" && wave !== "wave3") {
    return new Response("wave must be wave1 | wave2 | wave3", { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return new Response("Supabase not configured", { status: 503 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id,slug,name,metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    return new Response("Org not found", { status: 404 });
  }

  const meta = (org.metadata as Record<string, unknown>) ?? {};
  const cfg = (meta.client_config as ClientConfig) ?? {};

  if (!cfg.ssh_host || !cfg.ssh_user || !cfg.ssh_key_name || !cfg.wp_path) {
    return new Response(
      "SSH not configured — set ssh_host, ssh_user, ssh_key_name, wp_path in client_config",
      { status: 400 },
    );
  }

  const envKeyName = `SSH_KEY_${cfg.ssh_key_name.toUpperCase().replace(/-/g, "_")}`;
  const sshKeyB64 = process.env[envKeyName];
  if (!sshKeyB64) {
    return new Response(
      `SSH key env var ${envKeyName} not set on server`,
      { status: 500 },
    );
  }
  const privateKey = Buffer.from(sshKeyB64, "base64").toString("utf-8");
  const plugins: string[] = cfg.waves?.[wave] ?? [];

  if (!WP_PATH_RE.test(cfg.wp_path!)) {
    return new Response("Invalid wp_path in client_config", { status: 400 });
  }
  if (plugins.some((p) => !PLUGIN_SLUG_RE.test(p))) {
    return new Response("Invalid plugin slug in client_config waves", { status: 400 });
  }

  // Audit actor: Clerk role when it authorized the call, otherwise the
  // machine sync-key path acted — record as operator.
  const { role: resolvedRole } = resolveOpsRole(request);
  const actorRole = canSyncWpReport(resolvedRole) ? resolvedRole : "operator";

  // ── SSE stream ───────────────────────────────────────────────────────────

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      const log = (message: string) => send({ type: "log", message });

      let conn: SshClient | null = null;
      let auditRunId: string | null = null;

      try {
        // ── Validate plugin list ────────────────────────────────────────
        if (plugins.length === 0) {
          log(
            `⚠️ ${wave} 尚無指派外掛 — 請在 Supabase client_config.waves.${wave} 新增外掛名稱`,
          );
          send({ type: "done", result: { updated_count: 0, failed_count: 0, ok: true, wave } });
          controller.close();
          return;
        }

        log(`🚀 開始 ${wave} 更新，共 ${plugins.length} 個外掛`);
        log(`   外掛清單：${plugins.join(", ")}`);

        auditRunId = await beginActionRun({
          organizationId: org.id,
          clientSlug: org.slug,
          actorRole,
          wave,
          plugins,
        });

        // ── Connect SSH ─────────────────────────────────────────────────
        log(`🔗 正在連接 SSH ${cfg.ssh_host}:${cfg.ssh_port ?? 22}...`);
        conn = await connectSsh({
          host: cfg.ssh_host!,
          port: cfg.ssh_port ?? 22,
          username: cfg.ssh_user!,
          privateKey,
        });
        log(`✅ SSH 連接成功`);

        // ── Wave 3: batch update ────────────────────────────────────────
        if (wave === "wave3") {
          log(`📦 批次更新 ${plugins.length} 個外掛...`);

          const batchResult = await sshExec(
            conn,
            `wp plugin update ${plugins.join(" ")} --path="${cfg.wp_path}" --allow-root 2>&1`,
            (line) => log(`  ${line}`),
          );

          const batchOk = batchResult.code === 0;
          log(batchOk ? "✅ 批次更新完成" : `❌ 批次更新失敗（exit ${batchResult.code}）`);

          // Health check — folds into the recorded outcome: a CLI-successful
          // update that leaves the site down must not be recorded as ok.
          let siteHealthy: boolean | null = null;
          if (cfg.site_url) {
            log("🏥 健康檢查...");
            const h = await checkHealth(cfg.site_url);
            siteHealthy = h.ok;
            log(`   HTTP ${h.status ?? "timeout"} — ${h.ok ? "✅ 正常" : "❌ 異常"}`);
          }

          const wave3Ok = batchOk && siteHealthy !== false;
          const result = {
            wave,
            ran_at: new Date().toISOString(),
            ok: wave3Ok,
            updated_count: batchOk ? plugins.length : 0,
            failed_count: batchOk ? 0 : plugins.length,
            site_healthy: siteHealthy,
            client: org.slug,
            plugins_group: wave,
            results: plugins.map((p) => ({
              plugin: p,
              from: "?",
              to: "?",
              status: batchOk ? "updated" : "failed",
            })),
          };

          await writeFinalResult(org.id, org.slug, meta, result, supabase);
          await finishActionRun(auditRunId, wave3Ok, result);
          send({ type: "done", result });
          conn.end();
          controller.close();
          return;
        }

        // ── Wave 1 / Wave 2: one-by-one ─────────────────────────────────
        const results: Array<{
          plugin: string;
          from: string;
          to: string;
          status: "updated" | "failed";
        }> = [];
        let stopped = false;
        let lastHealthOk: boolean | null = null;

        for (const plugin of plugins) {
          if (stopped) break;

          log(`\n🔄 [${results.length + 1}/${plugins.length}] 更新外掛：${plugin}`);

          const fromVersion = await getPluginVersion(conn, plugin, cfg.wp_path!);

          const { code } = await sshExec(
            conn,
            `wp plugin update ${plugin} --path="${cfg.wp_path}" --allow-root 2>&1`,
            (line) => log(`  ${line}`),
          );

          if (code !== 0) {
            results.push({ plugin, from: fromVersion, to: fromVersion, status: "failed" });
            log(`❌ ${plugin} 更新失敗（exit ${code}）`);
            if (wave === "wave1") {
              log("⛔ Wave1 高風險模式：遇到失敗，停止後續更新");
              stopped = true;
              break;
            }
          } else {
            const toVersion = await getPluginVersion(conn, plugin, cfg.wp_path!);
            results.push({ plugin, from: fromVersion, to: toVersion, status: "updated" });
            log(`✅ ${plugin} 已更新 ${fromVersion} → ${toVersion}`);
          }

          // Health check after each plugin
          if (cfg.site_url) {
            log("🏥 健康檢查...");
            const h = await checkHealth(cfg.site_url);
            lastHealthOk = h.ok;
            log(`   HTTP ${h.status ?? "timeout"} — ${h.ok ? "✅ 正常" : "❌ 異常"}`);
            if (!h.ok && wave === "wave1") {
              log("🚨 Wave1：網站回應異常，停止更新");
              stopped = true;
              break;
            }
          }
        }

        const updatedCount = results.filter((r) => r.status === "updated").length;
        const failedCount = results.filter((r) => r.status === "failed").length;
        // A health-triggered abort (stopped with zero failed commands) is NOT ok —
        // the site went unhealthy mid-run and the audit trail must say so.
        const allOk = failedCount === 0 && !stopped;

        log(`\n📊 完成：已更新 ${updatedCount}，失敗 ${failedCount}${stopped ? "（中途停止）" : ""}`);

        const finalResult = {
          wave,
          ran_at: new Date().toISOString(),
          ok: allOk,
          updated_count: updatedCount,
          failed_count: failedCount,
          stopped,
          site_healthy: lastHealthOk,
          client: org.slug,
          plugins_group: wave,
          results,
        };

        await writeFinalResult(org.id, org.slug, meta, finalResult, supabase);
        await finishActionRun(auditRunId, allOk, finalResult);
        send({ type: "done", result: finalResult });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`🔴 錯誤：${msg}`);
        await finishActionRun(auditRunId, false, {}, msg);
        send({ type: "error", message: msg });
      } finally {
        try {
          conn?.end();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering for SSE
    },
  });
}

// ── Write final result to Supabase ────────────────────────────────────────────

async function writeFinalResult(
  orgId: string,
  slug: string,
  existingMeta: Record<string, unknown>,
  result: Record<string, unknown>,
  supabase: ReturnType<typeof getSupabaseServerClient>,
) {
  const supabaseWrite = getSupabaseWriteClient();
  if (!supabaseWrite || !supabase) return;

  const updatedMeta = {
    ...existingMeta,
    wp_update_latest: {
      ...result,
      synced_at: new Date().toISOString(),
      source: "web_ui",
    },
  };

  await supabaseWrite
    .from("organizations")
    .update({ metadata: updatedMeta })
    .eq("id", orgId);
}
