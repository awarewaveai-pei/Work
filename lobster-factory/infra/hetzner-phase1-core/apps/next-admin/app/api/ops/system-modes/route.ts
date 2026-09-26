// GET /api/ops/system-modes — read current global system mode + history snapshot
// POST /api/ops/system-modes — change global system mode (incl. unlocking from emergency_stop)
//
// RBAC on POST: owner + admin only (governance red line per CLAUDE.md High-STOP).
// Source-of-truth: public.system_modes (global scope; one active row per scope).
// Phase 2c (2026-05-08).

import { after, NextResponse } from "next/server";
import { canChangeSystemMode, resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseServerClient, getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { drainPodOrderInbox, getPodOrderInboxStats } from "../../../../lib/studio/pod-order-inbox";

const VALID_MODES = ["normal", "maintenance", "read_only", "emergency_stop"] as const;
type Mode = (typeof VALID_MODES)[number];

// GET uses server client (service role) because system_modes has RLS enabled.
// RBAC is not required for read (operators with read access can view current mode).
export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("system_modes")
    .select("scope_type,scope_id,mode,reason,set_by,set_at,expires_at,metadata")
    .eq("scope_type", "global")
    .is("scope_id", null)
    .single();

  // Paid Woo orders waiting on a mode or a retry (lib/studio/pod-order-inbox.ts); also read by the AO
  // smoke check (scripts/check-smoke-tests.ps1).
  const podOrderInbox = await getPodOrderInboxStats(supabase);

  if (error || !data) {
    // No row yet — surface as default 'normal'.
    return NextResponse.json({
      ok: true,
      role: resolveOpsRole(request).role,
      current: { mode: "normal", reason: "no_row_default", set_at: null },
      note: "No global system_modes row found — defaulting to 'normal'. POST will create.",
      podOrderInbox,
    });
  }

  return NextResponse.json({
    ok: true,
    role: resolveOpsRole(request).role,
    current: data,
    podOrderInbox,
  });
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canChangeSystemMode(resolved.role)) {
    return NextResponse.json(
      { ok: false, error: "forbidden_role", role: resolved.role },
      { status: 403 },
    );
  }

  let body: { mode?: string; reason?: string };
  try {
    body = (await request.json()) as { mode?: string; reason?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const mode = body.mode as Mode | undefined;
  if (!mode || !VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { ok: false, error: "invalid_mode", expected: VALID_MODES, received: body.mode },
      { status: 400 },
    );
  }

  const reason = (body.reason ?? `Set via ops console by role=${resolved.role}`).slice(0, 500);
  const setAt = new Date().toISOString();

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_write_not_configured" },
      { status: 503 },
    );
  }

  // Upsert global row (one per scope_type='global' scope_id=null per unique index).
  // Use update first; if no row exists, insert.
  const { data: existing } = await supabase
    .from("system_modes")
    .select("id")
    .eq("scope_type", "global")
    .is("scope_id", null)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("system_modes")
      .update({
        mode,
        reason,
        set_at: setAt,
        metadata: {
          changed_by_role: resolved.role,
          source: "ops_console_ui",
        },
      })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "update_failed", details: error.message },
        { status: 500 },
      );
    }
  } else {
    const { error } = await supabase.from("system_modes").insert({
      scope_type: "global",
      scope_id: null,
      mode,
      reason,
      set_at: setAt,
      metadata: {
        changed_by_role: resolved.role,
        source: "ops_console_ui",
        first_row: true,
      },
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "insert_failed", details: error.message },
        { status: 500 },
      );
    }
  }

  // Back to normal: replay the Woo orders the mode deferred, after the response (a drain is many
  // Printful round trips; Cloudflare cuts the request at 100 s).
  if (mode === "normal") after(() => drainPodOrderInbox(supabase).then(() => undefined));

  return NextResponse.json({ ok: true, current: { mode, reason, set_at: setAt } });
}
