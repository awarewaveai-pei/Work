# Build step 1 — what is built, what is not yet (one line each; the card line it comes from in 「」)

Owners: S = supervisor session; 甲 MAP+規範與脈絡; 乙 THINK+協作合約; 丙 DECIDE+ACT+LEARN; 丁 GOVERN+完整性核心.

## Foundation (S) — built 2026-10-03
- one write entry `record_log.append`: author / block / owner / per-type version / no score keys; erasure by owner
- a case is read only by its creator (`main._owned_project`), custom workflows only by their maker
- documents (`doc_kinds`, `case_docs`, `/docs` routes), AI gate (`ai_gate`, `/ai` routes), hooks, proposals route
- basic crisis stop + TW/international help (`platform/safety`) — 丁 extends
- built (S): 「呼叫 AI 的兩條路共用同一個權限檢查…命令列那條…要讀案子，一樣要過權限檢查」 — nothing on the command-line path (importers of `ai_execution/gateway.py`) can reach a case store, checked over the whole import graph (`test_block_foundation.AiPathTests`); a command line that needs a case calls `ai_gate.ask_ai`
- NOT YET (S, second wave): the existing tool runs (`main.py` analyses / recipe runs) call the model on a case without the case's 協作合約 check; they move onto `ai_gate` together with 「你先寫，AI 才回」
- built (S): 開案 page (`/projects/{id}/start`): purpose (7, unopened ones show their step), package, reorder/skip, places; high-risk words in the risk add GOVERN's guardrails; proposals stay until answered (`assembler.answer`)
- built (S): 「現在在哪一塊、為什麼在這一塊、下一塊做什麼」 on every block page (`BlockShell` Where/GoOn from GET `/projects/{id}/route`: the intake's order, then accepted proposals); 「你看得到哪幾格做過」 (✓ on the 14 slots); a block already in the case is never proposed again, one standing proposal per block; only the shell links 下一塊 (test_only_the_shell_says_which_block_is_next)
- built (S): 「你同意才加…還沒蓋好…不能加」 on the server: an answer names a proposal of this case, one answer per proposal, 加 only a built block (`block_hooks.BEFORE_SAVE`); 不用 = not proposed again in the case; a proposal's words are the block's own fixed words, the triggering doc by id only (ProposalWordsTests) -- a quote would outlive a deleted card
- built (S): 做過 = event types marked `done` in record_log (a result, a document, a task; never a request, a failure or a tombstone)
- built (S): the AI gate sends the contract's scope / human_parts / basis / handback with every turn and crisis-checks them with the rest; object answers go through `ai_gateway.structured` like every other
- built (S): one high-risk scanner (GOVERN's hook); what is not the person's words is said on each kind's fields: `labels` (system words: claim kinds, facet names, the eight asked influences), `scan=False` (places, what the system listed), `unread_keys` (a fact's place)
- built (S): a person's record made from one case (`DocKind.from_case`: LEARN's 個人歷程 line) is erased with the case
- built (S): a crisis signal across two lines, or in a json key, is read; outside a case crisis help comes without 「開一個案子」
- KNOWN LIMIT (S, critic m4): two saves at the same moment can each record a proposal for the same block (check and insert are not one transaction); the person answers both, nothing is lost
- fixed (S, critic M1, 3f26fc502): project name key is (tenant, workspace, creator, name)
- fixed (S, critic M2, 3f26fc502): recipe-run journals live in the runner's folder; erasing a case erases its runs and artifacts
- KNOWN LIMIT: next-admin opens cases as one service identity, so its operators share ownership (critic m6)
- GOVERN 丁: account deletion erases person-owned rows, workflows and runs: built, see the GOVERN section below

