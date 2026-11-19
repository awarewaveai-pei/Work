// Channel health mirror (SOC-REAUTH 2026-11-19). Invariant: whether a channel can post is what Postiz says; our
// social_accounts.status is only its mirror. Postiz v2.25.1's public API does not return refreshNeeded /
// inBetweenSteps, so the host reads Postiz's own "Integration" table every 5 minutes (scripts/social-channel-health.sh, read-only)
// and POSTs it to /api/internal/social/channel-health, which calls applyChannelHealth here.
//   unhealthy (refreshNeeded | inBetweenSteps | disabled | deleted) -> expired; healthy and expired -> connected.
//   our own "disabled" (the operator's off switch) is never touched; an integration missing from Postiz's table is gone
//   (expired) -- unless the whole table came back empty, then nothing changes. Postiz "disabled" maps to expired.
// A channel turning expired raises one incident (fingerprint per account) saying what to do; recovering resolves it,
// so the next failure reopens and notifies again. A reconnect is finished only when this mirror says so (store.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { SETTINGS_CHANNELS } from "./dispatch";

export interface ChannelHealth { id: string; provider: string; refreshNeeded: boolean; disabled: boolean; inBetweenSteps: boolean; deleted: boolean }
export interface MirrorAccount { id: string; organization_id: string; platform: string; label: string; status: string; postiz_integration_id: string }
export interface MirrorChange { account: MirrorAccount; to: "connected" | "expired"; why: string | null }

/** The Postiz reason a channel cannot post, or null when it can. */
export function unhealthyWhy(h: ChannelHealth): string | null {
  if (h.deleted) return "Postiz 已刪除這個頻道";
  if (h.disabled) return "Postiz 顯示已停用";
  if (h.refreshNeeded) return "Postiz refreshNeeded：平台授權已失效";
  if (h.inBetweenSteps) return "Postiz 連接流程沒有走完";
  return null;
}

export function planMirror(accounts: MirrorAccount[], health: ChannelHealth[]): MirrorChange[] {
  const byId = new Map(health.map((h) => [h.id, h]));
  const out: MirrorChange[] = [];
  for (const a of accounts) {
    if (a.status === "disabled") continue;
    const h = byId.get(a.postiz_integration_id);
    if (!h && !health.length) continue;   // an empty table is a broken read, never "every channel is gone"
    const why = h ? unhealthyWhy(h) : "Postiz 已沒有這個頻道";
    if (why && a.status !== "expired") out.push({ account: a, to: "expired", why });
    else if (!why && a.status === "expired") out.push({ account: a, to: "connected", why: null });
  }
  return out;
}

export function reauthIncident(platform: string, label: string, why: string): { title: string; message: string } {
  return {
    title: `${platform} 頻道需要重新授權`,
    message: `${platform}「${label}」：${why}。1) 到 ${SETTINGS_CHANNELS}，在這個頻道按 ⋮ →「重新連接」完成平台授權；` +
      `2) 約 5 分鐘內頻道狀態變回「已連接」（Postiz 確認授權有效後才會變）；3) 已失敗的貼文打開後重新排程，才會重送。`,
  };
}

/** Strict parse of the host payload: anything malformed is refused whole (a half-read list would flip channels). */
export function parseHealth(body: unknown): ChannelHealth[] | null {
  if (!Array.isArray(body)) return null;
  const out: ChannelHealth[] = [];
  for (const r of body) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || typeof o.provider !== "string") return null;
    for (const k of ["refreshNeeded", "disabled", "inBetweenSteps", "deleted"]) if (typeof o[k] !== "boolean") return null;
    out.push({ id: o.id, provider: o.provider, refreshNeeded: o.refreshNeeded as boolean, disabled: o.disabled as boolean,
      inBetweenSteps: o.inBetweenSteps as boolean, deleted: o.deleted as boolean });
  }
  return out;
}

export async function applyChannelHealth(health: ChannelHealth[], sb: SupabaseClient | null = getSupabaseWriteClient())
  : Promise<{ expired: number; connected: number; errors: string[] }> {
  if (!sb) throw new Error("Supabase client not configured");
  const { data, error } = await sb.from("social_accounts").select("id, organization_id, platform, label, status, postiz_integration_id").neq("status", "disabled");
  if (error) throw new Error(`accounts: ${error.message}`);
  const out = { expired: 0, connected: 0, errors: [] as string[] };
  for (const c of planMirror((data ?? []) as MirrorAccount[], health)) {
    // conditional on the status read: a person reconnecting meanwhile is not overwritten
    const { data: done, error: upErr } = await sb.from("social_accounts").update({ status: c.to })
      .eq("id", c.account.id).eq("status", c.account.status).select("id");
    if (upErr) { out.errors.push(`${c.account.id}: ${upErr.message}`); continue; }
    if (!done?.length) continue;
    if (c.to === "connected") {
      out.connected++;
      const { error: resErr } = await sb.from("ops_incidents").update({ status: "resolved" })
        .eq("fingerprint", `social:account:${c.account.id}`).neq("status", "resolved");
      if (resErr) out.errors.push(`${c.account.id}: resolve incident ${resErr.message}`);
      continue;
    }
    out.expired++;
    const { title, message } = reauthIncident(c.account.platform, c.account.label, c.why as string);
    const { data: org } = await sb.from("organizations").select("slug").eq("id", c.account.organization_id).maybeSingle();
    const fingerprint = `social:account:${c.account.id}`;
    const r = await ingestIncident(sb, {
      source: "social", external_id: fingerprint, fingerprint, signal_type: "business", severity: "medium", service: "social-manager",
      environment: process.env.NODE_ENV === "production" ? "production" : "development", title, message,
      raw: { organization_id: c.account.organization_id, account_id: c.account.id }, tags: { product: "social" },
      client_slug: (org?.slug as string | undefined) ?? null,
    });
    if (r.error) out.errors.push(`${c.account.id}: incident ${r.error}`);
  }
  return out;
}
