// The Chatwoot account settings every customer-service tenant needs, applied by code so a new
// tenant's account (ours, or a buyout customer's own Chatwoot reached by its URL and token) gets
// them in one click instead of someone remembering them in Chatwoot's settings pages:
//   - auto-resolve: an open conversation idle for AUTO_RESOLVE_MINUTES resolves itself, so a thread
//     a human took over (and forgot) returns to the AI -- the webhook stays silent while a
//     conversation is open (app/api/webhooks/chatwoot/route.ts human_owns_thread).
//   - one global macro: the closing line + resolve, so the agent ends a thread in one click.
// Idempotent: the plan compares the desired state with what the account has and changes only the
// difference. The gate is inside applyChatwootBaseline, not in its caller, so no future caller can
// skip it (lib/system-modes/production-change-gate.ts; same placement as publishToWordPress).

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import {
  createMacro, getAccountSettings, listMacros, updateAccountSettings, updateMacro,
  type ChatwootAutoResolveSettings, type ChatwootMacro, type ChatwootMacroInput,
} from "@/lib/cs/chatwoot-client";
import type { ChatwootConfig, CisProfile } from "@/lib/cs/types";

/** Idle time before an open conversation resolves itself: two days leaves a weekend for the human. */
export const AUTO_RESOLVE_MINUTES = 48 * 60;
export const CLOSING_MACRO_NAME = "回覆完結案（AI 接回）";

export interface DesiredBaseline {
  account: ChatwootAutoResolveSettings;
  macros: ChatwootMacroInput[];
}

/** Wording follows the tenant's csVoice (honorific, emoji), like the handoff acknowledgement. */
export function desiredChatwootBaseline(cis: Pick<CisProfile, "csVoice">): DesiredBaseline {
  const v = cis.csVoice ?? {};
  const you = v.honorifics === "你" ? "你" : "您";
  const emoji = v.emojiPolicy === "none" ? "" : " 🙏";
  return {
    account: {
      auto_resolve_after: AUTO_RESOLVE_MINUTES,
      auto_resolve_message: `這則對話先告一段落。之後有任何問題，隨時再留言給我們${emoji}`,
      auto_resolve_ignore_waiting: false,
    },
    macros: [{
      name: CLOSING_MACRO_NAME,
      visibility: "global",
      actions: [
        { action_name: "send_message", action_params: [`謝謝${you}的訊息，這次的問題就先處理到這裡。之後有需要，隨時再留言${emoji}`] },
        { action_name: "resolve_conversation", action_params: [] },
      ],
    }],
  };
}

export type BaselineChange =
  | { kind: "account"; field: keyof ChatwootAutoResolveSettings; from: unknown; to: unknown }
  | { kind: "macro_create"; name: string }
  | { kind: "macro_update"; name: string; id: number };

function sameActions(a: ChatwootMacro["actions"], b: ChatwootMacro["actions"]): boolean {
  const norm = (x: ChatwootMacro["actions"]) => JSON.stringify(x.map((s) => [s.action_name, s.action_params.map(String)]));
  return norm(a) === norm(b);
}

/** What applying `desired` would change. Settings come back from Chatwoot as stored (a number may be a string). */
export function planChatwootBaseline(desired: DesiredBaseline, current: { settings: Record<string, unknown>; macros: ChatwootMacro[] }): BaselineChange[] {
  const changes: BaselineChange[] = [];
  const s = current.settings;
  if (Number(s.auto_resolve_after ?? 0) !== desired.account.auto_resolve_after) {
    changes.push({ kind: "account", field: "auto_resolve_after", from: s.auto_resolve_after ?? null, to: desired.account.auto_resolve_after });
  }
  if (String(s.auto_resolve_message ?? "") !== desired.account.auto_resolve_message) {
    changes.push({ kind: "account", field: "auto_resolve_message", from: s.auto_resolve_message ?? null, to: desired.account.auto_resolve_message });
  }
  if ((s.auto_resolve_ignore_waiting === true) !== desired.account.auto_resolve_ignore_waiting) {
    changes.push({ kind: "account", field: "auto_resolve_ignore_waiting", from: s.auto_resolve_ignore_waiting ?? null, to: desired.account.auto_resolve_ignore_waiting });
  }
  for (const want of desired.macros) {
    const have = current.macros.find((m) => m.name === want.name);
    if (!have) changes.push({ kind: "macro_create", name: want.name });
    else if (have.visibility !== want.visibility || !sameActions(have.actions, want.actions)) changes.push({ kind: "macro_update", name: want.name, id: have.id });
  }
  return changes;
}

export type ApplyResult =
  | { ok: true; changes: BaselineChange[] }
  | { ok: false; blocked: true; mode: string; reason?: string };

/** Read, plan, apply. Every Chatwoot write happens after the production-change gate. */
export async function applyChatwootBaseline(
  sb: SupabaseClient | null,
  organizationId: string,
  config: ChatwootConfig,
  cis: Pick<CisProfile, "csVoice">,
): Promise<ApplyResult> {
  const gate = await checkProductionChangeAllowed(sb, organizationId);
  if (!gate.allowed) return { ok: false, blocked: true, mode: String(gate.mode), reason: gate.reason };

  const desired = desiredChatwootBaseline(cis);
  const [settings, macros] = await Promise.all([getAccountSettings(organizationId, config), listMacros(organizationId, config)]);
  const changes = planChatwootBaseline(desired, { settings, macros });

  if (changes.some((c) => c.kind === "account")) {
    await updateAccountSettings(organizationId, config, desired.account);
  }
  for (const c of changes) {
    if (c.kind === "account") continue;
    const want = desired.macros.find((m) => m.name === c.name);
    if (!want) continue;
    if (c.kind === "macro_create") await createMacro(organizationId, config, want);
    else await updateMacro(organizationId, config, c.id, want);
  }
  return { ok: true, changes };
}
