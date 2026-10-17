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

沒有外部覆審者可用時，不能默默跳過這一步，也不能假裝自己審過自己。改做對抗式自我覆審：主動嘗試推翻剛完成的結論、用突變測試證明測試真的會抓到錯（而非空跑就過），並誠實記錄「這次沒有外部覆審，用了哪種替代」，讓後續讀者知道這批工作的證據強度低於有外部覆審的批次。**實證出處：** `WORKLOG.md`〈2026-08-30（續22）〉ChatGPT Codex 訂閱額度用完（「You've hit your usage limit」）後，判斷 fallback 走同一份訂閱額度、重試無意義，改做真實對抗自審＋突變測試＋誠實計數，而非略過覆審或假裝已審。

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

## 10. 每項任務先過最小規劃閘，並按責任選來源

非瑣碎任務在碰檔案前，先說清七件事：真正問題、已讀的現況與近期歷史、風險、至少兩個真實選項、建議、具體步驟、驗證計畫。這不是只給 ADR 用的儀式；它把「看起來要改一行」和真正根因分開，並用近期 commit 避免與正在進行的工作重複。Low-risk 可簡短交代並直接做；Medium／High-risk 則把七項明列並等待確認。**實證出處：** `agency-os/AGENTS.md`〈R0：架構師模式〉的開工七段與 `git log` 要求；`WORKLOG.md`〈2026-07-05「fix(trigger-build): 修復建站失敗 fetch failed」〉的 `[風險清單]`、`[方案比較]`、`[建議方案]`、`[實作計畫]` 實例。

凡是準備落地的計畫，先開啟六份固定基線：本 SOP（規劃／驗證／風險規則）、`AGENTS.md`（當前強制操作規則）、`TASKS.md` 的現況快照與相關未完成條目、以任務關鍵字找到的最新 `WORKLOG.md` 條目、`ADR_INDEX.md` 與命中的 ADR 正文、以及 `TOOLS_DELIVERY_TRACEABILITY.md`（能力狀態、單一 owner、建置順序與證據）。這是固定的「看現況、看歷史、看裁決、看能力」最小集合；不是要求把大型 TASKS／WORKLOG 從頭到尾塞入 context，而是要讀會改變此任務判斷的現行區段與正本文字。**實證出處：** `agency-os/AGENTS.md`〈R0：架構師模式〉的現況／歷史／`git log` 要求；`TASKS.md`〈現況快照〉與〈Next — 未完成〉的正式隊列定義；`WORKLOG.md` 的日期序列與可定位歷史紀錄；`ADR_INDEX.md`〈何時寫〉、〈已定案索引〉與〈與其他檔的關係〉；`TOOLS_DELIVERY_TRACEABILITY.md`〈目的〉、〈單一視角〉與〈工具建置順序〉。

來源不是越多越好：先讀本倉庫的操作規則、任務現況、相關歷史紀錄與決策正本，再用文件目錄導向該任務的架構、部署、稽核或交付 owner；目錄只負責找到正本，不可取代正本。將要修改、驗證或據以作結論的檔案要全文讀；只查名稱或做大範圍模式搜尋，才用片段搜尋或委派。文件新增／跨層交付／程式與基礎設施等情境，再各自載入相應的連動、驗證或稽核來源，而非一律塞滿 context。**實證出處：** `agency-os/AGENTS.md`〈Session 衛生〉的「要負責即整檔讀」判準；`docs/operations/OPS_DOCS_INDEX.md`〈依類別〉的目錄導向角色；`new-doc-linkage-checklist.md`〈什麼時候用這份〉與 `end-to-end-linkage-checklist.md`〈Objective〉的適用邊界。

