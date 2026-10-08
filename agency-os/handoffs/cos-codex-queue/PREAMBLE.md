# Standing rules for every card (read first, every time)

You are a worker continuing the cognitive platform build (engine `Projects/internal/cognitive-engineering-os`, below COS; web `COS/apps/cognitive-web`; collect = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect`). The operator is non-technical and reads only plain Chinese; everything a person sees on a page is plain, short Chinese, one idea per sentence, no coined nouns. The service that looks things up is always 「找資料的服務」.

## Where you work

- Only in the worktree you were started in (detached HEAD). Never touch `D:/Work` (the main checkout, other people edit it).
- Never `git push`, never create a branch, never merge or rebase onto anything, never `git stash`, never `git add -A`.
- Stage with literal paths, one `git add -- <path>` per command (a variable in the path makes the commit guard refuse it).
- Never deploy, never apply a migration to a real database, never touch a remote host, never open a port. Those are High-STOP: if a card seems to need one, stop with `DECISION_NEEDED:`.
- Never print, copy or ask for a password, key or token. Credentials live in `mcp/user-env.ps1`, only the operator reads it. Never touch `AWARE_WAVE_CREDENTIALS.md`.
- No Chinese-vendor AI models or libraries. Never Perplexity. Search is Serper (Brave has no key).

## What "done" means for a card (the driver checks these itself, not your word)

1. At least one new commit in this worktree; the worktree is clean afterwards (no uncommitted or untracked file).
2. The commit adds ONE row at the bottom of the table in `agency-os/reports/review-debt.md`, in the same commit: `| Codex | <the card id> | one sentence of what changed | the invariants it touches | the mutations and gate tests that prove it | 待審 |` (the hash does not exist yet: the card id is the key; the driver records the hash). The reviewer is not the author: Claude clears these rows later.
3. Every `check` command of the card exits 0 when the driver runs it.

## How to work (non-negotiable)

- Read before you write. For every claim about the code, open the file. Cite `file:line` in your commit message for what you relied on.
- Name the INVARIANT of the problem, then close the WHOLE class, not the one instance. A fix that only makes the reported case pass is a patch; rework it.
- No tests without benefit (operator's rule): write the tests the card's Acceptance names; run only `python scripts/affected_tests.py --run` plus the card's `check` commands. MUTATION proof only for guards that protect privacy, visibility, erasure, consent or ownership (who can see or change whose data): remove the guard, run the named test, it must go red; restore, it must go green. Do this in a throwaway copy or restore immediately (sha256 equal), and clear every `__pycache__` before each run (a stale .pyc hides a mutation). Write the mutation list into the commit message.
- Where a whole class can be closed by a scan, write a gate test that reads the source (like `tests/unit/test_egress_allowlist_parity.py`, `HooksReadOnlyTests` in `tests/unit/test_step2_foundation.py`).
- Run tests one module per command: `python -m unittest tests.unit.<module>` from COS. Never one giant batch. Web: `npx tsc --noEmit` and `npx vitest run <file>` in `COS/apps/cognitive-web`. Collect: the same in `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`.
- Tests that touch the database run on a real PostgreSQL through `COS/tests/pg.py` (the driver may export `COGNITIVE_OS_TEST_DATABASE_URL`); a skipped database test is not a pass.
- Three fixes on the same code from the same reviewer: stop and write the invariant analysis first.
- Do not widen scope. Files outside the card's list change only when a test proves it is needed; say so in the commit message.
- Comments: only traps a future reader would step on, 1-3 lines. History and reasoning go in the commit message.
- No lorem ipsum, no placeholder strings in anything a person can see.

## Commit message

`type(scope): <what changed, said as a result>` then: the root cause (one paragraph), the invariants and how each is held, the verification (the exact commands and counts), the mutations (guard -> test -> red/green), what you did NOT do. End with `Co-Authored-By: Codex <noreply@openai.com>`.

## When you cannot continue

- You need a product or security decision only the operator can make: stop, write nothing half-done, end your final message with `DECISION_NEEDED: <one question, plain words, with your recommendation>`.
- The code contradicts the card or a fact in the card is wrong: end with `BLOCKED: <what you found, file:line>`.
- Otherwise finish the card and end with `CARD_DONE <card id>`.

## Facts that stay true (do not re-decide)

- A copy is a pointer, never a fact: counts and labels are recomputed from what they point at (`evidence.origins()`, `evidence.checked_claims()`).
- The AI never fills a conclusion, a count of independent origins, a number, or a verdict; the person's own act does. The AI may cite only a case's stored source cards, and a quote must be found in the stored text.
- Someone else's words (a pasted message) reach the model only through `AiAction.quoted` after the crisis check.
- Nothing is written to an erased case (`CASE_ERASED`); an erase never waits for a hook.
- The engine reaches only the AI provider and collect, and only `platform/net/egress.py` opens connections.
- `evidence_words.cell`: 查到 carries a value; 查不到 and 無法檢查 carry a reason and no value.
- One term for the lookup service: 找資料的服務.
- Storage is PostgreSQL per region (`COS/docs/platform/STORAGE_SWITCH.md`); one dialect.
- The reference rules of steps 3 and 4 are in `COS/docs/platform/STEP34_SHARED_RULES.md` once it exists (a card says when it is required reading).
