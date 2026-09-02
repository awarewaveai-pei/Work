# Search & Content Architecture Pack — 獨立驗證報告

**日期**：2026-09-02
**受測對象**：`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_Cognitive_Engineering_OS_Search_Content_Architecture_Pack/`（12 份文件，4475 行）
**驗證方法**：兩個多代理 workflow（缺口分析 35 agents／內容驗證 18 agents）+ Claude 逐條獨立複驗
**受測 baseline**：`4b26e8361`（已確認存在，為當時 main HEAD）

---

## 一句話結論

**骨架是對的，內容是空的。** 這個 pack 的邊界紀律、範圍取捨、文件切分都做得好——但它的關鍵交付物（gate 通過條件、registry 紀錄、cardinality/invariants）全部是**填空模板而非填好的內容**，現階段無法據以實作。

---

## 一、做對的地方（不要重做）

這些經過對抗式查證仍然成立，是真價值：

1. **平台邊界紀律正確。** 29 個「你可能還缺這份文件」的候選缺口，對抗驗證後 28 個被駁回，駁回理由幾乎都是「平台層已有 ACTIVE schema/ADR 擁有它，垂直層再寫一份就是第二套真相」。這代表 12 篇的取捨是刻意的，不是漏想。
2. **證據引用的內容是真的。** 逐條複驗：`Architecture-Constitution-v1.md:9` 確有「Scoped Authority 裁決鏈」、`ADR-006:3` 確有「Claude 永遠不能自我推進至 APPROVED」、`claim.schema.yaml` 確有 supporting/contradicting/confidence/provenance。GPT 真的讀過這些檔案。
3. **狀態誠實。** 全部標 `PROPOSED`，ADR 明寫必須 operator 明示接受，沒有自我批准。

---

## 二、BLOCKING — 實作前必須修

### B1. Quality Gates 有 51 個 gate，0 個有通過條件

- **證據**：`SEARCH_CONTENT_QUALITY_GATES.md` 唯一命中 51 個 `search_content.*.*` gate ID；`threshold|pass_criteri|>=|<=|minimum|門檻` 全文只命中 **3 次**。
- **具體**：`search_content.seo.freshness` —— 多新算新？`search_content.evidence.*` —— 幾筆證據算夠？沒有一個 gate 答得出來。
- **影響**：文件名承諾「內容必須通過的品質閘」，實際只列了要檢查什麼，沒定義任何一項怎樣算通過。gate 無法實作，也無法測試。

### B2. Registry 有 90 個 machine ID，0 筆完整紀錄

- **證據**：`SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md` 的 `registry_entry` 全文出現 **1 次**（空模板，每個欄位空白）；`owner:` 有填值的行數 **0**。
- **影響**：README 核心原則 #2 是「所有 Machine ID 只有一個 canonical registry」，而這份就是那個 registry。它註冊了 64 個 method + 26 個 capability 的 ID，但沒有任何一筆說明 owner / status / version。MVP 的兩個 precondition（method / capability registry canonicalized）因此無法誠實勾選。

### B3. 同一個物件在 pack 內被定義兩次（違反自己的紅線）

- **證據**：`search_source_profile:` 同時定義於 `SEARCH_CONTENT_DOMAIN_MODEL.md` 與 `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md`，欄位不一致（後者 `domains: []`、缺 `tenant_ref`/`workspace_ref`/`created_at`/`updated_at`），且無 SSOT 宣告。
- **同類**：`citation_observation` 在 `SEARCH_INTELLIGENCE_SPEC.md:229` 以 6 個不同欄位名重新定義了 `DOMAIN_MODEL §2.7` 已擁有的物件。
- **影響**：這正是整個 pack 存在目的要防止的「第二套真相」。

### B4. Tenant 在兩份關鍵文件完全缺席

- **證據**：`grep -ci tenant` → `SEARCH_SOURCE_PROFILE_AND_AUTHORITY_POLICY.md` = **0**、`SEARCH_CONTENT_QUALITY_GATES.md` = **0**。
- **影響**：平台 `specs/execution/event-ledger.schema.yaml` 將 `tenant_id` 列為必填，且 tenant 是明文的 blast-radius 邊界。這是多客戶代操場景，租戶隔離不能在 gate 與 source policy 層缺席。

---

## 三、MAJOR — 儘快修，但不擋路

### M1. 引用行號是湊出來的整數，非實際讀出

- `Architecture-Constitution-v1.md:L1-L90` → 實際 **84** 行
- `ADR-006-...md:L1-L220` → 實際 **181** 行
- `claim.schema.yaml:L1-L180` → 實際 **178** 行
- **判讀**：內容摘要正確（見「做對的地方」#2），但行號範圍是生成的，不是讀到那一行得出的。這直接反駁 `BUILD_MANIFEST.json` 的 `has_evidence: true` 所暗示的驗證強度。

### M2. 兩個來源檔名不存在