就本 operations 文件集，AI 要依任務型態路由：每次以 `OPS_DOCS_INDEX.md` 找到 owner 文件後讀 owner 正本；新增或大改治理文件時讀 `new-doc-linkage-checklist.md`，處理入口、impact map、連動與 health；策略、操作、交付、自動化或合規同時受影響時讀 `end-to-end-linkage-checklist.md`，逐項確認鏈路與 closeout evidence；只有 code-quality／bug-class audit、真實 incident 或既有 audit tool 報 drift 時，才讀 `BUG_HUNT_PROTOCOL.md` 決定怎麼與何時 hunt，並讀 `AUDIT_REGISTRY.md` 確認已查過、待處理與可重用的 audit class。平常的文件或功能計畫不必把後兩份 audit 文件當成通用前置讀物。**實證出處：** `OPS_DOCS_INDEX.md` 將各文件列為不同操作入口；`new-doc-linkage-checklist.md`〈什麼時候用這份〉與收斂驗證步驟；`end-to-end-linkage-checklist.md` Objective 與 A/F linkage；`BUG_HUNT_PROTOCOL.md` L3-6、L29-60、L235-245；`AUDIT_REGISTRY.md` L3-23 的 read-first、狀態與新增紀錄規則。

再依任務加讀 owner：架構、資料或編排決定讀 `ARCHITECTURE_SPEC.md` 與 `TOOL_RESPONSIBILITY_MATRIX.md`；部署或 production 讀 `DEPLOYMENT_BOUNDARY_RULES.md`；需要觸發既有工具、MCP、skill、hook 或 runbook 時讀 `TOOL_TRIGGER_MAP.md`；任何文件修改讀 `CHANGE_IMPACT_MATRIX.md`，其中新增或大改治理文件再加 `new-doc-linkage-checklist.md`；程式、腳本或 infra 修改加 `BUG_HUNT_PROTOCOL.md` 與 `AUDIT_REGISTRY.md`；跨策略、營運、交付、自動化或合規的交付／上線加 `end-to-end-linkage-checklist.md`。這些是按責任加讀的正本，不是六份固定基線的替代品。**實證出處：** `ARCHITECTURE_SPEC.md`〈適用範圍〉與〈目前硬性邊界〉；`TOOL_RESPONSIBILITY_MATRIX.md` 的責任／護欄表；`DEPLOYMENT_BOUNDARY_RULES.md`〈生產變更政策〉；`TOOL_TRIGGER_MAP.md` 的工具觸發總覽與驗證／部署表；`CHANGE_IMPACT_MATRIX.md`〈使用方式〉；`new-doc-linkage-checklist.md`〈什麼時候用這份〉；`BUG_HUNT_PROTOCOL.md` L3-6、L29-60；`AUDIT_REGISTRY.md` L3-23；`end-to-end-linkage-checklist.md` Objective。

