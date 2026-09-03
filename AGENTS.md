# Codex bridge to the Claude-first workflow

`CLAUDE.md` is the only human-maintained project-workflow source. Before any
task action, Codex must read it in full, then read `agency-os/AGENTS.md` in
full because Codex does not natively resolve Claude's `@agency-os/AGENTS.md`
import. User and system/developer instructions still take precedence.

For a user request beginning with `/name`, if `.claude/commands/name.md`
exists, read and execute that command source. For a named Claude agent, use
the generated `.codex/agents/<name>.toml` profile; if it is unavailable, read
the matching `.claude/agents/<name>.md` source directly. Never maintain a
second hand-edited Codex copy of Claude workflow instructions.

The generated Codex compatibility surface is checked by
`mcp/codex-userlevel/scripts/check-claude-codex-parity.ps1`. Repair it with
`scripts/bootstrap-mcp-machine.ps1` or the automatic AO-RESUME sync; do not
manually edit generated wrappers, agents, or hook runtime copies.
