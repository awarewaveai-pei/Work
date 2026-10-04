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

## COMPUTE (丙)

## Collector wire (丁)
