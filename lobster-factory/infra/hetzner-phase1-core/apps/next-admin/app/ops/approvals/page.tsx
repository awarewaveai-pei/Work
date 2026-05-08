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
      <h1 style={{ marginBottom: 6 }}>Pending Approvals</h1>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24 }}>
        High/critical-risk commands queued from Telegram or other ingress sources, waiting for owner/admin
        approval before dispatch. Owner doc:{" "}
        <Link href="https://github.com/awarewaveai-pei/Work/blob/main/agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md">
          ALWAYS_ON_COMMAND_PLANE.md
        </Link>
        .
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
        Your role: <strong>{role}</strong>{" "}
        {canAct ? (
          <span style={{ color: "#059669" }}>(can approve / reject)</span>
        ) : (
          <span style={{ color: "#b91c1c" }}>(read-only — owner / admin required to act)</span>
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
          ✅ No pending approvals. The queue is empty.
        </div>
      )}

      {pending.length > 0 && <ApprovalList items={pending} canAct={canAct} />}
    </div>
  );
}
