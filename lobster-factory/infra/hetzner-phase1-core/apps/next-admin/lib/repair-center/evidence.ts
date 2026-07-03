// Evidence engine (Auto-Repair A1, 2026-07-03).
//
// When an incident arrives, gather the context a human would look up before
// judging it: what else fired around the same time, has this fingerprint
// happened before, what was deployed recently, what did previous repair runs
// do, and what does the host actually look like right now.
//
// Design contract (B-orchestrator foundation):
//   - Read-only. Evidence collection NEVER mutates any system.
//   - Every section fails open in isolation — one broken collector must not
//     lose the others, and a fully broken bundle must not block ingest.
//   - Output is a plain-text bundle: consumed today by the AI classifier
//     prompt and the incident timeline; consumed tomorrow by a diagnosis
//     agent. Keep it model/UI-agnostic.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident } from "@/lib/ops-inbox/types";
import { readSshTarget, sshExecOnce } from "./ssh";

export interface EvidenceSection {
  key: "neighbors" | "fingerprint_history" | "recent_deploys" | "repair_history" | "host_probe";
  title: string;
  ok: boolean;
  summary: string;
}

export interface EvidenceBundle {
  collected_at: string;
  sections: EvidenceSection[];
}

/** Same-storm window: incidents seen within ±15 min are candidate siblings. */
export const NEIGHBOR_WINDOW_MS = 15 * 60_000;
const DEPLOY_LOOKBACK_MS = 48 * 3_600_000;
const SECTION_CHAR_CAP = 1_500;
const BUNDLE_CHAR_CAP = 6_000;
const HOST_PROBE_TIMEOUT_MS = 10_000;

// Read-only host snapshot. Fixed command — nothing from the incident is ever
// interpolated into the shell line (injection surface stays zero).
const HOST_PROBE_COMMAND =
  "docker ps -a --format '{{.Names}}|{{.Status}}' | head -30; echo ---; df -h / | tail -1; echo ---; free -m | head -2; echo ---; uptime";

export function neighborWindow(
  lastSeenAt: string,
  windowMs: number = NEIGHBOR_WINDOW_MS,
): { from: string; to: string } {
  const center = new Date(lastSeenAt).getTime();
  const safe = Number.isFinite(center) ? center : Date.now();
  return {
    from: new Date(safe - windowMs).toISOString(),
    to: new Date(safe + windowMs).toISOString(),
  };
}

function cap(text: string, limit: number = SECTION_CHAR_CAP): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…（截斷）`;
}

function section(
  key: EvidenceSection["key"],
  title: string,
  ok: boolean,
  summary: string,
): EvidenceSection {
  return { key, title, ok, summary: cap(summary) };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function collectNeighbors(supabase: SupabaseClient, incident: Incident): Promise<EvidenceSection> {
  const title = "同時間窗告警（±15 分鐘）";
  try {
    const { from, to } = neighborWindow(incident.last_seen_at);
    const { data, error } = await supabase
      .from("ops_incidents")
      .select("source,severity,title,service,client_slug,last_seen_at,status")
      .gte("last_seen_at", from)
      .lte("last_seen_at", to)
      .neq("id", incident.id)
      .order("last_seen_at", { ascending: false })
      .limit(10);
    if (error) return section("neighbors", title, false, `查詢失敗：${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return section("neighbors", title, true, "無其他告警 — 孤立事件。");
    const lines = rows.map(
      (r) =>
        `- [${r.source}/${r.severity}/${r.status}] ${r.title}` +
        `${r.service ? `（${r.service}）` : ""}${r.client_slug ? ` client=${r.client_slug}` : ""}`,
    );
    return section("neighbors", title, true, lines.join("\n"));
  } catch (e) {
    return section("neighbors", title, false, `收集失敗：${errText(e)}`);
  }
}

