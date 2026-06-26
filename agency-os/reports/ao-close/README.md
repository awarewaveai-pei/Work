# AO-CLOSE Report Archive

Each `/ao-close` run writes its four-section（四段式）report here as a markdown file
so you can browse past closeouts without scrolling up in the live chat.

## Layout

- **Filename**: `YYYY-MM-DD-HHmm.md` (local time of the AO-CLOSE run)
- **Content**: the full four-section markdown Claude printed in chat
  - 本輪完成（上次 AO-RESUME 至今）
  - 未完成
  - 連動檢查（doc-sync, health gate result）
  - 明日優先
- **Retention**: 90 days — older files are auto-pruned by the slash command on the next run
- **Sync**: git tracked → cross-machine via `git pull`

## Authoring rule

Written by Claude during each `/ao-close` response, AFTER `ao-close.ps1`
finishes and BEFORE the chat reply ends. See
`.claude/commands/ao-close.md` final Step for the exact contract.

If you ever notice a session ran AO-CLOSE but no file landed here,
that is a Claude self-discipline failure — re-prompt with: "你忘了寫 archive。"

## Cross-reference

Pair with `agency-os/reports/ao-resume/` for full session continuity:
each AO-RESUME report opens a session, each AO-CLOSE report closes it.
