# HCI-30 C1-C10 決策清單

操作者 2026-09-11 問「HC 優缺點，尤其是缺點」，得到 C1-C10 十項缺點清單，
2026-09-12 要求「完美完善完整處理好，需要決定的事都你決定」。本檔記每項
的決定與理由，AI-readable 極簡格式，不寫散文。狀態五種：**DONE**（本輪
已落地並真跑驗證，見對應 commit/WORKLOG）、**MITIGATED**（本輪縮小但沒
宣稱解決，剩餘限制寫明）、**PLANNED**（設計已定，本輪未落地，追蹤於
TASKS.md，不得跟 DONE 混淆）、**DEFERRED**（判斷不該現在做，理由是下面
四類之一：架構衝突 / 需操作者業務判斷 / High-risk 需另外 go-ahead / 跟
另一獨立工作流衝突）、**RESOLVED**（不是本輪落地的程式碼，而是查證後發
現已有更高層級的既有決定把問題本身解消了，不追蹤、不待決）。

## C1 — 資料輸入仍 100% 人工

**DEFERRED — 架構衝突**。「資料蒐集器」（自動網路搜尋）是操作者本人指定
的獨立工作流，正在 `app.aware-wave.com/ops/collect` 建置，明確指示過
「不要碰」。現在插手等於跟另一條 workstream 搶同一塊地。**正確路徑**：
等 collector 那邊做出 `sink/hci-discovered` 之後接線，不是本輪重新設計。

## C2 — 規則引擎零語境理解（無否定詞判斷）

**DONE**。純字面比對（literal substring match）的語境理解無法在不違反
操作者「用程式分析，不要 LLM」的明確要求下被「解決」——這是選擇確定性
規則的必然代價，不是 bug，本輪縮小影響面，未宣稱解決：
- `packages/intelligence/rule-engine.mjs` 新增否定詞窗口啟發式：關鍵字
  前 15 字元內出現「排除/沒有/並非/未證實/否認/駁回/不成立」等否定詞則
  不計分；`matchRules()` 回傳形狀不變（仍是純陣列，過濾在內部發生，向下
  相容），新增 `matchNegatedRules()` 回報被排除的命中，UI（`d-negated-
  hits` 區塊）永遠顯示，不靜默丟棄。
- 新增 `RULE_SET_VERSION`（`RULES` 內容的 sha256 前 12 碼），不是手動維
  護的版本號——內容改了自動跟著變，不需要人記得手動升版。凍結報告的
  `.report-legal` 新增一行「規則引擎版本：xxx」。
- 已知剩餘限制（設計已知、無法用這個機制消除）：窗口啟發式仍會漏掉遠
  距離否定、雙重否定、關鍵字後置的否定（如「詐欺，但已排除」）。
- 真跑驗證：`rule-engine.test.mjs` 新增 10 個測試（含負負得正場景：同一
  關鍵字一次被否定一次沒被否定，仍正確判定為命中），瀏覽器真實案件確認
  「調查後排除了詐欺疑慮」不觸發 fraud_indicator 且正確顯示在排除清單。

## C3 — 規則透明 = 可被針對性操弄

**DONE**（緩解，非解決）。可解釋性（每條規則的關鍵字/理由 UI 上直接看
得到）跟抗操弄本質互斥——操作者當初明確要「還是要有文字說明和分析緣
由」，選了前者，這條張力沒有被下面的設計解決，只被緩解。`detect
KeywordStacking()`：同一則證據文字命中 3 條以上不同規則時標記「疑似關
鍵字堆疊」，證據卡片與報告頁皆顯示，供人工複核留意，不改變分數本身。
真跑驗證：3 個新測試（含「同一規則的多個關鍵字不算堆疊，只算一條規
則」的邊界情況），瀏覽器真實案件確認 3 條規則命中時正確標記。

## C4 — 沒有信任總分/最終裁決

