# codex-oracle review -- 2026-10-25 12:43:32 +08:00

- mode: `review`
- scope: -Path scripts/verify-asset-parity.mjs, tests/hooks/asset-parity.test.mjs, .agents/skills/source-command-account/SKILL.md, .agents/skills/source-command-codex-do/SKILL.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: verify-asset-parity.mjs now flags asset files (commands/agents/skills/.agents wrappers/.codex agents) present on disk but untracked by git, because the gate read disk while CI reads a clean checkout: /account and /codex-do wrappers were generated locally, never committed, so local was green and CI red. Also verify: does this change depend on something NOT visible in this diff (config, CI checkout depth, gitignore, cwd)? If no real finding, say so; do not invent one.
- exit: 0 | elapsed: 114481ms | answer: 1339B
- files-reviewed: .agents/skills/source-command-account/SKILL.md, .agents/skills/source-command-codex-do/SKILL.md, scripts/verify-asset-parity.mjs, tests/hooks/asset-parity.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Ignored required assets still produce a false-green parity result.
  file:line   -> scripts/verify-asset-parity.mjs:94
  confidence  -> CONFIRMED
  scenario    -> A tracked command’s generated wrapper exists locally but is untracked and excluded through `.git/info/exclude` or `core.excludesFile`. `--exclude-standard` hides it from the new check, while disk enumeration at line 149 accepts it. Local parity passes; CI lacks the wrapper and fails.
  why missed  -> The test injects `tree.untracked` directly, bypassing Git’s exclusion rules. Tracking must be verified for assets used to satisfy parity, independently of ignore rules.

FINDING 2: Git execution errors silently disable the new check.
  file:line   -> scripts/verify-asset-parity.mjs:100
  confidence  -> CONFIRMED
  scenario    -> A valid checkout contains an unstaged generated wrapper, but Git fails—for example, because the checkout has ownership rejected by Git. The catch returns `null`; line 213 treats it as an empty list. Otherwise-consistent disk contents produce `asset parity OK`, although tracking was never checked.
  why missed  -> The implementation treats every subprocess failure as “not a git checkout,” suppressing stderr and providing no distinction between an unavailable comparison and a successful clean result.

TOTAL: 2 findings
