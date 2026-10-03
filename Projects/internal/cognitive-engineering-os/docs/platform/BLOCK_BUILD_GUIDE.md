# Block build guide (Cognitive Sovereignty Platform, build step 1)

Spec = the block's confirmed contract card: `agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-supervisor.html`
(BLOCKS / CROSS, 12 fields). The task brief points at a plain-text dump of the 12 confirmed step-1 cards.
A card line = one requirement. Build every line; a line you cannot build yet goes in `docs/platform/STEP1_CHECKLIST.md` with why.

Template = SENSE. Copy its shape, never its content.

## Where things go (one file per block per layer; no shared list is edited)

| Layer | File | Holds |
|---|---|---|
| What the block keeps | `ai_lego/core/domain/kinds/<block>.py` | `KINDS = [DocKind(...)]` — the card's 「寫什麼」 |
| AI turns | `ai_lego/platform/ai_actions/<block>.py` | `ACTIONS = [AiAction(...)]` — the card's 「AI 能做什麼」 |
| After-save rules | `ai_lego/platform/block_hooks/<block>.py` | `AFTER_SAVE = {kind: fn}` — proposals (提議加哪一塊) |
| Extra routes (only if the generic ones do not fit) | `ai_lego/apps/api/blocks/<block>.py` | `router = APIRouter()` |
| Page | `apps/cognitive-web/components/blocks/<Block>Page.tsx` + `app/(shell)/projects/[id]/<path>/page.tsx` | inside `<BlockShell>` |
| Tests | `tests/unit/test_block_<block>.py` (+ `components/blocks/<Block>Page.test.tsx` if logic is non-trivial) | |

Discovery is by import: a new module in those packages is live. Never edit `record_log.EVENT_TYPES`, `main.py`, `lib/blocks.ts`,
`BlockShell.tsx`, `case_docs.py`, `ai_gate.py`, `doc_kinds.py` — those are the supervisor's. Need a change there → say so in your report.

## Rules every block keeps (enforced; do not work around)

- Writes go through `CaseDocs` (generic routes `/projects/{id}/docs/{kind}`, `/me/docs/{kind}`). Never SQL on `events`
  (`test_record_log.OneEntryTests` greps for it).
- `DocKind`: a field only the person writes (結論、依據、信心、什麼會改變它…) = `Field(human_only=True)`; such a kind has
  `authors={"user"}`. AI output = its own kind with `authors` incl. `"ai"`; the person confirms/rewrites via a `<block>.review` kind
  (see `sense.review`). AI never writes into a person's kind.
- Versions: every save is a new version; `deletable=False` when the card says 每一版都留著 (judgments, maps).
- AI: only through `AiAction` + `/projects/{id}/ai/{BLOCK}/{action}`. `needs` = the permission (`collab_contract.ALWAYS` or `GRANTABLE`);
  `reads` = exactly the card's 「讀什麼」 kinds (other reads are refused); `person_text` returns the person's words (crisis check).
  Instructions say only what this action asks; `ai_gate.PREAMBLE` already carries the shared don'ts.
- A proposal to add a block: `block_hooks.propose(docs, tenant, owner, "<BY>", "<BLOCK>", why)`; the kind
  `assembler.proposal.<by>` must exist (today: sense, map, decide, learn — need another → report it).
- Crisis words in any saved text already return a crisis notice; a guardrail is written only by GOVERN (`govern.guardrail`, author system).
- Owner check: every route goes through `main._project_or_404(repo, session, project_id)` (only the case's creator).
- No score/rank/rating keys anywhere in a payload (refused).
- UI: design-system.css classes only, no inline style, no colour literals, no `<select>` (visible chips/buttons), plain short
  Chinese, every AI text tagged with `AUTHOR[doc.author]`, works at 400px with no horizontal scroll.

## Done = all of these

1. Every line of the card is built, or listed in STEP1_CHECKLIST.md with the reason.
2. `python -m unittest tests.unit.test_block_<block> tests.unit.test_block_foundation tests.unit.test_record_log` green; your
   tests cover each refusal the card names (AI may not…, reads only…, person-only fields) and one mutation per guard is red.
3. `npx tsc --noEmit` green in `apps/cognitive-web`.
4. Page checked in a real browser against the local stack (API :8420, web :3930) at 1280 and 400 wide, no page errors.
5. Report: files, what each card line became, what is not built and why, test counts.
