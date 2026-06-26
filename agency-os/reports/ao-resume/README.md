# AO-RESUME Report Archive

Each `/ao-resume` run writes its 七段式（seven-section）report here as a markdown file
so you can browse history without scrolling up in the live chat.

## Layout

- **Filename**: `YYYY-MM-DD-HHmm.md` (local time of the AO-RESUME run)
- **Content**: the full 七段式 markdown Claude printed in chat
- **Retention**: 90 days — older files are auto-pruned by the slash command on the next run
- **Sync**: git tracked → cross-machine via `git pull`

## Authoring rule

Written by Claude during each `/ao-resume` response. See
`.claude/commands/ao-resume.md` Step 3 for the exact contract.

If you ever notice a session ran AO-RESUME but no file landed here,
that is a Claude self-discipline failure — re-prompt with: "你忘了寫 archive。"
