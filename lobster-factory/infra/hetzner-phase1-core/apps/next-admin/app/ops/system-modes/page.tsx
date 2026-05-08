// /ops/system-modes — view + change global system_modes (kill switch).
// Phase 2c (2026-05-08).
import { headers } from "next/headers";
import { getSupabaseReadClient } from "@/lib/supabase-server";
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

  const supabase = getSupabaseReadClient();
  let current: ModeRow | null = null;
  let dbError: string | null = null;

  if (!supabase) {
    dbError = "Supabase read client not configured.";
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
      <h1 style={{ marginBottom: 6 }}>System Modes</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        Global kill switch and operating mode. Affects which commands can dispatch via
        the Always-On Command Plane.
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
        Your role: <strong>{role}</strong>{" "}
        {canAct ? (
          <span style={{ color: "#059669" }}>(can change mode)</span>
        ) : (
          <span style={{ color: "#b91c1c" }}>(read-only — owner / admin required)</span>
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
          DB error: {dbError}
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
          Current Mode
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
            <strong>Reason:</strong> {current.reason}
          </div>
        )}
        {current?.set_at && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            Set at: {new Date(current.set_at).toLocaleString()}
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
        <strong>Effects:</strong>
        <ul style={{ margin: "8px 0 0 20px", padding: 0 }}>
          <li>
            <code>normal</code> — All commands allowed.
          </li>
          <li>
            <code>read_only</code> — Only low-risk read commands allowed.
          </li>
          <li>
            <code>maintenance</code> — All non-low commands blocked.
          </li>
          <li>
            <code>emergency_stop</code> — All commands blocked. Recovery: this page (owner/admin) or SQL editor.
          </li>
        </ul>
        <div style={{ marginTop: 12 }}>
          <strong>Note:</strong> Telegram cannot unlock from <code>emergency_stop</code> back to{" "}
          <code>normal</code> (policy hard-block on <code>/normal_mode</code>). Use this page or the
          ops console approval flow at <code>/ops/approvals</code>.
        </div>
      </div>
    </div>
  );
}
