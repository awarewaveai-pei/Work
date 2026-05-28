Fix missing Claude Code and Codex sidebars in Cursor by patching their extension package.json to force activity bar placement.

```bash
node scripts/fix-cursor-ai-sidebars.mjs
```

After running, report:
- Which extensions were patched (Codex / Claude Code)
- Any warnings about unexpected structure or missing extensions
- Remind the user: **Ctrl+Shift+P → Developer: Reload Window** to apply changes

If both are skipped (nothing patched), check that the extensions are installed under `%USERPROFILE%\.cursor\extensions\`.
