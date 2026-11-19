// Gmail connector authorization mirror (card OUT-GMAIL-REAUTH 2026-11-19). Invariant: whether a connector can read and
// send is what Google's token endpoint says; co_connector_accounts.settings.gmail_sync.auth is only its mirror
// (absent = connected, {status:"expired"} = Google answered invalid_grant). Every token refresh of the reply sync and
// the automatic send goes through guardedRefresh:
//   invalid_grant -> one incident (fingerprint outreach:sender:<connector id>) unless one is still unresolved, THEN the
//     mark. Deduped on the incident, not the mark: an incident closed by hand while Google still refuses reopens next
//     tick (Codex ea221aca F3). The incident first: a mark without its incident would silence the alert.
//   success -> the mark cleared and any open incident resolved. Resolved on every success, not only when marked: the
//     reconnect (OAuth callback) rewrites settings and so drops the mark before the next tick sees it.
// The connector's own sync error is then GmailReauthRequired, whose text says where to press what (/ops/schedules,
// poke.log). Mirror write failures never cost the token: they are reported to onMirrorError.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestIncident } from "@/lib/ops-inbox/ingest";

export const CONNECTORS_PAGE = "/tools/outreach/connectors";
export const reauthFingerprint = (connectorId: string): string => `outreach:sender:${connectorId}`;

export interface ConnectorAuthState { email: string | null; organization_id: string | null; expired: boolean }

export class GmailReauthRequired extends Error {
  constructor(public readonly connectorId: string) {
    super(`Gmail 授權已失效（Google 回 invalid_grant）：到 ${CONNECTORS_PAGE} 在這個信箱按「🔗 重新連接」，用同一個 Google 帳號登入`);
    this.name = "GmailReauthRequired";
  }
}

export const isInvalidGrant = (e: unknown): boolean => /\binvalid_grant\b/.test(e instanceof Error ? e.message : String(e));

export function reauthIncident(email: string | null): { title: string; message: string } {
  const who = email ?? "外聯信箱";
  return {
    title: `${who} Gmail 需要重新授權`,
    message: `${who} 的 Google 授權已失效或被撤銷（invalid_grant），外聯回信同步與自動寄出都停在這個信箱。` +
      `1) 到 ${CONNECTORS_PAGE}，在這個 Gmail 列按「🔗 重新連接」，用 ${who} 這個 Google 帳號登入並同意權限；` +
      `2) 10 分鐘內下一輪同步成功，這筆事件自動結案、列上「上次同步成功」更新；` +
      `3) 若失效期間可能漏信，在該列按「補掃 N 天」補回。`,
  };
}

export interface AuthMirrorStore {
  state(connectorId: string): Promise<ConnectorAuthState | null>;
  markExpired(connectorId: string, why: string): Promise<void>;
  clearExpired(connectorId: string): Promise<void>;
  /** An incident with this connector's fingerprint that is not resolved ("ignored" counts: the operator chose it). */
  hasUnresolved(connectorId: string): Promise<boolean>;
  /** Error text, or null when the incident is written. */
  raise(connectorId: string, s: ConnectorAuthState): Promise<string | null>;
  resolve(connectorId: string): Promise<void>;
}

export function guardedRefresh(
  refresh: (connectorId: string) => Promise<string>,
  store: AuthMirrorStore,
  onMirrorError: (text: string) => void,
): (connectorId: string) => Promise<string> {
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return async (connectorId) => {
    let token: string;
    try {
      token = await refresh(connectorId);
    } catch (e) {
      if (!isInvalidGrant(e)) throw e;
      try {
        const s = (await store.state(connectorId)) ?? { email: null, organization_id: null, expired: false };
        const err = (await store.hasUnresolved(connectorId)) ? null : await store.raise(connectorId, s);
        if (err) onMirrorError(`${connectorId}: incident ${err}`);
        else if (!s.expired) await store.markExpired(connectorId, errText(e).slice(0, 300));
      } catch (x) {
        onMirrorError(`${connectorId}: auth mirror ${errText(x)}`);
      }
      throw new GmailReauthRequired(connectorId);
    }
    try {
      const s = await store.state(connectorId);
      if (s?.expired) await store.clearExpired(connectorId);
      await store.resolve(connectorId);
    } catch (x) {
      onMirrorError(`${connectorId}: auth mirror ${errText(x)}`);
    }
    return token;
  };
}

export function supabaseAuthMirror(sb: SupabaseClient): AuthMirrorStore {
  const merge = async (connectorId: string, patch: Record<string, unknown>) => {
    const { error } = await sb.rpc("co_merge_gmail_sync", { p_connector_id: connectorId, p_patch: patch, p_clear_rescan: null });
    if (error) throw new Error(`gmail_sync merge: ${error.message}`);
  };
  return {
    async state(connectorId) {
      const { data, error } = await sb.from("co_connector_accounts").select("organization_id, settings").eq("id", connectorId).maybeSingle();
      if (error) throw new Error(`connector read: ${error.message}`);
      if (!data) return null;
      const settings = (data.settings ?? {}) as { email?: string; gmail_sync?: { auth?: { status?: string } } };
      return { email: settings.email ?? null, organization_id: (data.organization_id as string | null) ?? null, expired: settings.gmail_sync?.auth?.status === "expired" };
    },
    markExpired: (connectorId, why) => merge(connectorId, { auth: { status: "expired", since: new Date().toISOString(), why } }),
    clearExpired: (connectorId) => merge(connectorId, { auth: null }),
    async raise(connectorId, s) {
      const fingerprint = reauthFingerprint(connectorId);
      const { title, message } = reauthIncident(s.email);
      let clientSlug: string | null = null;
      if (s.organization_id) {
        const { data: org } = await sb.from("organizations").select("slug").eq("id", s.organization_id).maybeSingle();
        clientSlug = (org?.slug as string | undefined) ?? null;
      }
      const r = await ingestIncident(sb, {
        source: "outreach", external_id: fingerprint, fingerprint, signal_type: "business", severity: "medium", service: "outreach-gmail",
        environment: process.env.NODE_ENV === "production" ? "production" : "development", title, message,
        raw: { connector_id: connectorId, organization_id: s.organization_id, email: s.email }, tags: { product: "outreach" },
        client_slug: clientSlug,
      });
      return r.error;
    },
    async hasUnresolved(connectorId) {
      const { data, error } = await sb.from("ops_incidents").select("id").eq("fingerprint", reauthFingerprint(connectorId))
        .neq("status", "resolved").limit(1);
      if (error) throw new Error(`incident read: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async resolve(connectorId) {
      const { error } = await sb.from("ops_incidents").update({ status: "resolved" })
        .eq("fingerprint", reauthFingerprint(connectorId)).neq("status", "resolved");
      if (error) throw new Error(`resolve incident: ${error.message}`);
    },
  };
}
