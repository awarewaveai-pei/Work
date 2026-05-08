// /emergency_stop, /maintenance_mode, /read_only_mode — kill-switch ENABLE.
// All medium-risk: worst case the system locks itself (recoverable via SQL
// editor or ops console). Telegram cannot UNLOCK (/normal_mode is high-risk
// and hard-blocked from Telegram in policyEngine).
//
// The router runs the killswitch check BEFORE dispatching this handler:
//   1. mode='normal'      -> handler runs, sets target mode               OK
//   2. mode='emergency_stop' or other non-normal -> killswitch blocks new
//      mode-change attempts (since this command is medium, not low).      OK
// To downgrade or unlock, operator must SQL update or use ops console.

import type { CommandHandler } from "../commandRouter";
import type { SystemMode } from "../types";

const EMOJI: Record<SystemMode, string> = {
  emergency_stop: "🛑",
  maintenance: "🔧",
  read_only: "🔒",
  normal: "✅",
};

const EFFECT: Record<SystemMode, string> = {
  emergency_stop: "All commands blocked until reset to 'normal' via SQL editor or ops console.",
  maintenance:    "All non-low commands blocked. Reset via SQL editor or ops console.",
  read_only:      "Only low-risk read commands allowed. Reset via SQL editor or ops console.",
  normal:         "All commands allowed.",
};

export const setSystemModeHandler =
  (targetMode: SystemMode): CommandHandler =>
  async (request, { supabase }) => {
    const reason = `Set via Telegram by user ${request.actor_ref ?? "unknown"} (command: ${request.command})`;
    const setAt = new Date().toISOString();

    const { error } = await supabase
      .from("system_modes")
      .update({ mode: targetMode, reason, set_at: setAt })
      .eq("scope_type", "global")
      .is("scope_id", null);

    if (error) {
      throw new Error(`set_system_mode failed: ${error.message}`);
    }

    const text = [
      `${EMOJI[targetMode]} *System mode → \`${targetMode}\`*`,
      "",
      `set_at: ${setAt}`,
      `reason: ${reason}`,
      "",
      `_${EFFECT[targetMode]}_`,
    ].join("\n");

    return { text, mode: targetMode, set_at: setAt };
  };
