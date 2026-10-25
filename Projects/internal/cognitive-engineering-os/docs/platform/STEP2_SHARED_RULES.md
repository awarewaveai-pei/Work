# Build step 2 — shared rules (frozen 2026-10-04 before dispatch; not changed mid-way)

Blocks: GATHER 蒐集來源, VERIFY 查證主張, COMPUTE 計算與模擬. Spec = each block's confirmed card in
`agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-supervisor.html` (GATHER in `BLOCKS`, VERIFY and
COMPUTE in `CONTRACTS`). Every rule of `BLOCK_BUILD_GUIDE.md` (step 1) still holds; this file adds what the three share.
A rule here that blocks your card line: build the rest, report it — the supervisor (S) decides; you never change a
file S owns.

## 1. Who owns what

| Owner | Files |
|---|---|
| S | `platform/evidence.py`, `platform/rulesets/__init__.py`, `ai_gate.py`, `block_hooks/__init__.py`, `apps/api/blocks/ai.py`, `doc_kinds.py`, `record_log.py`, `case_docs.py`, `main.py`, `kinds/assembler.py`, `lib/blocks.ts`, `BlockShell.tsx`, the step-1 block pages (MAP/THINK/DECIDE/ACT/LEARN read the new results — S builds that), `lib/errors.ts` (see §9) |
| 甲 GATHER | `kinds/gather.py` (add kinds below the frozen ones), `ai_actions/gather.py`, `block_hooks/gather.py`, `apps/api/blocks/gather.py`, `platform/rulesets/gather.py`, page `GatherPage.tsx` + route, `tests/unit/test_block_gather.py` |
| 乙 VERIFY | `kinds/verify.py` (add below the frozen ones), `ai_actions/verify.py`, `block_hooks/verify.py`, `apps/api/blocks/verify.py`, `platform/rulesets/verify.py`, page `VerifyPage.tsx` + route, `tests/unit/test_block_verify.py` |
| 丙 COMPUTE | `kinds/compute.py` (add below the frozen ones), `ai_actions/compute.py`, `block_hooks/compute.py`, `apps/api/blocks/compute.py`, `platform/rulesets/compute.py`, page `ComputePage.tsx` + route, `tests/unit/test_block_compute.py` |
| 丁 collector wire | next-admin `lib/collect/**` (§4.1), in `main.py` only `IngestSource`, `IngestRequest`, `CollectionCompleteRequest`, `ingest_sources`, `complete_collection`, `_research_seeds`; `specs/wire/collector.v2.json` (examples both sides test against); next-admin `lib/collect/lookups/**` + `app/api/internal/collect/lookups` (§4.2); tests on both sides |

## 2. Words and states (one place: `core/domain/evidence_words.py`, re-exported by `platform/evidence.py`; never retype them)

- A cell on a source card or in the ledger is `{"state": 查到|查不到|無法檢查, "value"?, "why"?}` (`evidence.cell`).
  查不到 = we looked and there is none. 無法檢查 = we have no way to look (no tool, a private group, a blocked channel,
  a registry not on our list, a service that did not answer). An outside service that is down or unconfigured is
  無法檢查 with the reason — never 查不到, never an error page.
- `OWN_WORDS` 「我自己說的，還沒有外部出處」 (MAP already uses it), `SOMEONE_SAID` 「有人這樣說」, `MARKS` 採用／存疑／不用,
  `VERDICTS` 採信／存疑／不採信, `SENTENCE_KINDS` (four kinds in a message), `CLAIM_STATES` (five states of a checkable fact),
  `LABELS` 計算結果／模擬結果.
- `MIN_ORIGINS = 2`. Under two independent origins the system hands control back (GATHER, VERIFY, COMPUTE cards).

## 3. Records other blocks read (frozen shapes; S wrote them; you add your own kinds beside them)