**RESOLVED——architecturally forbidden, not a待決事項**。2026-09-12 操作
者問「怎樣才會是最精確的數字？」，動工前先查現有治理文件才發現：
`ADR-0004`（`agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/
ADR-0004-no-universal-human-trust-score.md`，狀態 ACCEPTED，早於本輪）
已明文禁止——**HCI 永遠不得把 7 個信任構面收斂成一個純量總分，不論是
DB 欄位、API 欄位、報告、還是 UI 顯示，連內部/隱藏欄位都不行**。理由是
ADR 自己寫的三點，非本輪新論證：①「未加權平均」本身仍是一個沒人審過
的價值判斷（7 構面同權重＝隱含判斷所有構面同等重要）；②一旦「某人 =
62/100」這個事實被存下來，因歷史真相不可竄改（Invariant 6），加總方法
之後發現有問題也刪不掉，變成當事人永久的名譽紀錄，而當事人從未同意被
這樣評分；③即使標成「僅供參考」也一樣——隱藏欄位一樣可查詢、可匯出，
未來新功能可以在沒有任何新審查的情況下把它悄悄浮出來。**因此沒有任何
一種「總分」會是更精確的答案**——把 7 個獨立訊號壓成 1 個數字是資訊
損失（例如某供應商營運面 VERY_HIGH、治理與權力面 VERY_LOW，平均成
MODERATE 剛好把真正的發現抹掉），現有的 7 構面分別顯示才是精確的輸出。
本項不追蹤、不待決——architecture 已經把答案寫死了。

## C5 — auto-promote 開關風險

**DONE**（`database/migrations/0019_wave1_case_auto_promote_audit_
{up,down}.sql`）。`hci.case_auto_promote_audit` append-only 稽核表，結構
沿用 C7 的 append-only 骨架（GRANT SELECT/INSERT-only、REVOKE UPDATE/
DELETE、`reject_update_delete()` trigger、RLS tenant_isolation）：
`auto_promote_rule_findings` 每次被誰在何時切換都留一筆不可竄改紀錄，跟
現有「系統自動判定，未經人工確認」UI 標籤互補（標籤說「這筆分數怎麼來
的」，稽核紀錄說「誰決定要讓系統這樣算」）。**吸取 C7 的教訓**：
`changed_at` 用 `DEFAULT now()`，不是 `clock_timestamp()`（C7 當時誤用後
者觸發 `BITEMP-SCOPE-01` 失敗，這次直接避開）。

**Critic 覆審抓到 1 個 Major，已修**：初版把 UPDATE hci.cases 跟 INSERT
稽核列寫成兩個獨立的 `queryAsTenant()` 呼叫，中間沒有交易包起來——兩者之
間任何失敗（斷線、連線池耗盡）都會讓值已經改變但完全沒留下稽核紀錄，正
是這張表存在的目的被最普通的暫時性失敗就打破。改法：仿照既有的
`hci.record_decision()`（migrations/0014）模式，把 UPDATE+INSERT 收進一
個新的 `hci.set_case_auto_promote_rule_findings()` SECURITY INVOKER 函式
裡，一次呼叫=一個陳述式=結構上原子化，`server.mjs` 的 endpoint 改成
`SELECT hci.set_case_auto_promote_rule_findings($1,$2,$3)`。同一輪順手修
掉一個關聯問題：函式的 UPDATE 帶 `IS DISTINCT FROM` 條件，重複 POST 同一
個值（no-op）不再產生第二筆稽核列。活頁面新增 `.auto-promote-audit-list`
顯示歷史。真跑驗證：282/282 assertion（在前一輪 276 基礎上新增 6 個
`FN-AUTOPROMOTE-*` 函式層測試）、131/131 mutation killed（含 2 個新
mutation：整個 drop 掉函式、單獨弱化 no-op 判斷邏輯），瀏覽器真實案件確
認切換開關後歷史列表正確顯示。

## C6 — 沒有真實登入驗證

