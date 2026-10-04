# Build step 2 — what is built, what is not yet (one line each; the card line it comes from in 「」)

Owners: S = supervisor session; 甲 GATHER; 乙 VERIFY; 丙 COMPUTE; 丁 collector wire. Rules: `STEP2_SHARED_RULES.md`.

## Shared (S) — 2026-10-04
- built: the words and the three states of a cell, once (`core/domain/evidence_words.py`); the counting rules once (`platform/evidence.py`: `origins`, `checked_claims`, `calc_results`)
- built: the records other blocks read (`gather.source`, `gather.origins`, `gather.split`, `gather.takeback`, `gather.mark`, `verify.claim`, `verify.stance`, `verify.search`, `verify.verdict`, `compute.run`, `compute.adopt`)
- built: 「首版 AI 可以引用外部資料，但只能引用 GATHER 找回來、有來源卡的；AI 自己記得的不算」 -- `AiAction.cites`: the gate gives only the case's cards not set aside, fenced; a citation outside them or a quote not in the cited text = nothing saved (`AI_ANSWER_UNCITED`); a source's words are added after the crisis check
- built: 「交還控制：…不到兩個時，系統停下來」 -- `AiAction.handback`: no model call, the reason goes back to the page
- built: 「名單和規則改版時，由 GOVERN 記錄」 -- `platform/rulesets`: a list changed without a new version is refused; GOVERN's versions page lists every ruleset
- built: sources arriving (every ingested batch, a run's end, a paste) run the blocks' `AFTER_SOURCES` hooks in one background pool, one case at a time, GATHER first; a failing hook is logged, stops the later ones for that arrival, never fails the paste or the collector's callback
- built (critic 2026-10-04, 1C/14M): the counted card is the cited source's card and every object that quotes or names a card cites; an output kind with citations is written only by a citing action; the crisis check comes before a hand-back; hand-backs count through `read.evidence`; a stance counts only for the claim version and page snapshot it was read from; one stored page or snapshot is one origin; a card not grouped yet is not counted; an origin's id is its cards, so a regroup never moves a mark; 查不到 only when every counted origin was read; the person can rewrite the AI's stance (joint); the person's classification is a record (`gather.override`); a ruleset stamp carries its fingerprint and a recorded version is never rewritten; one quote normaliser with a minimum length
- DECISION: the person's own words and the message being checked are never stored as a source (a message stored as a source would support itself); enforced by each block's page and tests, not by the sources route
- NOT YET (S, at integration): LEARN's 「你標錯的出處」 is free text today (`learn.calibration.wrong_sources[].source`); LearnPage must pick a card or origin so `origins()[].wrong_in_review` can match it
- KNOWN LIMIT: the hooks' per-case lock is in-process (the API runs one uvicorn worker: Dockerfile CMD); a second worker would need the file lock (`platform/workflow/run_lock.py`)

## GATHER (甲)
- built: 「替每一筆記下：從哪個管道、用哪句查詢找到的」「系統查每個來源是誰辦的」「每一格都寫三種之一」 -- `block_hooks/gather.py` AFTER_SOURCES: one `gather.source` per active stored page (a new version of its card when the page comes back with a new hash), one per page set aside with no text; registry and archive cells from one `collect_lookups.describe` call per run (collect answers, `specs/wire/lookup.v1.json`), the rest from a versioned list (`platform/rulesets/gather.py`) or the page itself; `found_by` from wire v2 `relevance`; idempotent
- built: 「同出處分組」「怎樣算同一組的規則寫出來，標明第幾版」「改寫過拿不準標可能同出處」「分組不是刪除，你可以拆開」 -- `gather.origins` (同一篇／可能同出處／同一張圖／只互相引用, rule `gather.grouping` v1 on the page); `gather.split`; 「原始的還是轉貼的」 read off the grouping and first-seen dates
- built: 「放一旁…你可以拿回來」「放一旁的不算進出處的數量」「網頁被改過核對碼會不一樣，被刪了存的那一份還在」「來源分佈」「管道不足，系統停下來讓你決定」「發生地的語言一筆都找不到時，系統停下來問你」「獨立出處不到兩個時，系統停下來」 -- page `/projects/[id]/gather` + `GET /projects/{id}/gather`; the AI's summary and comparison hand back first (`go_on` to continue)
- built: 「你標採用、存疑、不用並寫理由；同一組一起標」「你可以改系統的分類，寫理由」「別國的資料先標適不適用這裡」「回顧時你標錯的出處」 -- BEFORE_SAVE: one mark per origin on exactly its pages, one change per card and cell, a split takes part of one group, a take-back once; `origins()[].wrong_in_review` shown
- built: 「你貼的網址和檔案標我貼的」「沒有出處的文字標我自己說的，不算外部來源」 -- a file needs 出處 (`venue`) or it is saved as `gather.own`, never as a source; `GatherPage.test.tsx` proves the page cannot send it to /sources
- built: 「AI 想查詢並翻成別的語言」「摘要一律寫成這個來源說」「指出哪兩個來源互相矛盾（並排，不選邊）」「提醒可能還缺哪一方」「沒准時只問、整理你貼的、指出還缺什麼」 -- `ai_actions/gather.py` (queries, summarise, compare: `search_external`; organize: `organize`, pasted cards only); reads never `sense.*`/`decide.*`
- built: 「你可以關掉某個搜尋管道」 -- engine chips on 「去找」 (seed `providers`)
- built: 「你按去找，系統才開始找」「先找最原始的、前例、到過現場的人」 -- `gather.ask`, the plan first, then `confirm`; default angles primary/news/factcheck/precedent/field (wire §4.1); 「找跟它說法相反的」「找它引用的原始文件」 = angle opposite/origin; locally the collection service is unconfigured and the page says so
- built: 「每張來源卡記下這次用的名單和規則是哪一版」「畫面顯示這次用的名單和分組規則是哪一版」「列在名單上、被分在哪一組都不代表它是假的」「被刪掉的文章、私人群組裡的訊息系統看不到」「交出去的每一筆都標有人這樣說」 -- card `rules` stamps; page notes and tags
- built: 「出現自傷、暴力、急性危機的訊號時，AI 停下來，叫 GOVERN」「碰到 GOVERN 列的高風險時，叫 GOVERN 加護欄」 -- the shared gate and GOVERN's hook on every GATHER kind the person writes
- built: 「來源卡和網頁當時的樣子跟著案子，抹除時一起刪」 -- case-owned records, existing case erasure (test)
- KNOWN LIMIT: 「系統至少用兩家搜尋引擎找」 -- Brave has no key (`no_key` channel), so every run says 「管道不足：只用了 1 家搜尋引擎」 until a key exists (rules §11)
- KNOWN LIMIT: 「至少用兩種語言：事情發生地的語言」 -- the collector searches 中文 and English only; a place in another language is 管道不足 with that reason (rules §11)
- KNOWN LIMIT: 「網站自己寫的經營者是誰」 -- read only from the stored page (a copyright line) or the known-outlets list; the site's 「關於我們」 page is not fetched, so most cards say 查不到 with that reason
- KNOWN LIMIT: 「網域什麼時候註冊」「最早何時出現」 -- as collect answers them (lookup.v1 R2, R7): a registry not on collect's list, or collect not answering, is 無法檢查 with collect's why
- KNOWN LIMIT: 「國家或地區」 -- only from a government/academic domain suffix, the known-outlets list or the registrant line collect reads (most registries hide it)
- KNOWN LIMIT: grouping compares the first 20000 characters, one in eight pieces when both texts are long (rule v1); collect answers each batch of 25 addresses within 45 s, so a large run's cards can take minutes to appear
- NOT YET: 「來源名單（媒體、查核組織、內容農場）」 -- no maintained list the platform can cite yet (IFCN's signatory list is page-rendered only); the three lists are empty and say why; 官方 and 學術 are domain-suffix lists
- NOT YET: 「它自己宣稱的立場」「跟當事方的關係」 -- 無法檢查 with why; the person can write their own value (`gather.override`)
- NOT YET: 「截圖」 -- no OCR in step 2; the page asks for the screenshot's text as a file
- NOT YET: 「要求重抓」 -- wire v2 has no re-fetch seed, and pasting the URL again would mark it 我貼的
- NOT YET: 「各地的名單由當地的人參與維護」 -- every GATHER ruleset is platform-maintained in step 2
- KNOWN LIMIT: 「網站連不上」 -- only search engines per run are recorded (`gather.channels`); a single site the collector could not reach arrives as a set-aside page with the collector's reason
- DECISION: 2026-10-04 她確認 9/17 規則涵蓋查詢：積木分開再串聯，對外查詢都在 collect（specs/wire/lookup.v1.json），平台不連外。

## VERIFY (乙)
- built: 「你貼上訊息、截圖或連結」「系統替訊息原文存一份當時的樣子」 -- `verify.message` (person, never edited, `deletable=False`), the server stamps the text's sha256 (`POST /verify/messages`; a wrong stamp is refused on every path); the message is never sent to /sources
- built: 「你先停一下，寫下第一反應和信心」「寫完，你才看系統查到什麼」 -- `verify.first` (person-only, once per message, never edited); until it exists the fact-check route, every AI turn and every claim, stance, verdict and note about that message are refused (`VERIFY_FIRST_REACTION_REQUIRED`)
- built: 「AI 先提出一則訊息怎麼拆成主張。你確認了才算」「訊息裡的四種句子」「講法律的句子另外標法律」 -- AI `split` (organize) -> `verify.split`; each confirmed line is the person's `verify.claim` naming its proposal; MAP's 事實／法律 claims come in with `from = MAP`
- built: 「要寫法域、時效、來源；沒寫的，不能當成確定的結論」 -- the ledger marks it 未確認; 「系統請你至少寫一個別的解釋」 -- the form asks and the ledger flags `needs_alternative` (asked, not refused)
- 2026-10-04 她確認 9/17 規則涵蓋查詢：積木分開再串聯，查核資料庫在 collect（specs/wire/lookup.v1.json），平台不連外。
- built: 「系統查別人是不是已經查過這一則」「查核組織的結論，系統當成一個來源」「標明是誰判的、依據什麼」「系統不把它當成平台的結論」 -- one `collect_lookups.factcheck` call per lookup (ClaimReview and Cofacts are asked by collect; matching thresholds are collect's, lookup.v1 R5); each hit is a source written as GATHER with who judged, on what grounds, the link and the attribution collect sent; a database collect could not ask shows collect's why; collect down or not set up = both 無法檢查 「蒐集器這次沒有回應」; ruleset `verify.factcheck_dbs` v2 keeps only which databases are shown per place and whose hits come first
- built: 「你在別的地方時，系統換成當地的查核組織」 -- the place's list from 「你在哪裡」 (台灣: Cofacts first, TFC and MyGoPen first among ClaimReview); KNOWN LIMIT: only 台灣 has a local list, anywhere else uses the global feed and says so
- NOT YET: 「Google 的查核搜尋介面也能用，但要先申請金鑰」 -- no key (MY_DECISIONS: the operator applies before VERIFY opens); shown as 無法檢查 「平台還沒有這個金鑰」; with a key it is asked by collect like the other two, never by the engine
- DECISION: 「每個事實主張，系統在背後用蒐集器找來源」 -- starts when the person presses 「去查」 on a claim, after the plan is shown (the collections route's plan-then-confirm rule); one run per claim, so the run's end says 查到／查不到／無法檢查 for that claim (`verify.search`)
- KNOWN LIMIT: a 「去查」 run that dies without calling back gets no `verify.search` until a later arrival in the case; the ledger shows the run as 沒有跑完 and the person can press 「去查」 again
- built: 「來源多到要你自己篩時，系統才問你要不要加 GATHER」 -- more usable cards than one AI reading turn takes (`ai_gate.MAX_SOURCES_PER_TURN`) proposes GATHER with fixed words
- built: 「系統把結果排成一張表，叫主張帳本」「幾個獨立出處支持、幾個反對」「查不到」「無法檢查」 -- `GET /verify/ledger` over `evidence.checked_claims`; the AI's reading (`read`, cites, needs 找外部資料) never counts until the person confirms it into `verify.stance` (one by one or all of a claim at once)
- built: 「三件事分開顯示：找得到出處、出處彼此獨立、出處站得住」「前兩件打勾，第三件不打勾」「只列查得到的事」 -- the ledger line's `three` (who runs it, original or repost, which list)
- built: 「系統拿訊息對照一份操弄手法的清單。這份清單有版本」「附上原文的哪一段」「清單至少有」九種 -- ruleset `verify.techniques` v1; AI `techniques` refuses a quote not in the message; 「手法不等於假」 on the page; 「系統找出它要你做什麼」 -- `asks` with the quote
- NOT YET: 「系統查是不是很多帳號同時貼同一句」「短時間內暴增…標疑似協同」「系統查這則訊息最早從哪裡出來、怎麼傳開」 -- no social-network data (rules §11): `verify.spread` writes 無法檢查 「平台沒有接社群平台的資料」; the person's own note is `verify.seen`, never counted; 「去查」 includes the 最早的出處 angle
- NOT YET: 「圖片和影片，系統拿去搜尋」「內容來源憑證…讀出來顯示」 -- no tool in step 2 and only text is pasted: 無法檢查 with why; 「是不是 AI 生成的」 -- 無法檢查 「沒有工具給得出依據，無法判定」
- built: 「你對每個主張標採信、存疑或不採信，並寫一句理由」 -- `verify.verdict`, one live per claim; 「同一個案子裡，同一個說法再出現時，系統提醒你查過」 -- the ledger's `earlier` (width, spaces and punctuation ignored); 「別的案子出現，不提醒」 -- computed inside one case only (a test)
- built: 「AI 用白話摘要主張帳本」「一個主張的獨立出處不到兩個時，AI 停下來。畫面顯示有幾個出處」「只有一個出處時，AI 只能說只有一個出處這樣說」 -- `summary` hands back before any call; going on is the person's button; a weak claim's line is fixed words whatever the model says
- built: 「AI 提出還該查什麼」 -- `next` (point_gaps, no grant)
- KNOWN LIMIT: 「AI 不准宣判真假」「不准替你決定轉不轉、信不信」 -- held by the instructions and by structure (no AI kind holds a verdict, the ledger is the system's, a weak claim's line is fixed, no turn is shown a source's country or the person's verdict); a model sentence that rules anyway is not caught by a word list (one would also catch questions like 「是不是真的」)
- built: 「你可以改拆法、補主張、覆寫任何一格。你改的時候，要留下理由」 -- a changed claim needs a new reason; a stance unlike the AI reading it names needs a reason; KNOWN LIMIT: confirming an AI proposal in other words records which proposal it was, not why it was reworded
- DECISION (brief): 「你可以只看結果，跳過練習」 -- the 檢查題 and the order of steps can be skipped; the first reaction cannot (the server refuses results before it; one short line is enough)
- NOT YET: 「共同決定時，每一方的立場由本人確認轉述得對不對」 -- COLLAB (step 3); 「社群註解」 -- needs several people (COLLAB)
- DECISION: 「來源評等…給網站打分數」 is not built: the platform gives what it found and the person marks (MY_DECISIONS 5.2)
- NOT YET: 「現有工具 11 個」 (證據檢查) and the two research workflows are not wired into VERIFY in step 2; 「轉傳前有沒有查證」 as a measure is LEARN's (the first reaction, the techniques named and the verdicts are on the record)
- built: 「系統記下這次用的手法清單、查核資料庫名單、模型是哪一版」 -- each `verify.techniques` and `verify.factcheck` stores its ruleset stamp; the model is `govern.ai_call`; 「案子抹除時，這些一起刪」 -- every VERIFY record and every fact-check source is the case's

## COMPUTE (丙)
- built: 「COMPUTE 替你真的把數字算出來…標成「計算結果」或「模擬結果」」「分清算出來的和感覺的」 -- ruleset `compute.algorithms` v1 (`platform/rulesets/compute.py`): 損益平衡、淨現值、內部報酬率、期望值、成本效益、蒙地卡羅, each calling an existing module's builder and that module's own gates; label from `LABELS`
- built: 「你說要算什麼／你挑要用的數字／你確認每個數字從哪裡來／你設情境」 -- `compute.request` (person-only, every version kept): question, algorithm, inputs {number, unit, cards from `evidence.origins()` or OWN_WORDS}, 樂觀／悲觀 beside 一般
- built: 「系統真的執行計算，不是讓 AI 用講的」 -- saving a request runs it (AFTER_SAVE → `compute.run`, author system); a test patches the module and the run follows it
- built: a bad number is a refusal in plain words naming the scenario (`COMPUTE_INPUT_REFUSED`), nothing saved -- BEFORE_SAVE computes every scenario once; a module refusal that is itself the answer (毛利 0 以下 = 永遠打不平; no inflow / no outlay for 內部報酬率) is a result with no number (`MODULE_ANSWERS`), never a refusal
- built: 「畫面上列出公式和每一個輸入」「每個輸入都帶著來源」「你自己給的數字，系統標…」 -- ComputePage + GET `/projects/{id}/compute/runs` (each input's source in words)
- built: 「系統指出：哪一個輸入一變，結果就翻過來」 -- one at a time, from each 一般 value up and down by its own size (or its 樂觀／悲觀 spread); the nearest flip is named with its value; numbers no module can compute with are a wall (no flip claimed past it); a simulation within two standard errors of the line names no flip
- built: 「系統把每次計算都存起來。你可以重跑」「每次計算都可以重跑，跟之前的對照」「系統記下算法是哪一版」 -- a new request version = a new run; rerun and 改輸入再算 start from the run's own record (`from_run` → `rerun_of`); 並排比 any two; each run keeps the ruleset stamp
- built: 「系統給一個範圍」「結果的可信度，不會高過輸入的來源」 -- a request with no 樂觀 or 悲觀 value different from 一般 in a number that feeds the result is refused (a comparison line -- 你預計做得到的量、你要求的報酬率、你要的最低結果 -- does not count; a simulation needs an item with a spread); range (a simulation: 5%–95% of its draws); one sentence names the least-sourced number
- built: 「AI 建議適合的算法」 (`suggest`, propose_options) 「AI 用白話解釋結果」「AI 指出哪一個假設最影響結果」 (`explain`, organize); 「模擬是 AI 權限的一種」 per rules §11
- built: 「AI 不准自己編數字」 -- `compute.request` is person-only; an AI answer with any digit, %, Roman, CJK numeral or English number word outside a fixed idiom list (no unit after it) is not saved (`AI_ANSWER_HAS_NUMBER`; test corpus)
- built: 「AI 不准把模擬說成預測」 -- the guarantee is the frame: one component draws every AI explanation, always beside the system's own 「模擬不是預測，計算也不是」 (a page test covers a plain run, a rerun and an adopted run), and every simulation carries 模擬不是預測; on top, a best-effort guard refuses listed markers of the future (會、將…), certainty (穩、鐵定、必、絕對、準、包賺、確定…) and likelihood (很可能、大概率、多半…) unless inside a fixed word that claims nothing (機會、將來、穩定、必要、準確、包括、不確定…), plus the words for predicting itself (`AI_ANSWER_CALLS_IT_PREDICTION`; corpus + one test per allowed word)
- built: 「AI 不准把假設藏起來」 -- `rests_on` = every input of the run, filled from the record, never by the model
- built: 「交還控制：某個外部數字的獨立出處不到兩個時，AI 停下來…你自己給的數字不算」 -- `explain.handback` from `calc_results()[].thin_inputs`, count shown, 「仍然繼續」 sends `go_on`
- built: 「出現自傷、暴力、急性危機的訊號時，AI 停下來」「COMPUTE 叫 GOVERN」「碰到 GOVERN 列的高風險時…加護欄」 -- the gate's crisis stop; GOVERN's hook on `compute.request` and `compute.adopt` (tests)
- built: 「讀什麼：GATHER 的來源卡、你給的數字；絕不讀…」 -- `explain` reads `compute.run` + `gather.source` (counts via `read.evidence`), `suggest` reads nothing; a test refuses `sense.card`
- built: 「AI 輸出要分開標示：資料支持、推論、法律／程序條件、價值選擇、創意假設」 -- each explanation point carries one of the five (`AI_PARTS`, kinds/compute.py)
- built: 「系統和 AI 給的分數或推薦，都不說成客觀的真理」 -- the suggestion reads 「只是建議，不是唯一正確的算法」; the explain instruction forbids truth or recommendation
- built: 「你可以改輸入、換算法」「你可以不採用結果」 -- 改輸入再算 (the algorithm too); `compute.adopt` one live per run, with a reason
- built: 「工具進了這一塊，要照這份合約走：你先寫，AI 才回」 -- `suggest` needs your question; `explain` needs a run you made
- DECISION: 成本效益 -- `cost_benefit_analysis.py` computes no number (it keeps the unpriced unpriced and asks who bears what); NPV gives each stream's value today; the one subtraction (效益 − 成本) is in `block_hooks/compute.py`
- DECISION: a simulation's 樂觀／悲觀 are the two ends each item is drawn between (一般 most often): one range, not a result per scenario; ruleset v2 says the items are drawn on their own (不會一起變好或變壞) and the page shows every item at its 悲觀 and at its 樂觀 beside the band; the sweep moves an item's three values together with 2000 draws
- built: `irr.py` solved by dividing by (1+r)**period, which underflowed to 0.0 at its low bound from 54 periods on; it now bisects on NPV's sign with every power at most 1 (tested at 54, 60, 100 periods); 年數 stops at 100 (one cash flow per year); flows are one outlay then equal years, so there is one IRR
- KNOWN LIMIT: the sweep reaches each number's own size (or its 樂觀／悲觀 spread); a flip further out reads 「沒有翻過來」; 期望值's probabilities are not swept alone (they must sum to 100%)
- KNOWN LIMIT: a forecast with no listed marker -- a time word, 就 and the outcome (「下個月就回本」「這樣就虧了」, "this pays off next year") -- can still be saved: no word filter stops every forecast in free prose, so the line beside every explanation is the backstop (the test pins these lines as known-limit cases)
- KNOWN LIMIT: the number and marker checks are allow lists: a harmless word missing from them (將 used as 把, 會 as "can", 必填, 會不會 as a question) costs the person one retry; a person's own name is quoted only if it holds more than a numeral or 會／將
- KNOWN LIMIT: 蒙地卡羅 sums independent items only (`run_simulation` supports `sum`, no correlation)
- NOT YET: 「統計」「因果圖」 -- `compute/statistics` holds only Cohen's kappa (agreement between two coders), nothing a personal decision asks; 因果圖 is not a numeric module
- NOT YET: the rest of 「做不做得起來、划不划算」 (成本效果、實質選擇權、總持有成本、TELOS、單位經濟效益、財務假設) and the six business-* workflows -- a new algorithm = a new ruleset version
- NOT YET: 「看見長期後果：第二序後果」 -- no algorithm chains consequences; years (淨現值、成本效益) and scenarios are built; 按月季年 observation is ACT's
- NOT YET (S, at integration): 「計算結果交給 DECIDE…交給 ACT」 -- they read `evidence.calc_results`; 「結果頁歸 MAP／COMPUTE」 -- the project's older result page (⑧) does not link here
- built: each number's counted origins live in `evidence.calc_results()[].input_origins` (`thin_inputs` derives from it); COMPUTE's hook, page and AI turn read it there, never recount

## Collector wire (丁)
- built: wire v2 on both sides against one example file (`specs/wire/collector.v2.json`): next-admin builds its batch and completion from its seeds (`collect-wire-v2.test.ts`), the engine posts them and breaks each rule once (`test_collector_wire_v2.py`); v1 still accepted
- built: 「系統至少用兩家搜尋引擎找」「至少用兩種語言找」 -- a claim seed (`entity://claim/<id>`, 7 angles) runs every (angle × language × engine with a key); an engine without a key is a `no_key` channel, never an error; Perplexity is refused in a seed and ignored by the collector (also `COLLECT_SEARCH_PROVIDER`)
- built: 「系統替每一筆記下：從哪個管道、用哪句查詢找到的」 -- `searchProvider/Lang/Query/Angle`, `pasted`, `imageUrl` (og:image), `outlinks` (other hosts, ≤50) in `relevance`, typed by the engine; the whole object cut to fit 4096 bytes
- built: 「抓不到內文的網頁、講的不是這件事的網頁，系統不丟掉…寫理由」 -- a research run sends a refused page with text with `aside`; the completion lists the rest (no text, unreadable, gone, robots, planted instructions, shop/social results not fetched) with a plain reason; `channels` say which engine/language worked
- built: a pasted URL is read as that one page (its links are not followed)
- KNOWN LIMIT: a claim has no relevance gate (a sentence is not a name; only the quality gate runs), so an off-topic search result arrives as a normal card
- KNOWN LIMIT: 16 billed calls per seed across engines (`MAX_QUERIES` = `RESEARCH_MAX_QUERIES_PER_ENTITY`); once a second engine has a key, 7 angles × 2 languages × 2 engines = 28, so the last angles are cut (S decides: raise both, or fewer angles per seed)
- KNOWN LIMIT: a page found by two engines or queries is fetched once and stamped with the first; the completion lists the first 200 pages set aside
- KNOWN LIMIT: the English query for a Chinese claim is the Chinese text plus English words; translating the claim is the AI's step (GATHER 「翻成別的語言再查一次」)