| Kind | Author | Holds |
|---|---|---|
| `gather.source` | system | one source card per stored source (or per page set aside with no text): `source_id`, `url`, `title`, `found_by`, `cells` (keys `CARD_CELLS`, each `cell()`), `lists`, `snapshot`, `archived` (the web archive's first capture, absent = none), `aside`, `rules` |
| `gather.origins` | system | the grouping: `groups` = [{cards, how}] checked with `grouping_errors` before saving; every version stays. No ids: an origin's id is computed from its cards |
| `gather.split` | person | cards the person takes out of a group into their own origin, with a reason |
| `gather.takeback` | person | a set-aside page taken back |
| `gather.mark` | person | one mark per origin: 採用／存疑／不用 + reason (+ 適不適用這裡) + the group's `cards` when marked |
| `gather.override` | person | the person's value for one cell (or `lists`) of one card, with a reason — shown over the system's |
| `verify.claim` | person (AI proposes in its own kind) | one claim: text, sentence kind, law details, where it came from |
| `verify.reading` | AI | the AI's reading: per (claim version, card, snapshot) what the source says (`reads_as`) + the exact quote + citation — never counted |
| `verify.stance` | person | what one card says about one claim version (支持／反對／無關／看不出) as the person reads it or confirms an AI reading (`reading`); only this counts |
| `verify.search` | system | the background search for one claim version ended: 查到／查不到／無法檢查 + why |
| `verify.verdict` | person | 採信／存疑／不採信 + reason for one claim version |
| `compute.run` | system | one calculation actually run: algorithm + version, formula, inputs each with its source, scenarios, result range, the input that flips it, label |
| `compute.adopt` | person | 採用／不採用 one run, with a reason |

A record read per key (`gather.mark` per origin, `gather.override` per card and key, `verify.stance` per claim and card,
`verify.verdict` per claim, `compute.adopt` per run) is one live document per key: the owning block's BEFORE_SAVE refuses
a second; `evidence` resolves a race to the latest save.

Read them only through `evidence.origins()`, `evidence.checked_claims()`, `evidence.calc_results()` (a page: `GET
/projects/{id}/evidence`, `apps/api/blocks/evidence.py`, S's) — the counting
rules live there once, fail-closed:
- an origin counts unless it is still being grouped (a card no grouping has seen: 還在分組), every card in it is set aside
  and not taken back, or the person marked it 不用; cards on one stored page, one snapshot or one address (the URL
  without its #fragment: a fact-check hit and the report page it points at) are always one origin, and so is every
  card chained to them through these;
- a mark applies only to the exact group it was made on (the id is computed from the cards); after a regroup it is
  listed in `marks_on_changed_groups`, never moved;
- only the person's stance counts (a stance is a conclusion: the integrity core keeps the AI out of it; the AI's
  reading waits in `verify.reading` until confirmed); it counts only for the claim's current version and the card's current snapshot;
  older ones are counted as `stale`; a claim is 查不到 only when the search found nothing or every counted origin was
  read for it (else 找到來源，還沒讀完).

**Invariant: a copy is a pointer, never a fact** (written 2026-10-04 after two review rounds kept finding instances of
one class). A count of origins, an 「有來源」 label or a fact brought from another block may be stored as a copy (a MAP
fact's `sources`, a judgment fact, a THINK card's `sourced`), but every reader recomputes it from what the copy points
at (`cards`, `claim`, `rests_on`) through `evidence` on every read, and shows the difference when they disagree. One
rule decides whether a checked claim may stand as a fact anywhere: `evidence.usable_as_fact` (checkable, the person's
verdict on the current version, not 不採信, at least one counted supporting origin) — THINK's 「有來源」 and DECIDE's
bring-in both use it, from the `usable` flag `/evidence` returns. When the person rewrites the words of something that
carried a derived label, the label and its pointer go with the old words. A malformed stored pointer is skipped, never
an error that takes the evidence read down.

## 4. Sources

- The web is searched and fetched only by the collector (next-admin). The engine never calls a search engine.
- What the person pastes (URL, file, screenshot text) goes through the existing `POST /projects/{id}/sources` and gets a
  card with `found_by.by = 我貼的`. Only something someone else published goes there: the person's own words
  (`OWN_WORDS`) and the message being checked (VERIFY) are kept in the block's own kinds, never as a source — a
  message stored as a source would support itself with an exact quote. Each block's tests prove its page cannot do it.
- After sources arrive (every ingested batch, a run's end, a paste), `block_hooks.after_sources(...)` hands the hooks to
  one background pool: one case at a time, `AFTER_SOURCES_ORDER` (GATHER builds cards, then VERIFY writes `verify.search`
  for the claims a run was for). A hook may do slow work directly and never starts a thread of its own; a failing hook
  is logged and the later ones do not run for that arrival. Hooks are idempotent (the run's end repeats the batches).
  Tests call `block_hooks.wait_idle()` before reading what a hook wrote.
- Every snapshot is the stored source row (`content_sha256`, `fetched_at`); a card points at it and never copies the text.
  A new version of a page (same URL, new hash) = a new version of its card with the new snapshot (every version stays).
- A fact-check result (ClaimReview, Cofacts) is a source like any other (VERIFY card): VERIFY stores it with
  `repo.add_source(..., writer=record_log.system("GATHER"))` and calls `block_hooks.after_sources` -- GATHER makes its card.

### 4.1 The collector wire, version 2 (丁 builds both sides; 甲 and 乙 send seeds in this shape)

- Seed for a search: `{"uri": "entity://claim/<short id>", "meta": {"kind": "claim", "entityName": <the question or
  claim, ≤200 chars>, "angles": [...], "languages": ["zh", "en"], "providers": ["serper", "brave"]}}`.
  Angles of kind `claim`: `primary` 原始文件與官方公告, `news` 報導, `factcheck` 查核, `precedent` 前例, `field` 到過現場的人,
  `opposite` 相反的說法, `origin` 最早的出處. Every (angle × language × provider) is its own query.
- Seed for a pasted URL: `{"uri": "https://...", "meta": {"pasted": true}}`.
- Each ingested source (`schema_version: "2"`) carries in `relevance`: `searchProvider`, `searchLang`, `searchQuery`,
  `searchAngle` (absent for a pasted URL), `pasted` (bool), `aside` (why a gate would have refused it, absent if not),
  `imageUrl` (the page's main image), `outlinks` (≤50 hosts it links to; read as every link only per `collector.v2.json` `reading`). A page a gate refuses is sent with `aside`
  instead of dropped, when it has text.
- The run's completion adds `aside`: [{url, title, reason}] (≤200; pages with no text) and `channels`:
  [{provider, lang, state: ok|unreachable|no_key, why}] — both reach `after_sources` as `arrived["aside"]` and
  `arrived["channels"]`.

### 4.2 Lookups, version 1 (amended 2026-10-04: every outside question is asked of collect)

- Registry and archive facts about a page (`describe`) and fact-check databases (`factcheck`) are asked of collect at
  `POST /api/internal/collect/lookups`, contract and examples in `specs/wire/lookup.v1.json` (R1-R9), through the one
  engine module `platform/net/collect_lookups.py` (S owns it). It never raises: collect down or an answer out of shape =
  無法檢查 with why. Lists and thresholds (registries, country names, match share, hit cap) live in collect only.

## 5. The AI and sources

- An AI action that reads sources sets `AiAction.cites = True` and lists `gather.source` in `reads` (never
  `outside_case`). The gate gives the case's cards that are not set aside (each stored page once, ≤12 — the page picks
  with `context["cards"]`), fenced, each as `Cite as: source:<id> (card <card id>)`. Every object in the answer that has
  `citations`, `quote` or `card` must cite only those; its `quote` must be in the cited text (`quote_in`: ≥ MIN_QUOTE
  characters, one normaliser); its `card` must be the cited source's card. Anything else = `AI_ANSWER_UNCITED`, nothing
  saved. An output kind with a `citations` field or a `Field(cited=True)` can only be written by a `cites` action.
- A card line 「交還控制：…AI 停下來」 is `AiAction.handback(context, read) -> str | None`, checked after the crisis check
  (a person in crisis gets help, not a hand-back) and before any model call: `{"handback": reason}`, nothing paid for.
- Someone else's words the person brought (a pasted message) are a stored record whose kind declares `others_words`; an action returns its doc ids from `AiAction.quoted(context, read)` and never puts the words in `build_input`. The gate reads the text itself and adds it after the crisis check, fenced as QUOTED (amended 2026-10-04: a rumour that mentions 自殺 is not the person's crisis signal; no request text can take this way round the check). A case's records are written only while the case exists (`CASE_ERASED`, checked inside the writer's transaction).
- `build_input` and `handback` count through `read.evidence.origins() / .claims() / .calcs()` (only for kinds the
  action lists in `reads`), never by reading the kinds and recounting.
- The AI never writes a source card, a mark, a verdict, a claim the person has not confirmed, or a number.

## 6. Versioned lists and rules (GOVERN keeps the versions)

- Each list or rule a card names (來源名單、分類規則、分組規則、操弄手法清單、查核資料庫名單、算法) is a `Ruleset` in
  `platform/rulesets/<block>.py`: `RULESETS = [Ruleset(name, block, title, version, maintainer, items)]` and
  `HISTORY = {name: {version: fingerprint}}`. Changing items without a new version fails a test.
- Every card, ledger line and run stores `ruleset.stamp()` (name, version, fingerprint); GOVERN's versions page lists
  every ruleset. A recorded HISTORY entry is never edited (a test compares it with the last commit).

## 7. Outside services: none in the engine (amended 2026-10-04)

- The engine reaches only two hosts: the AI provider and collect. Every other outside question is a collect lookup
  (§4.2); a new kind of question = a new lookup kind in the spec (version bump), never engine code. Operator 2026-09-17:
  the platform has no data collection of its own; 2026-10-04, why: each LEGO block is built separately and then chained,
  collect is the searcher block.
- Gate: `test_egress_allowlist_parity` requires the engine's runtime allowlist to be exactly those two hosts (policy
  `EGRESS-EC99-2` is the ceiling for several services and contains them), and `platform/net/` to hold only `egress`,
  `collection_service` and `collect_lookups`.
- Root cause on record: this section first read "one module each under `platform/net/`" and invited four outside
  lookups into the engine (RDAP, Wayback, ClaimReview, Cofacts); they moved to collect the same day.
- Tests never touch the network: a fake lookup client fed from the spec's examples. One real call per lookup is made once
  on the collect side and its result goes in the report.
- A key the platform does not have (Google Fact Check) = that database is 無法檢查 「平台還沒有這個金鑰」.

## 8. Slots, proposals, packages

- A slot lights only by what the person or the AI made (`case_docs.blocks_used`: author user/ai/joint). GATHER's
  background work for VERIFY is written by the system, so GATHER's slot stays dark (VERIFY card). A collection the
  person starts is `CollectionRequested` (not a done type) — it lights nothing either.
- Proposals: `block_hooks.propose(..., "<BY>", "<BLOCK>", WHY_CONSTANT, source=doc_id)`; `assembler.proposal.gather`,
  `.verify`, `.compute` exist.
- S opens GATHER, VERIFY, COMPUTE (`OPEN_BLOCKS`, `BUILD_STEP = 2`) at integration, not before.

## 9. Pages and refusals

- Inside `<BlockShell>`; design-system.css classes; no `<select>`; 400 px without side scroll; plain short Chinese.
- A refusal code your block adds gets its sentence in `lib/errors.ts`: append your codes in one block under a
  `// <BLOCK>` comment at the end of `CODES` (S merges; the coverage test names any code without a sentence).

## 10. Done (per block) and the one full run

1. Every card line built, or one line in `docs/platform/STEP2_CHECKLIST.md` under your block with why.
2. `python -m unittest tests.unit.test_block_<block> tests.unit.test_step2_foundation tests.unit.test_block_foundation tests.unit.test_record_log tests.unit.test_every_paid_call_is_metered` green;
   each refusal the card names has a test; one mutation per guard is red (in your own worktree).
3. `python -m ai_lego.platform.integrity` passes for your block once S opens it (S runs it at integration).
4. `npx tsc --noEmit` and your vitest file green. Do not start dev servers: S checks every page in a browser at 1280 and
   400 wide at integration.
5. Never the full suite: S runs it once at the end.
6. Report: files, each card line → what it became, what is not built and why, test counts, mutations.

## 11. Decided now (S, under her delegation 2026-10-03), so no worker has to

- COMPUTE 「模擬是 AI 權限的一種」: the system runs every simulation; the AI proposing scenarios or an algorithm needs
  `propose_options`; explaining a result or naming the most influential assumption is `organize`. No new permission.
- 「交還控制」 is the system's: `handback` returns the reason; the page shows the count and a button to go on anyway,
  which sends `context["go_on"] = true` (the handback function honours it).
- Search engines: the platform's account is Serper (Google results; key on the host and in `user-env.ps1`; the operator
  chose it 2026-09-20). Serper and Brave are the only engines — no other in any seed, none as a
  fallback. Brave has no key: it is a `no_key` channel, so a run today has one engine and the page says 「管道不足：只用了
  Serper 一家」; the person decides to go on (the card's stop, honoured). A second engine later = a key, no code change.
- Languages: the collector searches 中文 and English only. A place whose language is neither is 「管道不足」 with that
  reason (a STEP2_CHECKLIST line), never a silent search in the wrong language.
- 社群上怎麼傳開、有沒有很多帳號一起貼: the platform has no social-network data. The system writes 無法檢查
  「平台沒有接社群平台的資料」; the person can write what they saw (their own words, never counted as a source).
- Reverse image search, content credentials (C2PA), 「是不是 AI 生成」: no tool in step 2 → 無法檢查 / 無法判定 with the reason.