**DEFERRED — High-risk STOP，需另外 go-ahead**。身分/RLS 屬於 AGENTS.md
§3 明訂的 High-risk 類別，任何情境都要停下來問，不因「全權授權」而跳過
（規則優先序：High-STOP 不管在不在線都要停）。而且**這不是要我發明新機
制**——`agency-os/TASKS.md:849` 已經有 `portal.aware-wave.com` V1（統一登
入層），明確是為了服務 HCI-30 跟 Cognitive OS 的外部客戶而建，只是 HCI-30
還沒動工到需要接線的階段。現在憑空造一個 ad-hoc 登入系統會跟已經決定的
架構打架，正確路徑是等 HCI-30 要對外開放時接 portal，不是重新設計一套。

## C7 — 證據完整性鏈沒建完

**DONE**（`database/migrations/0018_wave1_evidence_hash_chain_{up,down}.sql`）。
`subject_records.content_hash`/`prev_hash` + `hci.subject_record_chain_tips`
+ `hci.compute_subject_record_hash()` trigger + `hci.verify_subject_record_
chain()`。真跑驗證：269/269 assertion、128/128 mutation killed，含竄改與
刪除兩種真實情境重現。詳見同日 WORKLOG。防的是「table owner 先關掉
append-only trigger 再改資料再開回去」這一層，append-only 本身早就擋住
app role 跟一般 owner 連線。

## C8 — 金鑰輪替只有紙上設計

**DEFERRED — High-risk STOP + 已有前人明確決定不趕**。憑證/加密屬於
AGENTS.md §3 High-risk。`agency-os/TASKS.md:1003`（2026-09-07）已經記過
「刻意未做，真實金鑰邏輯需自己一輪 real-Docker 驗證，不趕」——這是前一個
session 做過的、有理由的決定，不是被遺忘的缺口。本輪不推翻它，維持追蹤。

## C9 —「調查目的」欄位是裝飾

**DEFERRED — 需操作者業務判斷（含法遵風險）**。要讓「詐欺調查」跟「人身
安全」觸發不同的證據要求或規則權重，需要真實的法遵/隱私政策輸入（不同
調查目的在不同法域下的合法性基礎不同）——這不是我能猜的工程細節，猜錯
的代價是法律風險，比維持現狀「誠實裝飾」更糟。**正確路徑**：你決定每個
purpose 該有的具體行為差異，我才落地。

## C10 — 統計方法陽春（不看樣本數）

**DONE**。完整的信賴區間/統計顯著性模型需要真實校準資料才有意義，現在
編一個假的信賴區間比維持現狀的誠實陽春更糟（會讓人以為有統計嚴謹性其實
沒有）。落地一個不需要編造數學的誠實訊號：`classifyEvidenceQuality()`
新增 `evidence_count`（沿用既有 `distinctRefCount`，非另一套計數邏輯），
活頁面跟報告頁的構面卡片與證據卡片都從「單一來源/多重來源」升級成「單一
來源（1 筆）/多重來源（3 筆）」，不假裝算出信賴區間。真跑驗證：intelligence
套件 146/146 Node test 全綠，瀏覽器建立真實案件確認兩處（構面下鑽 + 證據
卡片）與活頁面/報告頁皆正確顯示筆數，console 零錯誤。

## 總覽

| 項目 | 狀態 | 需要操作者做的事 |
|---|---|---|
| C1 | DEFERRED（架構衝突） | 無，等 collector 完工後我方接線 |
| C2 | **DONE** | 無 |
| C3 | **DONE** | 無 |
| C4 | **RESOLVED**（ADR-0004 architecturally forbidden） | 無，2026-09-12 操作者已確認 |
| C5 | **DONE** | 無 |
| C6 | DEFERRED（High-risk，2026-09-12 操作者確認「先不動」） | 明確 go-ahead 才會開始接 portal |
| C7 | **DONE** | 無 |
| C8 | DEFERRED（High-risk，2026-09-12 操作者確認維持前人決定） | 明確 go-ahead 才會重啟 |
| C9 | DEFERRED（2026-09-12 操作者確認「先不動」） | 若未來要動，需給每個 purpose 的具體行為差異 |
| C10 | **DONE** | 無 |
