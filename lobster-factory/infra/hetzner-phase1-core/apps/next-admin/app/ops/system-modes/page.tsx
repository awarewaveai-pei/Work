// /ops/system-modes — view + change global system_modes (kill switch).
// Phase 2c (2026-05-08).
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canChangeSystemMode, readOpsRole } from "@/lib/ops-role";
import { SystemModeControl } from "./SystemModeControl";

export const dynamic = "force-dynamic";

interface ModeRow {
  scope_type: string;
  scope_id: string | null;
  mode: string;
  reason: string | null;
  set_by: string | null;
  set_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export default async function SystemModesPage() {
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canChangeSystemMode(role);

  const supabase = getSupabaseServerClient();
  let current: ModeRow | null = null;
  let dbError: string | null = null;

  if (!supabase) {
    dbError = "Supabase client not configured.";
  } else {
    const { data, error } = await supabase
      .from("system_modes")
      .select("scope_type,scope_id,mode,reason,set_by,set_at,expires_at,metadata")
      .eq("scope_type", "global")
      .is("scope_id", null)
      .maybeSingle();
    if (error) dbError = error.message;
    else current = (data as ModeRow | null) ?? null;
  }

  const effectiveMode = current?.mode ?? "normal";
  const isLocked = effectiveMode !== "normal";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 800 }}>
      <h1 style={{ marginBottom: 6 }}>系統模式（Kill Switch）</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        全域系統開關。影響 Always-On Command Plane（指令面板）允許哪些指令執行。
      </p>

      <div
        style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 13,
          color: "#475569",
        }}
      >
        你的角色：<strong>{role}</strong>{" "}
        {canAct ? (
          <span style={{ color: "#059669" }}>（可切換模式）</span>
        ) : (
          <span style={{ color: "#b91c1c" }}>（唯讀 — 需 owner / admin 才能切換）</span>
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

      <div
        style={{
          background: isLocked ? "#fef2f2" : "#ecfdf5",
          border: `1px solid ${isLocked ? "#fecaca" : "#a7f3d0"}`,
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          目前模式
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: isLocked ? "#991b1b" : "#065f46", marginBottom: 8 }}>
          {effectiveMode === "emergency_stop" && "🛑 "}
          {effectiveMode === "maintenance" && "🔧 "}
          {effectiveMode === "read_only" && "🔒 "}
          {effectiveMode === "normal" && "✅ "}
          {effectiveMode}
        </div>
        {current?.reason && (
          <div style={{ fontSize: 13, color: "#475569", marginTop: 8 }}>
            <strong>切換原因：</strong>
            {current.reason}
          </div>
        )}
        {current?.set_at && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            最後切換時間：{new Date(current.set_at).toLocaleString("zh-TW")}
          </div>
        )}
      </div>

      {canAct && <SystemModeControl currentMode={effectiveMode} />}

      <div
        style={{
          marginTop: 32,
          padding: "16px 20px",
          background: "#f1f5f9",
          borderLeft: "4px solid #64748b",
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.7,
        }}
      >
        <strong>各模式效果：</strong>
        <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
          <li>
            <code>normal</code> — 全部指令允許執行。
          </li>
          <li>
            <code>read_only</code> — 只允許 low-risk 讀取類指令（例：/status、/health）。
          </li>
          <li>
            <code>maintenance</code> — 所有非 low-risk 指令被擋下。
          </li>
          <li>
            <code>emergency_stop</code> — 🛑 所有指令全部擋下。解鎖路徑：<strong>本頁（owner / admin）</strong>或 SQL editor。
          </li>
        </ul>
        <div style={{ marginTop: 12 }}>
          <strong>重要：</strong>從 <code>emergency_stop</code> 解鎖回 <code>normal</code>，{" "}
          <strong>Telegram 永遠不能直接做</strong>（<code>/normal_mode</code> 被 policy 硬擋）。只能用本頁或從{" "}
          <code>/ops/approvals</code> 經 ops console 簽核流程。
        </div>
      </div>
    </div>
  );
}