## GOVERN + 完整性核心 (丁) — built 2026-10-03
- 「你可以匯出自己的資料」 built: `GET /projects/{id}/govern/export`, `GET /govern/export` (JSON + Markdown; every record with author + block; recipe runs and their artifacts included); pages: case 護欄與匯出頁 `/projects/{id}/govern`, 設定頁 `/settings`
- 「你也可以完整刪除」 built: `POST /govern/account/erase` (cases through the case erase path, runs on no case, person records, workflows, then the identity; one empty tombstone stays; confirm phrase from the API; page confirms twice; 409 while a case or run is still running, a retry finishes)
- 「清楚的非治療定位」 built: `safety.NOT_THERAPY` via `GET /govern/help`, shown on `/help` and `/settings`; `components/blocks/GovernParts.tsx NotTherapyNotice` is the piece for 「你開始的地方」 -- placing it on 開案 and 我的專案 is a shared-file change (report)
- 「危機轉介」 built: `/help` (open without login) + the AI gate and every save give help for the place in the case's intake or the account's 「你在哪裡」; Taiwan lines + international only (step 3 adds places)
- 「高風險的案子，系統自動加護欄」 built: `block_hooks/govern.py` on every watched block's person-written documents (category + block only, never the words; places and system-listed influences not scanned); the intake's risk goes through the assembler's own hook; with no case the save answers a `suggest_case` notice (rendering it on the daily-calibration page = 丙 / shared `Notice` type)
- 「GOVERN 把這個案子加了哪些護欄」 built: guardrails view on the case page; the AI's stops are listed beside it
- 「你可以查這個案子用了哪個模型、哪一版規則」 built: `/projects/{id}/govern/versions` (AI calls with model + instructions hash; the rules in use as fingerprints; the record kinds held with their definition fingerprint)
- 「AI 解釋設定是什麼意思」 built: `GOVERN.explain` (no case; reads nothing the person wrote)
- 「每一塊積木上線前…一條一條檢查」 built: `python -m ai_lego.platform.integrity` (20 checks per block, each with what it proves and does not; exit 1 when an open block fails; rules versioned in `RULES_HISTORY`, a test fails when they change without a new entry)
- NOT YET (step 3, by the card): 同意與撤回、研究同意、申訴與對帶領者的異議、在地化（其他地方的求助電話與語言）、成效衡量十項、不留紀錄／只留本機、防假帳號與協同帳號帶風向、研究資料拿掉帳號和三個地點
- NOT YET: 「來源名單、分類規則、分組規則、操弄手法清單、查核資料庫名單」的版本 -- they arrive with GATHER / VERIFY (step 2); step 1 versions the AI instructions, the model of each call, the crisis and high-risk word lists, the record kinds and the integrity rules
- NOT YET: 「不用中國廠商的 AI 模型併進這裡」 -- the gateway has one provider and no model list; the list and its check come in step 3
- NOT YET: 「規則檢查」 written as platform records -- the check result is printed for the launch step (text / JSON); `DocKind` has no platform owner yet
- NOT YET: 「你可以對任何一條規則提出異議」 (appeals, step 3)
- NOT YET: 「影響清單：AI、這次的拆法、平台本身一定在清單上」 checked by the core -- only that the judgment card keeps the system's list apart from the person's; the content is DECIDE's at run time
- LIMIT: runs started before 2026-10-03 sit in the tenant folder with no owner on record -- neither exported nor erased with the account (`main._run_journal`)
- LIMIT: a recipe run written with journal protection keeps its context as ciphertext in `workflow-cas`; erasing a case or an account removes the journal, not that blob (the deletion screen says so when it applies); fix = one helper in main.py used by `_erase_case_runs` and account deletion
- LIMIT: artifact blobs are content-addressed; erasure deletes by reference without counting other references, so identical content held by two people is one blob
- LIMIT: a second tab can open a case while the account is being deleted and keep it; closing it needs a `deleting` status on the identity that `require_session` refuses
- LIMIT: the account export carries what the person owns in `projects.sqlite3`, the workflows file and the run folder; `collection_runs` rows (GATHER, step 2) are not exported separately, only their events

