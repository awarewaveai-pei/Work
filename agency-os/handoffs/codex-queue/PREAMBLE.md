# Standing rules for every card (read first, every time)

You are a Codex worker doing ONE task card in the AwareWave repository. The repository rules are in `agency-os/AGENTS.md` (read sections 0, 1 and 6 once per card); this file says what is different for a queued worker. The operator reads plain Chinese; anything a person sees on a page is plain, short Chinese.

## Where you work

- Only in the worktree you were started in (detached HEAD). Never touch `D:/Work` (the main checkout; other sessions edit it).
- Never `git push`, never create a branch, never merge or rebase, never `git stash`, never `git add -A`. Stage literal paths, one `git add -- <path>` per command.
- Never deploy, never run `sg-deploy.sh` or `safe-infra-patch.sh`, never apply a migration to a real database, never SSH to a host, never open a port. If the card seems to need one, stop with `DECISION_NEEDED:`.
- Never print, copy or ask for a password, key or token. Never read `mcp/user-env.ps1` or `AWARE_WAVE_CREDENTIALS.md`.
- No Chinese-vendor AI models or libraries.

## What "done" means (the driver checks these itself, not your word)

1. At least one new commit in this worktree; the worktree is clean afterwards.
2. The commit adds ONE row at the bottom of the table in `agency-os/reports/review-debt.md`: `| Codex | <card id> | one sentence of what changed | the invariants it touches | the tests and mutations that prove it | 待審 |`. Claude reviews it later; the writer never reviews itself.
3. Every `check` command of the card exits 0 when the driver runs it.

## How to work

- Read before you write; cite `file:line` in the commit message for what you relied on.
- Name the invariant and close the whole class, not only the reported instance.
- Write only the tests the card's Acceptance names. Mutation proof only for guards on privacy, visibility, erasure, consent or ownership: remove the guard, the named test goes red, restore, green.
- `.ts/.tsx` changes: `npx tsc --noEmit` green in that app before the commit.
- Do not widen scope: files outside the card's list change only when a test proves it is needed; say so in the commit message.
- Comments: only traps a future reader would step on, 1-3 lines.

## Commit message

`type(scope): <what changed, said as a result>`, then the root cause, the invariants and how each is held, the verification (exact commands and counts), the mutations, and what you did NOT do. End with `Co-Authored-By: Codex <noreply@openai.com>`.

## When you cannot continue

- A product or security decision only the operator can make: stop, leave nothing half-done, end your final message with `DECISION_NEEDED: <one question, plain words, with your recommendation>`.
- The code contradicts the card or a fact in it is wrong: end with `BLOCKED: <what you found, file:line>`.
- Otherwise finish and end with `CARD_DONE <card id>`.