規劃輸出要列出「本任務實際讀過的來源」及未讀條件文件的理由，讓下一個 AI 能重放來源選擇，而不是誤以為所有 checklist 都已套用。這是把 R0 的現況／歷史分析與本 SOP 的逐段可追溯性落成可檢查 artifact 的直接推論。**實證出處：** `agency-os/AGENTS.md`〈R0：架構師模式〉的現況分析與 `git log` 要求；`CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §5 的逐節可追溯性要求。

現況分析讀完仍有真正歧義時（而非只是懶得讀），提出剛好一個具體問題，不猜測動手，也不一次丟多個問題——多問會把釐清負擔推回人類，單一具體問題才是把不確定性縮小到可回答的範圍。這條只適用於「讀了仍不知道」，不能被用來取代規劃閘本身要求的現況閱讀。**實證出處：** `agency-os/AGENTS.md`〈任務到達協議〉步驟 1「讀完仍不清楚 → 問一個具體問題，不問兩個」。

## 11. 驗證是四個獨立動作，不是「看起來沒問題」

每次工作邏輯改動都要留下四種彼此不能替代的證據：實際執行或觀察新行為、讀回產物的 review、跨檔搜尋矛盾或副作用、以及寫入有日期的工作紀錄。讀過程式或說「測試應會通過」不是實測；只有文件或查詢型任務才可明說為何豁免實測，而不能把豁免偽裝成通過。**實證出處：** `agency-os/AGENTS.md`〈R0〉的 `[驗證計畫]` 四動作與 `REALTEST_WAIVED` 規則；`agency-os/AGENTS.md`〈R4：聲稱即驗證〉的四動作落實檢核。

把四項結果寫成能被後人核對的 artifact，而不是一段自我評價。真實紀錄中，對 schema 的 golden test 與對抗驗證、對覆審 finding 的逐條核對、以及跨文件 stale-claim 搜尋各自記錄，才讓「已完成」可被重放與質疑。**實證出處：** `WORKLOG.md`〈2026-08-30（續30）〉的 `REALTEST_EVIDENCE`／`REVIEW_DONE`／`BUGHUNT_DONE` 三項證據；`WORKLOG.md`〈2026-08-30（續22）〉以 SSH、PowerShell 與憑證 dry-run 實測並另記 review／bug hunt 的紀錄。

「完成」的定義隨任務型態而異，四動作驗證的具體內容要先對上型態，而非套用同一份清單：程式改動要真跑＋覆審＋抓蟲＋工作紀錄；純文件或查詢型任務可豁免實測但要明說豁免理由；基礎設施要看到症狀真的消失；技術決策要有記錄與人類確認接受。規劃輸出的驗證計畫段落應先講清楚這次適用哪一種完成定義，再列驗證步驟，避免用程式改動的高標準套用在查詢型任務、或用查詢型任務的低標套用在正在動的程式邏輯上。**實證出處：** `agency-os/AGENTS.md`〈任務完成標準（DoD）〉依 Code change／Infrastructure／Client site／Technical decision／Research／System health 六種型態分列完成條件。

## 12. 同一缺陷類別再出現時，先找不變量，不要補第三個洞

第一次修正可針對被證實的實例；同一 reviewer 第二次指出同類問題後，下一次修正前必須先回答：這個問題類別被違反的完整不變量是什麼，這次設計關掉的是整類還是單一實例？若只能關單一實例，要明說其限制並取得人類同意，不能用「範圍很小」掩蓋它仍是補丁。**實證出處：** `agency-os/AGENTS.md`〈補丁判準〉與〈同一 reviewer 對同一段程式碼連續回報 2 次〉的強制規則；同段記載 2026-08-24 deletion tracking 被連續打回八輪的根因。

不變量分析也要界定真實範圍：找出同類模式的全部候選，逐一確認哪些真受影響、哪些只是表面相似，才可說「已全數處理」或「此為有界孤例」。這避免反過來把單一 finding 擴張成未證實的全系統重寫。**實證出處：** `WORKLOG.md`〈2026-08-29（續26）〉對 StrictMode 下 `Where-Object` 的 `.Count` 問題做 0／1／多命中驗證，並以同類搜尋確認僅兩處真實實例；`agency-os/AGENTS.md`〈R4：聲稱即驗證〉要求「清單完整」須以 Glob/Grep 對照。

## 13. 讓流程重量隨風險增加，並按固定優先序解衝突

把工作先分成可逆且低爆炸半徑、涉及核心邏輯／新依賴／auth 的中度風險，以及 production、不可逆資料、身分權限、憑證或金流等 High-STOP。低風險可直接做並說明假設；中風險先提計畫；高風險停止並等明確 go-ahead。這避免把每個 typo 都變成昂貴審議，也避免把不可回復操作當一般修正。**實證出處：** `agency-os/AGENTS.md`〈操作風險分級〉表；此為一手操作政策，無須捏造 WORKLOG 軼事。

規則看似衝突時，不臨時挑對自己方便的一條：已明列的預授權流程優先於風險分級，風險分級再優先於一般的逐項批准預設。將這個順序寫清楚，AI 才能區分「可直接完成已授權收尾」與「必須為高風險決定停下來」。**實證出處：** `agency-os/AGENTS.md`〈規則優先序（衝突裁決）〉的「預授權 > 風險分級 > R0 逐項批准」。

## 14. 交接給其他 agent／工具時，brief 要可驗證，回傳也要重驗

給另一個 agent、模型或工具的 brief 必須包含五項：有位置證據的問題、已知事實、已排除原因、預期輸出形狀，以及不可觸碰的邊界。缺其中一項會讓對方自行猜測範圍或驗收標準；高品質交接不是把大量背景原封不動轉送，而是留下足以獨立查證的決策與約束。**實證出處：** `agency-os/AGENTS.md`〈Subagent 交接協議〉的五項強制 briefing 要素；`agency-os/AGENTS.md`〈跨模型 oracle〉明定給外部 reviewer 的輸入只放 Decision／Constraints／Files／Acceptance。

收到回傳後仍要核對 cited `file:line` 是否存在、建議是否符合相鄰慣例，並要求任何「可能」或「大概」補上證據；自信的措辭不是驗證。實際交接紀錄中，接手者先自行重跑測試並 spot-check 回傳的路徑缺口後，才決定後續工作，沒有把 handback 當成真相。**實證出處：** `agency-os/AGENTS.md`〈Subagent 交接協議〉的回傳驗證要求；`D:\tmp\ai-lego-phase5-prototype\CLAUDE_NEXT_TASKS.md` 開頭段落記錄獨立重跑 8 項測試與 spot-check 一個 gap claim。

## 15. 把 session 與 context 當成有限、會複利的資源

一個連貫任務使用一個工作 session；結案時把狀態放入工作紀錄、任務板與長期記憶，而不是留在聊天裡。這讓後續接手者從版本庫重新取得事實，也防止早期多餘內容在每一輪對話反覆佔用 context。**實證出處：** `agency-os/AGENTS.md`〈Session 衛生〉的「一個任務一個 session」與 durable closeout 規則。

節省 context 不等於片段化理解：準備修改或驗證的檔案必須全文讀，大片日誌或跨二十份以上檔案才先過濾或委派。真實事故曾因只讀 `check-smoke-tests.ps1` 的局部而漏掉檔頭的 `$ErrorActionPreference`，也曾因三次裸跑 CLI 各帶入約 120KB 輸出而永久增加約 366KB session 成本。**實證出處：** `agency-os/AGENTS.md`〈Session 衛生〉的讀取矩陣與 `check-smoke-tests.ps1`／120KB 兩個具名案例。

## 16. 把關鍵紀律綁上機械檢查，並定期驗證檢查本身還活著

寫在文件裡的規則只能被讀到，機械檢查（pre-commit hook、CI gate、提交前的自動掃描）才能被強制。凡是本 SOP 前述任何一條紀律（提案批准分離、四動作驗證、跨檔 stale-claim 掃描）若已有工具可自動判斷「證據行是否存在」，就應該接一個檢查擋下不合格的提交，不要只靠自覺遵守——尤其在會有無跨 session 記憶的 AI 持續接手時，機械檢查是唯一不會被遺忘的把關者。**實證出處：** `mcp/claude-userlevel/hooks/rules/` 下的 pre-commit／pre-edit 檢查群（`git-log-injector.js`、`verify-gate-commit.js`、`high-risk-bash-warn.js` 等），把 R0／R4 的紀律從文件規則變成寫入前的實際攔阻。

但要誠實記錄機械檢查的已知邊界，不可把「檢查通過」誤當「內容正確」。多數自動檢查只能驗證「證據格式存在」，無法驗證證據內容真實（例如無法重放一段聲稱已執行的指令）；且檢查本身通常設計為 fail-open（檢查邏輯壞掉時預設放行，而非擋下一切），所以檢查的健康度要有獨立、定期的自我測試，而非只信任「至今沒被擋下」。**實證出處：** `agency-os/AGENTS.md`〈已知信任邊界（明文，勿誤當保證）〉明文承認 `verify-closeout-completeness` 只驗格式不驗內容、機械閘 fail-open 且以 `scripts/test-hooks.sh` 驗證閘的健康。

## 17. 最小啟動清單

第 1 階段：建立一份系統敘事正本（目的、邊界、權責與長期不變量）、ADR index、open-questions register，以及母文件修訂用的 proposal template；同日採用本 SOP §10 的任務規劃閘與 §13 的風險分級。先讓每一個未決事項和每一次後續修改都有可追蹤的位置；不必先做一整套 schema。若工具鏈已支援（例如既有 CI 或 pre-commit 機制），同時把 §16 最容易自動判斷的一兩項（提案是否有批准欄位、commit 前是否附驗證證據）接成機械檢查，不必等到規模變大才補。**實證出處：** `ADR-006` L63-118 提供可最小化採用的提案結構；`ADR_INDEX.md` L28-39 展示決策依賴關係需要集中追蹤；`agency-os/AGENTS.md`〈R0〉與〈操作風險分級〉。

第 2 階段：只為已被選定的第一條垂直切片或既有消費端建立機讀契約；每個契約附來源、決策與編譯選擇。對尚無使用證據的物件，登錄為 deferred 並寫下重新檢查條件，避免「規格越多越完整」的錯覺。**實證出處：** `MACHINE_READABLE_SPEC_PLAN.md` L80 對 `READY`／`BLOCKED_PENDING_ROUND2_ADR`／`SKELETON_ONLY` 的區分；`WORKLOG.md`〈2026-08-30（續30）〉對 10 個未被 Research 切片使用的 typed objects 作出 DEFERRED 決定。

第 3 階段：對第一個跨文件決策建立 ADR；對第一個權威文件編輯建立 proposal，但不要自行批准；捕捉 diff 後做一次獨立覆審並將 artifact 連同結果落庫。首次有 committed contract change 時，同時執行 §11 的實測、review、跨檔抓蟲與工作紀錄四項驗證；完成後以「同檔全文＋全庫 claim 搜尋」檢查 stale state。**實證出處：** `ADR-006` L107-118；`.claude/commands/codex-review.md` L15-55；`WORKLOG.md`〈2026-08-30（續30）〉的 stale-claim 修正與 artifact 驗證記錄；`agency-os/AGENTS.md`〈R0〉的四動作驗證計畫。

## 18. 對外販售的產品：開工前填完交付清單

AwareWave 的產品或系統工具只要會給客戶用（代操、訂閱、點數或買斷），規劃時就逐條回答下面五題；答案由 `scripts/new-product.mjs` 寫進 `lib/portal/products.ts` 那一列（整套新系統先走 System Foundry 問卷，再 `new-product.mjs --from-foundry`；小工具直接答五題；ADR 017 §0b 第 8 條）。少填一欄，`products.test.ts` 就紅燈。規則本體是 ADR 018，這裡只列要回答的題目。**實證出處：** `018-product-doors-and-buyout-delivery.md` §1–5；`017-entitlements-and-self-hosted-modules.md` §5。

1. **子網域**（`subdomain`）：線上叫什麼？不能是 app、portal、www。網址由基底網域組出來，程式裡不寫網域。
2. **門**（`door`）：頁面和 API 在 next-admin 的哪個前綴？前綴不能碰到員工路由；不在 next-admin 就填 external。
3. **登入來源**（`loginSources`）：`local`、`awarewave-wp`、`customer-wp` 裡開哪些？一定要有 `local`。
4. **能不能單獨安裝**（`standalone`）：買斷客戶只買這一個時裝不裝得起來？依賴的模組列進 ADR 017 §5 的模組清單。
5. **買斷要換的設定**：基底網域、登入來源、客戶自己的 API key 各在哪個環境變數？寫進該產品的模組清單（ADR 017 §5），不寫進程式。

## Evidence boundary

新系統若缺少相同的風險、寫入控制或多人接手情境，應縮小採用範圍，而不是假稱全套流程已被需要。**實證出處：** `CODEX_HANDOFF_UNIVERSAL_SYSTEM_SOP_2026-08-30.md` §0、§4；`ADR-018` L24-42 的「治理控制面」條件式選擇。

## Related Documents (Auto-Synced)
- `docs/architecture/decisions/ADR_INDEX.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/operations/new-doc-linkage-checklist.md`

_Last synced: 2026-10-15 06:19:20 UTC_