## MAP (甲) — built 2026-10-03
- six layers each with its question and what it hands over; pick a 拆法 from the 116 tools of the MAP families (search chips, only ones not used in this case), or ask the AI (organize) for up to 3 with a reason; the tool and its version are kept with the map; one line per layer first; skip a layer
- cards into layers by your hand, the AI suggests a layer per card (organize) and you confirm; a feeling, fear or story is never offered as a fact (page + prompt)
- facts show their source count; yours = 「我自己說的，還沒有外部出處」; one source or none stands out; each fact keeps 「在哪裡發生」; a thin outside fact is held back from the AI until you allow it, here and in CONTEXT (CONTEXT has no allow button)
- claims: you mark, or the AI proposes and you confirm, then four columns 事實／法律／價值／文化宗教 with each kind's own detail fields; a law claim without 法域, 時效 or 來源 reads 未確認; 文化宗教 asks for your own understanding before it counts
- 「解不了的局」 8 questions with Farrell's examples + his two reasons; the reading after them is marked ours; the 「解不了的局」 flag is only yours
- core conflict is `human_only`; interests listed per group (the intake's 誰會受影響 first); empty layer and thinnest layer marked by the page (counts, no model call); other readings (needs `propose_options`); gaps, assumptions each tagged who wrote them
- every save is a new version, none deletable; two versions side by side; what you took or dropped of an AI offer is kept (`map.review`); context lens opens from every layer
- hooks: new gap → GATHER, first use of a 拆法 in the case (the old analysis path counts) → TEACH, new checkable claim (事實／法律) → VERIFY, each only for what is new since the last version; high-risk words → GOVERN guardrails, crisis words inside the json lines → help
- NOT YET: 「分到六層的來源卡」 and source counts from source cards — GATHER opens in step 2; today a fact is yours (count 0) and a counted outside fact can only come from step 2
- NOT YET: 「你換方法再拆時，這一步也讀 LEARN 的回顧」 — LEARN's kinds are not built (丙); MAP reads no `learn.*` yet
- NOT YET: 「你選哪一版地圖給帶領者看，記在 GOVERN 的同意紀錄」 — needs FACILITATE (step 4) and GOVERN's consent record (step 3)
- NOT YET: 「工具進了這一塊…你先寫，AI 才回」 — the 116 tools still run the old way (AI first); picking one here links to its page
- KNOWN LIMIT: the model is recorded per AI call (`govern.ai_call`), not per map version; `by` on a line (我／AI／共同) is set by the page, the generic save route cannot check it
- KNOWN LIMIT: `map.map.method_version` is copied by the page from the server's tool list, not stamped by the server

## 規範與脈絡 CONTEXT (甲) — built 2026-10-03
- 15 facets with their one-line meaning, from one versioned list (`FACETS_VERSION`, saved with each note); tick 有關／無關; two questions for each facet that matters; 文化 and 宗教 ask for your own understanding first; add your own facet (kept in your notes) or delete one you added
- places read from the intake and never asked again; 適用哪裡的法律 = places you pick plus your own, several allowed, none chosen for you; each law claim from the map shows 未確認 until it has 法域, 時效, 來源
- four checks: 權利／義務, 規範從哪來, 你的暫定立場 (4 kinds + reason + when to recheck); the third (事實／法律／價值) is MAP's columns and the page says so; the 5 public-issue questions only for the 公共議題判斷 package
- the AI only points at facets not looked at yet (`point_gaps`, always allowed), reads no notes, no stance, no country; MAP's AI reads the ticked facets and the jurisdictions, never the stance (test)
- hook: high-risk words in your notes (a facet you named counts, a built-in facet label does not) → GOVERN guardrails; crisis words inside the facet notes → help
- NOT YET: 「認知作戰／資訊戰的定義、對方目標、打的弱點」 (the long text, 851–859) — lesson content for TEACH (step 4); the page carries the facet's one-line meaning only
- NOT YET: 「哪些法規管得到」 10 tools — stay in the tool catalog and run the old way; the page does not list them; 「你先寫，AI 才回」 as above
- NOT YET: 「各地可以加自己的面向」 shared across cases or places — a facet you add lives in that case's notes
- NOT YET: 「註記也交給 DECIDE，放進判斷卡的『規範脈絡』那一格」 — DECIDE (丙) reads `context.notes`
- built (S): 「每次呼叫 AI 時，系統把發生地和你在哪裡交給 AI；你在協作合約裡可以不給」 -- given unless `collab_contract.terms.hide_places`; an action whose card reads more names it (`AiAction.places`: CONTEXT adds 當事人各在哪裡)
- NOT YET (S, critic m1): 「只推薦這個案子還沒用過的拆法」 is enforced by the page and the AI's input list (the client sends `used`); the AI turn cannot read the map's older versions or the old tool runs to filter on the server

## SENSE (S) — built 2026-10-03
- cards (9 categories), edit/delete, groups by drag, timeline, relation links, emotion name + origin + from whom
- strongest emotion + intensity + 4 regulation ways; AI mirror (summary, gaps, explore with the 7 signal questions, one question); confirm / rewrite / drop
- hearsay → proposes VERIFY (recorded; VERIFY opens in step 2)
- NOT YET: 「你用打字或講話寫卡…講話的錄音在我們自己的主機上轉成文字，轉完就刪」 voice input (needs the offline STT on the host)
- NOT YET: 「藝術反思的工具…沒寫停止訊號的，先不給你用」 and 「工具進了這一塊…你先寫，AI 才回」 — the 16 art tools still run the old way
- LATER BY DECISION: 藝術外化 (2026-10-03), 帶領者看哪幾張 (FACILITATE, step 4), 研究同意 (GOVERN step 3)

## THINK 共思考 (乙) — built 2026-10-03
- round: you write the problem and your own version (>=1 of the six own items) first; the API refuses an AI turn for a round without one (`THINK_OWN_VERSION_REQUIRED`, `ai_actions/think.py` `_round`); the one exception is 「直接取得建議」, which needs the contract's `direct_advice`
- 9 AI turns = 7 roles x 6 modes (mirror, diverge, counter, audit, socratic, ask_conclusion, criteria, look_back, direct_advice); the 7 command cards are one click for mode + role; a turn the contract does not grant is disabled with the reason and refused by the engine
- diverge 8-15 directions with >=4 named methods; counter aims at the own item you mark; every AI card has the five fields, its author and 「它自己說的」 (forced by `shape`); advice carries premise + how it may fail; a hand-back replaces advice with one question; the AI asks one question at a time (kept to the first)
- you react (共鳴/反感/不理解, 反方 cards also 修正/維持/暫停) with a reason, pick three **per round** (refused by the server: `block_hooks/think.py` BEFORE_SAVE `THINK_PICK_LIMIT`), add >=2 own cards (counted on the page, not blocking), write the reflection (human-only); 25-minute 7-phase timer (client-side, can be turned off); reminder when the latest picks are AI cards taken unchanged (from the reactions' versions + the card's author)
- `think.reaction` {card, reaction, reason, stance, picked} = your own record pointing at a `think.card` (authors user only; one live reaction per card, fixed to its card; the card must be in this case); `think.card` keeps only the words, so an AI card stays 「AI 寫的」 until you change its words (then 共同). **DECIDE / LEARN read picks and reactions from `think.reaction`, never from `think.card`:** a pick = a reaction with `picked: true` whose `card` is a live `think.card` doc_id; the card's `round` says which round
- own version and AI version apart (`think.round.own` vs `think.reply`/`think.batch`/AI-authored `think.card`); model + instruction hash per call = `govern.ai_call`; high-risk words in a round or card ask GOVERN for guardrails
- NOT YET: 「有查證時…VERIFY 的主張帳本」, 找外部資料, 「有來源」 -- GATHER/VERIFY open in step 2, so every AI card is 「它自己說的」
- NOT YET: 「AI 不排序，除非…准了」 -- THINK has no ranking turn (the three picks are yours); `rank` stays grantable for blocks that use it
- NOT YET: 「回顧與遷移提示」 -- LEARN's (only it reads across cases)
- NOT YET: 「你選哪幾張思考卡給帶領者看，記在 GOVERN 的同意紀錄」 -- FACILITATE step 4 + GOVERN step 3
- NOT YET: 「現有工具 32 個…你先寫，AI 才回」 -- the 22 + 10 tools still run the old way (AI first)
- NOT YET: 「理由與信心軌跡…權重、信心」 -- every round and card version is kept (first assumption, reasons); weight and confidence are DECIDE's judgment fields
- NOT BUILT: 「對每項重要建議顯示…信心」 -- the card shows source, premise and how it may fail; a confidence the model states about itself is an unchecked number, so none is asked for
- KNOWN: the pick limit and the one-reaction-per-card rule check then insert in separate transactions, so two saves at the same moment can pass both (one person, one page: not reachable from the UI)
- KNOWN: deleting a card through the API alone leaves its reaction (and the reason text) behind -- there is no delete hook; the page removes a card's reaction with the card, and a pick on a gone card counts for nothing

## 協作合約 (乙) — built 2026-10-03
- built: 「你也可以不讓 AI 知道發生地和你在哪裡」 as one visible switch beside the five permission chips (`hide_places` on the contract, not a permission; the engine side is S's); the one-line summary says when it is on
- built: five fields; permissions as toggle chips in the card's words; every save = a version, listed with what it changed; `CollabPermissions` (the AI's permissions in one line) and `AskBeforeBlock` (asks once per block entry per case) exported from `components/blocks/CollabPermissions.tsx`
- built (S): `CollabPermissions` (one line, 「畫面上一直看得到 AI 現在的權限」) and `AskBeforeBlock` on every block page (BlockShell); KNOWN LIMIT: AskBeforeBlock remembers its answer in the browser, so another browser asks again
- built (S, cd71058f1): 「它讀：你填的五格」, 「人不可委託的部分」, 「交還控制的條件一到，AI 就停下來」 -- the gate sends scope, human_parts, basis and handback and tells the model to stop at the hand-back condition (an instruction: whether it is met is the model's reading)
- NOT YET: 「找外部資料」 is grantable and shown, but nothing uses it until GATHER (step 2)
- 「AI 也不准做」 list: `ai_gate.PREAMBLE` carries no conclusion / sources apart / no law from memory / no position as the neutral one; the guardrail `professional` carries 「高風險提示專業支持」; alternatives to your story are THINK's diverge (替代假設) and counter turns; reject/override with a reason = the card reaction and `think.response`

## DECIDE (丙) — built 2026-10-03
- judgment card: 11 cells + confidence + 「什麼會改變結論」 required (「沒有」 accepted, flagged 這一版不打算改) + 4 stop questions + Farrell's 4 checks + intensity (SENSE's strength shown, its cards not) + influence list (system's, asked 8, yours: kept apart, stored with the version) + 「這次沒做查證／計算」 + versions side by side + 「現在先不決定」 + 「現在我要自己下結論」 (no new AI answer for that version); unwinnable map → 退出／止損／換目標; COMPUTE / COLLAB proposals (fixed words, COLLAB marked guardrail); guardrail → ask to wait / have it reviewed
- NOT YET (VERIFY, COMPUTE: step 2): 「沒有查證或計算時，…標「這次沒做查證」」 the two marks always show; when those blocks open, DecidePage must read what they hand over and drop a mark only then
- NOT YET (COLLAB: step 3): 「多人時，這一步讀 COLLAB 群組紀錄裡的共同判斷和異議」
- NOT YET (EXPRESS: step 4): 「判斷卡也交給 EXPRESS」 — EXPRESS reads `decide.judgment`; nothing to build here
- NOT YET: 「現有工具 14 個…工具進了這一塊，要照這份合約走：你先寫，AI 才回」 the 14 decision tools and 6 business workflows still run the old way (AI first)
- DECISION: 「有人帶的時候，帶領者也一定在清單上」 the intake has no facilitator field, so the page reads the case's block list (FACILITATE; opens in step 4)
- DECISION: 「地圖上別人的聲音」 a map item carries only the card's id, so the page reads SENSE cards to learn the category of the cards already on the map; no other card is shown
- built (S): a proposal marked as a guardrail shows 護欄 on its card (BlockShell)
- built (S): every refusal code has its sentence in lib/errors.ts (judgment-errors.ts folded in; test_every_refusal_a_block_can_give_has_a_sentence)

## ACT (丙) — built 2026-10-03
- task card (prediction first, due, risk, stop / escalate conditions, owner, irreversible, whose wish, hold under the guardrail), notes (4 cells + numbers, trend from 2 points), status as buttons, history with quick flips folded (10 min window, all kept), weekly-then-月/季/年 reminders (`GET /me/reminders`, `/projects/{id}/act/reminders`), AI split / flag / trend
- built (S): 「提醒出現在「我的案子」首頁」 -- RemindersPanel on the case list
- NOT YET: 「也可以選寄 email」 (noreply@aware-wave.com, a link and no case content) for ACT / LEARN / practice reminders
- NOT YET (S): 「⑦ 存成任務」 (TaskCreated events) stays as it is; it should also write `act.task` (needs a prediction the ⑦ row does not carry -- second wave, with 「你先寫，AI 才回」 for the old tools)
- NOT YET (VERIFY, COMPUTE: step 2; COLLAB: step 3): reading their results and group actions; handing observations to COLLAB
- NOT YET: 「現有工具 22 個…你先寫，AI 才回」 the 22 planning / small-trial tools still run the old way

## LEARN (丙) — built 2026-10-03
- review (`learn.calibration`: outcome, prediction vs result, missed, Farrell's 4, step vs direction, process apart from luck, done-when, trust in 5 aspects, delegate note, decision, new conditions, other method, next blocks, wrong sources), side by side with what the AI said and whether you took it, own moves (成長九項, no score), cross-case hint, revisit day (no ACT), AI compare; outside a case (`/me/learn`): daily card + AI mirror, the two practices, sprints, habits
- NOT YET (GATHER: step 2): 「你標錯的出處交回 GATHER，存在那個出處的來源卡上」 stored in `learn.calibration.wrong_sources`; GATHER shows it when the same source comes back
- NOT YET (MAP reads `other_method`; DECIDE shows `updated_conditions` already): MAP's side of 「要換方法時，交回 MAP」 is 甲's page
- NOT YET: 「引擎裡有三個模組：預測追蹤、信心校準、決策日誌」 stay CLI-only; the page puts prediction and confidence beside the outcome by hand, computing no calibration number
- NOT YET: 個人歷程「哪些事交給 AI 可靠」 is kept per review (`delegate_note`, `trust`); no cross-case roll-up
- NOT YET: 「現有工具 11 個…你先寫，AI 才回」 the 11 look-back tools still run the old way
