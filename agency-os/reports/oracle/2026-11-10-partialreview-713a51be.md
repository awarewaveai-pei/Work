# codex-oracle review -- 2026-11-10 22:28:33 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/import-audio-library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Verification pass on fixes for the previous review of card ED.6: (1) library default folder is now <VW_DATA_DIR or app/.data>/library (production VW_DATA_DIR=/data is a volume, docker-compose.yml video-workbench) instead of app/library; (2) import script writes assets/audio-library.json via temp file + rename; (3) edAudAddBuiltin saves the built-in asset to the library only after edAudAdd succeeded. nginx /library routing is a documented deploy step, out of scope. Report only real defects in these three fixes or regressions they cause.
- exit: 0 | elapsed: 107159ms | answer: 629B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/import-audio-library.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Switching projects during audio probing saves a built-in asset without adding it
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js:204
  confidence  -> CONFIRMED
  scenario    -> A user clicks ＋ on a built-in track, then switches projects before its audio metadata loads. `edAudAdd` returns without adding a clip at line 174, but `edAudAddBuiltin` continues and saves the asset at line 206.
  why missed  -> The fix treats a resolved `edAudAdd` call as proof that an add succeeded, although the function also resolves on an early return.

TOTAL: 1 findings