async function collectFingerprintHistory(supabase: SupabaseClient, incident: Incident): Promise<EvidenceSection> {
  const title = "同指紋歷史";
  try {
    const { data, error } = await supabase
      .from("ops_incidents")
      .select("status,resolved_at,notes,occurrence_count,last_seen_at")
      .eq("fingerprint", incident.fingerprint)
      .neq("id", incident.id)
      .order("last_seen_at", { ascending: false })
      .limit(3);
    if (error) return section("fingerprint_history", title, false, `查詢失敗：${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const head = `本事件：第 ${incident.occurrence_count} 次發生，重開 ${incident.reopen_count} 次。`;
    if (rows.length === 0) return section("fingerprint_history", title, true, `${head} 無更早的同指紋事件。`);
    const lines = rows.map(
      (r) =>
        `- ${String(r.last_seen_at).slice(0, 16)} 狀態=${r.status} 發生=${r.occurrence_count} 次` +
        `${r.notes ? ` 備註=${String(r.notes).slice(0, 120)}` : ""}`,
    );
    return section("fingerprint_history", title, true, `${head}\n${lines.join("\n")}`);
  } catch (e) {
    return section("fingerprint_history", title, false, `收集失敗：${errText(e)}`);
  }
}

async function collectRecentDeploys(supabase: SupabaseClient, incident: Incident): Promise<EvidenceSection> {
  const title = "最近部署（48 小時內）";
  try {
    const since = new Date(Date.now() - DEPLOY_LOOKBACK_MS).toISOString();
    const { data, error } = await supabase
      .from("ops_incidents")
      .select("title,service,last_seen_at")
      .eq("source", "deploy")
      .gte("last_seen_at", since)
      .neq("id", incident.id)
      .order("last_seen_at", { ascending: false })
      .limit(3);
    if (error) return section("recent_deploys", title, false, `查詢失敗：${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return section("recent_deploys", title, true, "48 小時內無部署事件 — 可先排除部署迴歸。");
    const lines = rows.map((r) => `- ${String(r.last_seen_at).slice(0, 16)} ${r.title}${r.service ? `（${r.service}）` : ""}`);
    return section("recent_deploys", title, true, lines.join("\n"));
  } catch (e) {
    return section("recent_deploys", title, false, `收集失敗：${errText(e)}`);
  }
}

async function collectRepairHistory(supabase: SupabaseClient, incident: Incident): Promise<EvidenceSection> {
  const title = "過往修復紀錄（同指紋）";
  try {
    const { data, error } = await supabase
      .from("repair_runs")
      .select("state,policy,github_pr_url,deploy_status,created_at")
      .contains("metadata", { incident_fingerprint: incident.fingerprint })
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) return section("repair_history", title, false, `查詢失敗：${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return section("repair_history", title, true, "此指紋沒有修復流程紀錄。");
    const lines = rows.map(
      (r) =>
        `- ${String(r.created_at).slice(0, 16)} state=${r.state} policy=${r.policy} deploy=${r.deploy_status}` +
        `${r.github_pr_url ? ` PR=${r.github_pr_url}` : ""}`,
    );
    return section("repair_history", title, true, lines.join("\n"));
  } catch (e) {
    return section("repair_history", title, false, `收集失敗：${errText(e)}`);
  }
}

/**
 * Live host snapshot over SSH. Platform incidents (deploy/netdata — the SG/EU
 * stack itself) probe the SG host via AUTO_REPAIR_SG_SSH_*. Client-scoped
 * incidents are skipped for now: client SSH uses per-org client_config and a
 * probe there belongs to the remediation layer where prechecks gate it.
 * Not configured / timeout → honest "skipped" section, never a hang.
 */
async function collectHostProbe(incident: Incident): Promise<EvidenceSection> {
  const title = "主機即時狀態（SG）";
  try {
    if (incident.client_slug) {
      return section("host_probe", title, true, "客戶站事件 — 略過平台主機探測。");
    }
    const target = readSshTarget("SG");
    if (!target) {
      return section("host_probe", title, false, "未設定 AUTO_REPAIR_SG_SSH_*，略過。");
    }
    const result = await sshExecOnce(target, HOST_PROBE_COMMAND, HOST_PROBE_TIMEOUT_MS);
    if (result.code !== 0) {
      return section("host_probe", title, false, `探測指令 exit=${result.code}：${result.stderr.slice(0, 300)}`);
    }
    return section("host_probe", title, true, result.stdout);
  } catch (e) {
    return section("host_probe", title, false, `探測失敗：${errText(e)}`);
  }
}

/** Collect everything in parallel. Never throws. */
export async function collectEvidence(supabase: SupabaseClient, incident: Incident): Promise<EvidenceBundle> {
  const sections = await Promise.all([
    collectNeighbors(supabase, incident),
    collectFingerprintHistory(supabase, incident),
    collectRecentDeploys(supabase, incident),
    collectRepairHistory(supabase, incident),
    collectHostProbe(incident),
  ]);
  return { collected_at: new Date().toISOString(), sections };
}

/** Render the bundle as prompt/UI text. Deterministic, capped. */
export function renderEvidenceText(bundle: EvidenceBundle): string {
  const text = bundle.sections
    .map((s) => `【${s.title}】${s.ok ? "" : "（收集失敗）"}\n${s.summary}`)
    .join("\n\n");
  return text.length <= BUNDLE_CHAR_CAP ? text : `${text.slice(0, BUNDLE_CHAR_CAP)}…（截斷）`;
}