- 12 份文件的檔頭全部引用 `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_zh-TW.md` 與 `SEARCH_CONTENT_DOMAIN_ARCHITECTURE_CRITICAL_REVIEW_zh-TW.md`——**這兩個檔名從未存在於 repo 歷史中**。
- 正確檔名：`AI_LEGO_Cognitive_Engineering_OS_Search_Content_Domain_Architecture.md` 與 `..._Critical_Review.md`。
- 修法：單次 find/replace，12 份一起改。

### M3. 缺一份文件：客戶自有站沒有被定義

- **證據**：`SiteContext|site_context|OwnedSite|ClientSite` 全 pack **零命中**；但 `existing_url_refs`（`DOMAIN_MODEL:295`、`CONTENT_BRIEF_CONTRACT:139`）與 `crawl_policy_ref`（`DOMAIN_MODEL:143`、`SOURCE_PROFILE:125`）已在 MVP 路徑上懸空指向一個沒人定義的型別；`search.fetch_site_crawl` 只在 `REGISTRY:261` 註冊，無 contract。
- **為何不能塞進第 4 篇**：`SEARCH_SOURCE_PROFILE` 管的是**證據來源**權威性，客戶的站是**被優化對象**——不同指涉物，硬塞會汙染 authority 模型。
- **建議**：新增 `SITE_CONTEXT_AND_CRAWL_MODEL.md`，或把材料折進 #3/#5/#10/#8（但必須落地）。

### M4. 發布後驗證被降級為發布前驗證

- 架構 §31.7 Publish Verification 要求發布**後**驗 canonical / indexability / structured data / internal links。
- `PUBLISHING_ADAPTER_CONTRACT.md`：這四項出現在 **§9 Publish Validation（發布前）**，§10 Verification（發布後）只剩 provider object id / content hash / published state / metadata。
- **為何是問題**：發布前檢查驗的是自己的草稿；發布後檢查驗的才是 CMS 實際吐出來的頁面。WordPress 這類 CMS 改寫 canonical、吃掉 structured data、竄改內部連結是常態——架構把這四項放發布後正是為了防這件事。

---

## 四、其他值得一行帶過

- crawl **行為**規範（robots.txt／crawl-delay／識別 user-agent／TDM opt-out `noai`／DSM Art.4）全 repo 零命中，而 `crawl_policy` 目前只有 `enabled: true` → 補進 #4 §8。
- `ContentDraftGenerated` 是 15 個 event 中唯一全 pack 零命中者 → ADR D6 補一行。
- 「不得偽造評論」（§27.6）「doorway page」（§27.5）目前是散文，無對應 gate ID → #9 補列。
- MVP slice 未綁定任何具體值（形狀正確的骨架），且未承認平台已有一個經 `ADR-014`（ACCEPTED）批准的 MVP vertical slice。

---

## 五、下一步建議

### 交給 GPT（可直接複製的任務清單）

1. **填 gate 通過條件**：`SEARCH_CONTENT_QUALITY_GATES.md` 的 51 個 gate，逐一補 severity（BLOCK/WARN/INFO）與可機器判定的通過條件。無法決定門檻值的，明寫 `OPERATOR_SET_PENDING`（平台既有慣例），**不要自己發明數字**。
2. **填 registry 紀錄**：90 個 machine ID 逐筆補 owner / status / version，或明確標 DEFERRED 並寫重啟條件。
3. **消除重複定義**：`search_source_profile` 與 `citation_observation` 各擇一份為 SSOT，另一份改為 `$ref` 引用。
4. **補 tenant**：`SOURCE_PROFILE` 與 `QUALITY_GATES` 兩份補上 tenant scoping。
5. **修引用**：兩個 `*_zh-TW.md` 檔名 find/replace 成真檔名；三個超範圍行號改為實際行數或直接移除行號。
6. **把四項發布後檢查搬回 §10**（發布前保留一份無妨，但發布後必須有）。
7. **補站側模型**（M3）。

### 保留給 Claude／操作者

- ADR 接受與否（`ADR_SEARCH_CONTENT_BOUNDARY_AND_OWNERSHIP.md` 目前 PROPOSED，依 ADR-006 只有操作者能推進）。
- 任何寫入 `D:\Work` 既有母文件／schema 的動作。
- gate 門檻值的最終決定（平台既有紀律：不得由 AI 發明門檻）。

---

## 附錄：驗證方法與可信度邊界

- 本報告的 BLOCKING 四項與 MAJOR 的 M1/M2/M3 皆由 Claude 以 `grep`/`wc`/`find` 獨立複驗，非僅採信 agent 輸出。
- Workflow 原始輸出宣稱「62 個路徑引用損壞」——**此數字會誤導**：實際只有 6 個相異錯誤，因 12 份共用同一張證據表而各出現一次。本報告已據實修正。
- 跨文件一致性、批判審查回應度、架構保真度、治理合規四項稽核在首輪撞上 session limit，重跑中；其結論未納入本報告。
