// /approve_repair <incident_uuid> — push a production incident into the repair
// pipeline from Telegram (A3, 2026-07-03).
//
// This is the SAME entry point as the web「核准修復」button
// (startRepairFromIncident): policy gate → system-mode gate → critical
// second-confirmation hold → backup gate → GitHub issue. Nothing is bypassed —
// a critical-severity incident still parks at triage_needed and must be
// confirmed from the ops console. Command risk is "medium" (same class as
// /trigger_staging_workflow): worst case is a backup + a GitHub issue.

import type { CommandHandler } from "../commandRouter";
import { startRepairFromIncident } from "@/lib/repair-center/service";
import { blockedChangeMessage } from "@/lib/system-modes/blocked-change";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const approveRepairHandler: CommandHandler = async (request) => {
  const raw = (request.args as { raw?: string }).raw?.trim() ?? "";
  const id = raw.split(/\s+/)[0] ?? "";

  if (!id) {
    return {
      text: [
        "⚠️ 用法：`/approve_repair <incident_id>`",
        "",
        "incident_id 在告警訊息的「核准修復：」行，或 /ops/inbox 事件頁網址。",
      ].join("\n"),
      error: "missing_id",
    };
  }
  if (!UUID_RE.test(id)) {
    return { text: `⚠️ incident_id 格式錯誤：\`${id}\``, error: "invalid_uuid" };
  }

  const result = await startRepairFromIncident({
    incidentId: id,
    actor: `telegram:${request.actor_ref ?? "unknown"}`,
    source: "telegram",
  });

  if (!result.ok) {
    if (result.blockedMode !== undefined) {
      return { text: `⛔ ${blockedChangeMessage(result.blockedMode)}`, error: result.error ?? "system_mode_blocks_repair" };
    }
    return {
      text: `❌ 核准失敗：${result.error ?? "unknown"}${result.details ? `\n${JSON.stringify(result.details).slice(0, 300)}` : ""}`,
      error: result.error ?? "approve_failed",
    };
  }

  const run = result.run;
  if (result.error === "critical_requires_second_confirmation") {
    return {
      text: [
        "🟠 已受理，但這是 critical 等級事件。",
        "依規定需要在 ops console 做第二次確認才會啟動修復：",
        `/ops/repairs（run ${run?.id.slice(0, 8) ?? "?"}）`,
      ].join("\n"),
      run_id: run?.id ?? null,
    };
  }

  return {
    text: [
      "✅ 修復流程已啟動。",
      `狀態：${run?.state ?? "?"} · 備份：${run?.backup_status ?? "?"}`,
      run?.github_issue_url ? `Issue：${run.github_issue_url}` : "",
      "進度看 /ops/repairs。",
    ]
      .filter(Boolean)
      .join("\n"),
    run_id: run?.id ?? null,
  };
};
