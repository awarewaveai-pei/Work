---
name: AO-RESUME hook silent fail diagnostic path
description: When AO-RESUME hook seems not to fire, check ao-resume-hook-fail.log for swallowed exceptions before giving up
type: reference
originSessionId: 4845860f-ee69-4e0f-a113-95f6686c9b87
---
When the user types `AO-RESUME` and the chat appears to continue but no `ao-resume-hook-last.json` / `ao-resume-hook-last.log` is produced under `agency-os/.agency-state/`, the hook script (`~/.claude/hooks/ao-resume-on-prompt.ps1`) likely caught an exception and silently returned `continue:true`.

**Where to look**: `agency-os/.agency-state/ao-resume-hook-fail.log`

This file is **append-mode**, written from the catch block in the hook script. Each entry contains:
- ISO 8601 UTC timestamp
- `Exception.Message`
- Full `ScriptStackTrace`
- `---` separator

If the file exists, read it to see what threw. If the file does NOT exist, the hook truly never ran (Claude Code might not have invoked it — check `~/.claude/settings.json` `UserPromptSubmit` config).

**SSOT for the hook script**: `mcp/claude-userlevel/hooks/ao-resume-on-prompt.ps1` (in repo). Sync to `~/.claude/hooks/` via `scripts/sync-claude-userlevel.ps1 -Mode merge`. Edit SSOT, never edit the installed copy directly.

**Background**: pre-2026-05-08, the catch block silently swallowed errors with no log; agents diagnosing silent-fails had to manually trace the script. That fail-log path was added 2026-05-08 to make hook failures observable. Cursor rule `30-resume-keyword.mdc` § "Hook silent fail 診斷" documents this for the agent's reading.
