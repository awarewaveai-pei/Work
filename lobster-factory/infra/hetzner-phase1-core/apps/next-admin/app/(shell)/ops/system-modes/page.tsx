// /ops/system-modes — view + change global system_modes (kill switch).
// Phase 2c (2026-05-08).
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canChangeSystemMode, readOpsRole } from "@/lib/ops-role";
import { getPodOrderInboxStats, type PodOrderInboxStats } from "@/lib/studio/pod-order-inbox";
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
  let inbox: PodOrderInboxStats | null = null;

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
    inbox = await getPodOrderInboxStats(supabase);
  }
  const inboxOpen = inbox && (!inbox.ok || inbox.deferred + inbox.retrying + inbox.gaveUp + inbox.stuckPending > 0);

  const effectiveMode = current?.mode ?? "normal";
  const isLocked = effectiveMode !== "normal";

  return (
    <div style={{ padding: "32px 40px", maxWidth: 800 }}>
      <h1 style={{ marginBottom: 6 }}>系統模式（Kill Switch）</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
        全域系統開關。影響 Always-On Command Plane（指令面板）允許哪些指令執行。
      </p>

      <div
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 13,
          color: "var(--badge-gray-text)",
        }}
      >
        你的角色：<strong>{role}</strong>{" "}
        {canAct ? (
          <span style={{ color: "var(--green)" }}>（可切換模式）</span>
        ) : (
          <span style={{ color: "var(--red)" }}>（唯讀 — 需 owner / admin 才能切換）</span>
        )}
      </div>

      {dbError && (
        <div
          style={{
            background: "var(--badge-red-bg)",
            border: "1px solid var(--red)",
            color: "var(--badge-red-text)",
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
          background: isLocked ? "var(--badge-red-bg)" : "var(--badge-green-bg)",
          border: `1px solid ${isLocked ? "var(--red)" : "var(--green)"}`,
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          目前模式
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: isLocked ? "var(--badge-red-text)" : "var(--badge-green-text)", marginBottom: 8 }}>
          {effectiveMode === "emergency_stop" && "🛑 "}
          {effectiveMode === "maintenance" && "🔧 "}
          {effectiveMode === "read_only" && "🔒 "}
          {effectiveMode === "normal" && "✅ "}
          {effectiveMode}
        </div>
        {current?.reason && (
          <div style={{ fontSize: 13, color: "var(--badge-gray-text)", marginTop: 8 }}>
            <strong>切換原因：</strong>
            {current.reason}
          </div>
        )}
        {current?.set_at && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            最後切換時間：{new Date(current.set_at).toLocaleString("zh-TW")}
          </div>
        )}
      </div>

      {inboxOpen && inbox && (
        <div
          style={{
            background: "var(--badge-yellow-bg, var(--bg-subtle))",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          <strong>Woo 付款訂單收件匣：</strong>
          {inbox.ok ? (
            <>
              等模式恢復 {inbox.deferred} 筆
              {inbox.oldestDeferredAgeSeconds !== null && `（最舊 ${Math.round(inbox.oldestDeferredAgeSeconds / 60)} 分鐘）`}
              ・自動重試中 {inbox.retrying} 筆{inbox.overdueRetries > 0 && `（其中 ${inbox.overdueRetries} 筆逾期沒人重試）`}・需手動處理 {inbox.gaveUp} 筆・卡住 {inbox.stuckPending} 筆
              {inbox.capped && "（超過 500 筆，只顯示前 500）"}
              <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
                切回 normal 會自動補做等候中的訂單；需手動的訂單到「商品發布」用訂單號轉 Printful 草稿。
              </div>
            </>
          ) : (
            <>讀不到（{inbox.error}）</>
          )}
        </div>
      )}

      {canAct && <SystemModeControl currentMode={effectiveMode} />}

      <div
        style={{
          marginTop: 32,
          padding: "16px 20px",
          background: "var(--badge-gray-bg)",
          borderLeft: "4px solid var(--text-muted)",
          fontSize: 13,
          color: "var(--badge-gray-text)",
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
          非 normal 時，客戶那邊進來的事件不會被擋掉：Woo 付款訂單先存進收件匣、切回 normal 自動補建 Printful 草稿；Chatwoot 客服訊息暫停 AI、直接轉真人。
        </div>
        <div style={{ marginTop: 12 }}>
          <strong>重要：</strong>從 <code>emergency_stop</code> 解鎖回 <code>normal</code>，{" "}
          <strong>Telegram 永遠不能直接做</strong>（<code>/normal_mode</code> 被 policy 硬擋）。只能用本頁或從{" "}
          <code>/ops/approvals</code> 經 ops console 簽核流程。
        </div>
      </div>
    </div>
  );
}
