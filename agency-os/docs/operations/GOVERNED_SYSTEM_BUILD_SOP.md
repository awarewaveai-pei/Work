# Governed System Build SOP

> **目的**：把長壽命系統的重大設計、文件、規格與批准，做成可追溯、可驗證、可回滾的工作流程。本文件只收錄在既有實作中有明確證據的模式；沒有實證的好點子不列為規範。**實證出處：** `CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §1、§2、§4。
> **引用方式**：每個實質主張尾端均列出已實讀的 ADR、WORKLOG 或實際規格檔；這些出處是採用此模式的證據，不是本 SOP 的專案相依前提。**實證出處：** `CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §5 的逐節可追溯性要求；`agency-os/AGENTS.md` R4 的「聲稱即驗證」。

## 1. 何時適用

把本 SOP 用在必須長期維護、會由不同人與不同 AI 接手、且錯誤架構決策的回退成本很高的系統。它的核心成本是把「知道為什麼」和「誰批准了什麼」留在版本庫，而非留在某一次對話；若只是一次性的週末原型，這套完整治理通常不划算。**實證出處：** `ADR-006-mother-doc-revision-flow-and-repo-layout.md`〈Decision Drivers〉將可維護性、可逆性與 30 年存活列為決策準則；`CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §3.1 明定本 SOP 不應被宣稱為所有小型專案的必要負擔。

## 2. 建立三層文件階層

先建立一至數份敘事性權威文件，保存系統的目的、邊界、權責與「為何如此設計」；再以機器可讀規格編譯可驗證的契約；任何需要在真實替代方案之間取捨的事項，另用 ADR 記錄。三層不可互相冒充：規格不能憑空補足敘事沒有支持的內容，ADR 也不能暗示它已修改了尚未套用的權威文件。**實證出處：** `ADR_INDEX.md` L3 明確區分 ADR 的 `ACCEPTED` 與母文件 proposal 的 `APPROVED/APPLIED`；`MACHINE_READABLE_SPEC_PLAN.md` §2 將每個規格連回來源、依賴與建置狀態。

在每個機讀檔內明列它「為何存在、對哪一份來源負責、由哪個決策定案」。實作上可採 `source_of_truth_for` 與 `decided_by` 這類欄位：前者列出被引用而不重複宣告的契約，後者區分 ADR 決策與編譯時的技術選擇。這使後來的維護者能回溯到權威來源，而不把 schema 說明誤當成新的架構裁決。**實證出處：** `specs/workflow/branch.schema.yaml` L41-62 的 `source_of_truth_for` 與 `decided_by`；`policies/security/zero-trust.policy.yaml` L29-43 將來源計畫、ADR 與操作者的真實裁決分開記錄。

只在有明確下游需求時建規格。尚未被切片或消費端使用的物件，應標為 `DEFERRED`，附上查證結果與重啟條件，而不是以「未來可能需要」為由搶先設計。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉「10 個 typed-objects…DEFERRED」記錄全文 grep 的零命中後沒有建檔；`MACHINE_READABLE_SPEC_PLAN.md` L124-127 同時保留 10 項名稱、DEFERRED 理由與未來重啟條件。

## 3. 分離提案、批准與套用

凡是修改基礎權威文件，先建立一個可獨立審核的提案物件，而不是直接改正文。提案至少要有：目標與 baseline hash、影響範圍、變更類型、原文／新文／理由、相依性、相容性、遷移、回滾和證據；其生命週期要把草稿、人工審閱、批准、拒絕、套用與取代明確區分。**實證出處：** `ADR-006-mother-doc-revision-flow-and-repo-layout.md` L63-105 定義單一 `PROPOSAL.md`、front matter 與 `DRAFT → HUMAN_REVIEW → APPROVED|REJECTED → APPLIED|SUPERSEDED` 流程。

產生提案的 AI 可以把它送進人工審閱，但不能自行完成最後批准。人工批准必須被轉錄為可稽核的檔案證據，例如批准者、時間、原話或足以歸因的批准註記；套用後再寫入實際 commit，且保留提案不刪除。這讓無對話記憶的新 session 能判斷當前狀態，而不是把「聊天裡好像同意過」當成授權。**實證出處：** `ADR-006` L107-118；`WORKLOG.md`〈2026-08-30（續30）〉「proposal 040/041」記錄將 `approved_by`、`approved_at`、`approval_note`、`applied_commit` 寫回提案後才標為 `APPLIED`。

## 4. 用 ADR 處理真正的選擇

當問題存在兩個以上可行、具不同後果的方向時，建立 ADR：寫清 Context、Decision Drivers、Options Considered、Recommendation、Consequences、Migration/Rollback 與 Evidence。若只是把已批准決定以既定格式機械套入，則使用一般提案即可；不要為了形式把每個文字修正偽裝成架構決策。**實證出處：** `ADR-017-mother-document-identity-headers.md` L20-44 以兩個具後果的選項作最小 ADR；`ADR-006` L70-105 則規定機械性母文件編輯走提案物件。

AI 起草 ADR 時須維持 `PROPOSED`，不得把自己的建議寫成 `ACCEPTED`。只有可歸因的人工 go-ahead 才能改變 ADR 狀態；即使 ADR 已接受，任何受 proposal 閘管制的權威文件修改仍要另行批准。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉「Codex 完成 4 個 ADR 草案」確認四份草案停在 `PROPOSED`，並在下一條記錄操作者核准後才同步為 `ACCEPTED`；`ADR_INDEX.md` L3 重申 ADR 狀態與 proposal 狀態是兩條獨立規則。

## 5. 把外部／跨模型覆審做成閘門

不要讓產生變更的同一模型是唯一審查者。覆審前先捕捉當下 diff，將被審內容固定下來；覆審時明確要求檢查兩類問題：diff 外隱藏的設定、排程、預設值或 schema 相依，以及「沒有真 finding 時必須回報無 finding」的校準問題；覆審後將結果存成版本庫內 artifact，而非只留在聊天紀錄。**實證出處：** `.claude/commands/codex-review.md` L15-55 規定 capture-before-review、兩段不可省略的 focus text 與 ORACLE artifact 落地。

還要驗證「覆審真的讀了被審內容」。一次 `approve` 並不等於完成審查：若 reviewer 因 sandbox 或權限讀不到 diff，應視為未覆審、修正輸入位置後重跑，不能採信空白 verdict。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉「操作員核准 ADR-017~020」記錄第一次 approve 因讀不到 scratch diff 而作廢，第二次將 diff 放至可讀位置後才採納；`.claude/commands/codex-review.md` L17-23 說明 capture 與實際被審內容脫鉤曾構成 Critical 缺陷。

## 6. 改一個事實後，掃完整份檔案與全庫副本

任何狀態、數值、路徑或裁決改動後，先重讀同檔的摘要、description、驗證說明、追蹤表與歷史敘事，確認它們沒有還在用現在式宣稱舊真相；再從 repo 搜尋同一主張的獨立副本。這不是格式清理，而是防止「機器欄位正確、讀者被散文誤導」的控制。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉「mega-batch 真正 /codex-review」發現 authority 與 network-egress 的真實欄位已更新、敘述仍稱 skeleton／provisional，並另掃出 Master Plan 9 處舊檔名；`WORKLOG.md`〈2026-08-30（續13）〉亦記錄 ADR-016 只改結論、漏改 Context／Decision Drivers／Method Used 的三處現在式敘述。

把這個搜尋當成每次變更的固定產出：列出 pattern、範圍、命中和每個命中的處置；歷史紀錄可保留，但必須清楚標為歷史，不可繼續以現況口吻運作。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉的 `BUGHUNT_DONE` 記錄 `v1_2_zhTW|v2_1.md|SKELETON_ONLY|status: PROVISIONAL` 與追加修正；`MACHINE_READABLE_SPEC_PLAN.md` L374-383 記錄第二輪覆審發現「schema 已修、散文仍說來源不存在」的同類缺陷。

## 7. VBC：Verify Before Conclude

在宣稱某能力缺失、某決定未做或某控制壞掉之前，先查歷史、替代機制與現況來源，問題應改問「是否已由另一個設計接手」。確認缺口後才設計新方案；若先前判斷錯誤，要保留更正與原因，而非靜默換成新答案。**實證出處：** `agency-os/AGENTS.md` R4「驗前先讀歷史」L65-70；`WORKLOG.md`〈2026-08-30（續30）〉「P1-GAP-LEGAL-1」發現原欲提出的三級 SLA 已被既有四級設計與 schema enum 更完整覆蓋，因而撤回簡化方案並重新取得核准。

VBC 的最低步驟是：讀原始主張與其追蹤紀錄、查詢實際現況或下游消費、比較覆蓋範圍，最後才下「缺失／已完成／仍開放」的結論。不能只看到一個檔案、服務或索引沒有內容，就推論整個系統未完成。**實證出處：** `WORKLOG.md`〈2026-08-30（續15）〉先讀四支監控腳本全文，發現原先預期的三機→單機缺口已被先前實作接手，因而只修正文與真正的 emergency runbook 缺口；`agency-os/AGENTS.md` R4 L66-70 說明單一資料源缺失不等於系統未完成。

## 8. 多代理的寫入邊界

若多個 AI／工具共用一個 repo，將唯一寫入權交給那個真正受機械閘、審計與提交流程約束的角色；其他協作者負責大量閱讀、交叉掃描、獨立 finding、patch proposal，或在 repo 外的可拋棄原型工作區試作。這條分界依據的是安全控制實際部署在哪裡，不是誰比較擅長。**實證出處：** `ADR-018-codex-write-authority-and-delegation-exceptions.md` L7-20、L30-42；`agency-os/AGENTS.md`〈跨模型 oracle〉L109-122 說明寫入閘只在一個工具面生效的結構性理由。

例外必須由人明確授權並在寫入前記錄：範圍、檔案或有界 artifact 集合、驗證、回滾，以及到期或完成條件。例外完成後不會自動成為下一次的慣例；production、資料遷移與憑證等高風險操作仍不能藉此下放。**實證出處：** `ADR-018` L32-48；`WORKLOG.md`〈2026-08-30（續30）〉「Codex 額度用完中斷」記錄了對他方未完成產物逐檔驗真、保留未獲批准項目在 DRAFT，而非代為完成。

## 9. 用 phase gate 取得知情的人類批准

把長建置拆為決定／設計／編譯／執行等階段，並在會解除下一類風險的邊界放入明確人類 checkpoint。提請批准時，要說明「此決定精確批准什麼、沒有批准什麼、尚未滿足哪些前提」，不能只問一句「繼續嗎」。**實證出處：** `ADR-014-phase-5-mode-selection-research.md` L23-34 將 Mode 選擇與 Phase 3/4 前提、production／UI／DB 實作禁令、其他 PROPOSED 內容逐一切開；`WORKLOG.md`〈2026-08-30（續8）〉亦記錄獨立論證完成不等於 Phase 5 可啟動。

一個合格 gate 的順序是：先提供互相獨立的分析與其證據，再讓人看見收斂或分歧，取得可歸因的決定，最後把其批准範圍與未解除事項寫回 ADR／計畫。這能避免把「人已同意研究方向」錯解為「人已同意所有下游實作」。**實證出處：** `ADR-014` L9-20、L50-69；`ADR_INDEX.md` L52 的第二次獨立論證閉環記錄。

## 10. 第一週最小啟動清單

第 1 天：建立一份系統敘事正本（目的、邊界、權責與長期不變量）、ADR index、open-questions register，以及母文件修訂用的 proposal template。先讓每一個未決事項和每一次後續修改都有可追蹤的位置；不必先做一整套 schema。**實證出處：** `ADR-006` L63-118 提供可最小化採用的提案結構；`ADR_INDEX.md` L28-39 展示決策依賴關係需要集中追蹤。

第 2 至 3 天：只為已被選定的第一條垂直切片或既有消費端建立機讀契約；每個契約附來源、決策與編譯選擇。對尚無使用證據的物件，登錄為 deferred 並寫下重新檢查條件，避免「規格越多越完整」的錯覺。**實證出處：** `MACHINE_READABLE_SPEC_PLAN.md` L80 對 `READY`／`BLOCKED_PENDING_ROUND2_ADR`／`SKELETON_ONLY` 的區分；`WORKLOG.md`〈2026-08-30（續30）〉對 10 個未被 Research 切片使用的 typed objects 作出 DEFERRED 決定。

第 4 至 5 天：對第一個跨文件決策建立 ADR；對第一個權威文件編輯建立 proposal，但不要自行批准；捕捉 diff 後做一次獨立覆審並將 artifact 連同結果落庫。完成後以「同檔全文＋全庫 claim 搜尋」檢查 stale state，再更新工作紀錄。**實證出處：** `ADR-006` L107-118；`.claude/commands/codex-review.md` L15-55；`WORKLOG.md`〈2026-08-30（續30）〉的 stale-claim 修正與 artifact 驗證記錄。

## Evidence boundary

本 SOP 沒有把 AI-LEGO 的特定文件名、領域名、schema 欄位或產品選型抽成通用必要條件；上述模式只在引用所指向的真實事件與檔案範圍內獲得證明。新系統若缺少相同的風險、寫入控制或多人接手情境，應縮小採用範圍，而不是假稱全套流程已被需要。**實證出處：** `CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §0、§4；`ADR-018` L24-42 的「治理控制面」條件式選擇。

## Related Documents (Auto-Synced)
- `docs/architecture/decisions/ADR_INDEX.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/operations/new-doc-linkage-checklist.md`

_Last synced: 2026-08-30 18:41:55 UTC_
