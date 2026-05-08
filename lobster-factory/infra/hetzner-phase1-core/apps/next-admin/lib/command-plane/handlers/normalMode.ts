// /normal_mode — kill-switch UNLOCK (high-risk, requires ops console SSO approval).
//
// Path: Telegram cannot fire this directly (policy hard-blocks high-risk from
// Telegram source); ops console approval API runs this handler AFTER an
// owner/admin approves the corresponding command_request.
//
// The approval API invokes this handler directly (bypassing commandRouter's
// killswitch check) — that bypass is intentional: this command IS the unlock
// path for emergency_stop, so it must not be self-blocked by its own state.

import type { CommandHandler } from "../commandRouter";
import { setSystemModeHandler } from "./systemModeControl";

// Wraps setSystemModeHandler("normal") with an approval-context note.
export const normalModeHandler: CommandHandler = async (request, deps) => {
  const inner = setSystemModeHandler("normal");
  const result = await inner(request, deps);
  return {
    ...result,
    text: result.text + "\n\n_(Approved via ops console; killswitch unlocked.)_",
  };
};
