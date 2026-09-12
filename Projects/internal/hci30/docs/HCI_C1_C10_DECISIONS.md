# HCI-30 C1-C10 決策清單

操作者 2026-09-11 問「HC 優缺點，尤其是缺點」，得到 C1-C10 十項缺點清單，
2026-09-12 要求「完美完善完整處理好，需要決定的事都你決定」。本檔記每項
的決定與理由，AI-readable 極簡格式，不寫散文。狀態四種：**DONE**（本輪
已落地並真跑驗證，見對應 commit/WORKLOG）、**MITIGATED**（本輪縮小但沒
宣稱解決，剩餘限制寫明）、**PLANNED**（設計已定，本輪未落地，追蹤於
TASKS.md，不得跟 DONE 混淆）、**DEFERRED**（判斷不該現在做，理由是下面
四類之一：架構衝突 / 需操作者業務判斷 / High-risk 需另外 go-ahead / 跟
另一獨立工作流衝突）。

## C1 — 資料輸入仍 100% 人工

**DEFERRED — 架構衝突**。「資料蒐集器」（自動網路搜尋）是操作者本人指定
的獨立工作流，正在 `app.aware-wave.com/ops/collect` 建置，明確指示過
「不要碰」。現在插手等於跟另一條 workstream 搶同一塊地。**正確路徑**：
等 collector 那邊做出 `sink/hci-discovered` 之後接線，不是本輪重新設計。

## C2 — 規則引擎零語境理解（無否定詞判斷）

**PLANNED，未落地**。純字面比對（literal substring match）的語境理解無
法在不違反操作者「用程式分析，不要 LLM」的明確要求下被「解決」——這是
選擇確定性規則的必然代價，不是 bug。設計（未寫成程式碼）：
- `RULES` 加否定詞窗口啟發式：關鍵字前 N 字元內出現「排除/沒有/並非/
  未證實/否認/駁回/不成立」等否定詞則不計分，同時保留該筆命中但標記為
  「已排除」，UI 上仍看得到，不是靜默丟棄。
- 規則集版本號：目前只有 `RULE_ENGINE_METHOD_ID='rule_engine_v1'` 一個
  固定字串，`RULES` 內容改了版本號不會跟著變——凍結報告已經把當時算出
  的「值」存進快照，缺的是「用哪一版規則算出來的」本身也要可追溯。
- 已知剩餘限制（即使落地也不會消失）：窗口啟發式仍會漏掉遠距離否定、
  雙重否定等情況，不是完整解法。
- 未落地原因：改動涉及 `matchRules()` 回傳形狀（要同時回報「命中且計
  分」跟「命中但被否定詞排除」兩種結果），會牽動現有 12+8 個測試案例的
  斷言，跟 C7/C10 同一輪硬塞第三個有真實測試面積的改動，會擠壓每一個的
  驗證品質。追蹤於 `agency-os/TASKS.md`。

## C3 — 規則透明 = 可被針對性操弄

**PLANNED，未落地**。可解釋性（每條規則的關鍵字/理由 UI 上直接看得到）
跟抗操弄本質互斥——操作者當初明確要「還是要有文字說明和分析緣由」，選
了前者，這條張力不會被下面的設計「解決」，只會被稍微緩解。設計（未寫成
程式碼）：同一則證據文字若在短篇幅內塞入異常多條規則的關鍵字，標記「疑
似關鍵字堆疊」供人工複核留意，不改變分數本身。未落地原因同 C2。追蹤於
`agency-os/TASKS.md`。

## C4 — 沒有信任總分/最終裁決

**DEFERRED — 需操作者業務判斷**。`HCI_RISK_SPEC.md` 早就明確記錄「跨構
面該怎麼加總是刻意留白，沒有證據支持的公式就不會假裝有一個」。7 個信任
構面要怎麼加權成一個總分，是business risk-tolerance 判斷（不同 purpose
底下同一構面該不該有不同權重），不是我能用工程判斷替你決定的事——這正是
AGENTS.md R0 禁止的「猜測補未知」。**正確路徑**：你決定加權政策（或決定
「永遠不要有總分，人自己看 7 個構面判斷」也是一個合法答案），我才能把它
落地成公式。

## C5 — auto-promote 開關風險

**PLANNED，本輪未落地**。設計：新增 `hci.cases` 稽核——
`auto_promote_rule_findings` 每次被誰在何時切換都留一筆不可竄改紀錄，跟
現有「系統自動判定，未經人工確認」UI 標籤互補（標籤說「這筆分數怎麼來
的」，稽核紀錄說「誰決定要讓系統這樣算」）。需要一個新表/migration，跟
C7 同等份量的真跑驗證（migration+trigger+mutation-check）——本輪已經對
C7 跑完一輪完整的真 Docker 驗證循環，同一輪再塞一個一樣重的 migration
會擠壓驗證時間，選擇不趕工。追蹤於 `agency-os/TASKS.md`。

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
| C2 | PLANNED，未落地 | 無（追蹤於 TASKS.md） |
| C3 | PLANNED，未落地 | 無（追蹤於 TASKS.md） |
| C4 | DEFERRED（需業務判斷） | 決定跨構面加權政策，或決定永遠不做總分 |
| C5 | PLANNED，未落地 | 無（追蹤於 TASKS.md） |
| C6 | DEFERRED（High-risk） | 明確 go-ahead 才會開始接 portal |
| C7 | **DONE** | 無 |
| C8 | DEFERRED（High-risk，前人已決定不趕） | 明確 go-ahead 才會重啟 |
| C9 | DEFERRED（需業務判斷+法遵風險） | 決定每個 purpose 的具體行為差異 |
| C10 | **DONE** | 無 |
