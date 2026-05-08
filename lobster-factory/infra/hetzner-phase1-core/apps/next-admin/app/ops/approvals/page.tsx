// /ops/approvals — list pending high/critical command_requests; approve/reject UI.
// Phase 2c (2026-05-08).
import { headers } from "next/headers";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, readOpsRole } from "@/lib/ops-role";
import { ApprovalList } from "./ApprovalList";

export const dynamic = "force-dynamic";

interface CommandRequestRow {
  id: string;
  organization_id: string;
  source: string;
  actor_type: string;
  actor_ref: string | null;
  command: string;
  args: Record<string, unknown>;
  risk_level: string;
  status: string;
  trace_id: string;
  received_at: string;
  metadata: Record<string, unknown>;
}

export default async function ApprovalsPage() {
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canApproveCommand(role);

  const supabase = getSupabaseServerClient();
  let pending: CommandRequestRow[] = [];
  let dbError: string | null = null;

  if (!supabase) {
    dbError = "Supabase client not configured.";
  } else {
    const { data, error } = await supabase
      .from("command_requests")
      .select(
        "id,organization_id,source,actor_type,actor_ref,command,args,risk_level,status,trace_id,received_at,metadata",
      )
      .eq("status", "queued")
      .in("risk_level", ["high", "critical"])
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) dbError = error.message;
    else pending = (data ?? []) as CommandRequestRow[];
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
      <h1 style={{ marginBottom: 6 }}>待簽核指令</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        從 Telegram 等外部入口發來的高風險／關鍵指令會排隊在此，等待 owner / admin 簽核後才會實際執行。
        owner 文件：{" "}
        <Link href="https://github.com/awarewaveai-pei/Work/blob/main/agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md">
          COMMAND_PLANE_RUNBOOK.md
        </Link>
        。
      </p>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 24,
          fontSize: 13,
          color: "#475569",
        }}
      >
        你的角色：<strong>{role}</strong>{" "}
        {canAct ? (
          <span style={{ color: "#059669" }}>（可核准／拒絕）</span>
        ) : (
          <span style={{ color: "#b91c1c" }}>（唯讀 — 需 owner / admin 才能操作）</span>
        )}
      </div>

      {dbError && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
          }}
        >
          資料庫錯誤：{dbError}
        </div>
      )}

      {!dbError && pending.length === 0 && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: 8,
            padding: "20px 24px",
            textAlign: "center",
          }}
        >
          ✅ 目前沒有待簽核項目，佇列是空的。
        </div>
      )}

      {pending.length > 0 && <ApprovalList items={pending} canAct={canAct} />}
    </div>
  );
}
