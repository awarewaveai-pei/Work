# 計畫審查：A 目前客戶計畫 × B ADR 021 會員模型（2026-11-21，獨立審查，只讀）

NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；VW = `.../apps/video-workbench/`；A = `CLIENT-CONTEXT-PLAN-20261121.md`；B = `agency-os/docs/architecture/decisions/021-membership-model.md`。所有 file:line 由本審查者親自開檔核對。DB 未查（不需要）。

## 0. 計數
Critical 1｜Major 17（A 11、B 6）｜Minor 10

## 1. A 引用抽驗（共核 60+ 處）
符合（節錄）：`use-active-org.ts:9,11`；`OrgSwitcher.tsx:9,15`；`integrations/page.tsx:66-67,195,234`；`BannerStudio.tsx:1125-1126`；`OutreachTab.tsx:62`；`collect/page.tsx:41,58`；`repairs/page.tsx:24`；`inbox/page.tsx:44`；`ClientCard.tsx:137`；`ClientHubTabs.tsx:211-212,550,556,790`；`[slug]/page.tsx:47,60-64`；`OrgPicker.tsx:86,101,143,167-189`；`ContentStudio.tsx:482,488-507,774,1953,2203`；`TopicsBoard.tsx:151,156,159,196-203,400,421-428,443`；`ScriptForge.tsx:1145,1176,1184`；`ReleaseDeliveryPanel.tsx:40,89`；`review-release/page.tsx:12`；`release/page.tsx:13-16`；`organization/route.ts:45`；`session/route.ts:11-13,26-32`；`video-organization.cjs:3-4`；VW `adapters.js:121-127,173,208`、`organization-picker.js:7-13,17-28,84-95`、`index-1.js:139-148`；`tenant-guard.ts:24-25,100-122,193-216`；`middleware.ts:24,50-51,137-138`；`doors.ts:23-25,30-41,66,76-90`；`products.ts:11,42-98,79`；`hosts.ts:8-10,12-14,17-19,26-28`；`wp-sites.ts:111-132,153-161`；`pick-initial-site.test.ts:14`；`sites/route.ts:41-42,48-53,135-137`；`overview-load.ts:54`；`ops/clients/page.tsx:6-18`；`sidebar-sections.ts:9,82`（link 56 正確：grep 57 含第 9 行型別）；`client-picker-rule.test.ts:13-18`；`auth-cookie-options.ts:4`；`door-link.ts:12,30`；`bootstrap/route.ts:13-30`；`org-search/route.ts:24`；`DoorContext.tsx:8-22`；`door-href.ts:6-11`；ADR 018 `:12,:28-32,:46,:71`。
不符：見 Minor m1–m3。

## 2. 發現

### Critical
| # | 位置 | 問題 | 證據 | 最小修正 |
|---|---|---|---|---|
| C1 | A §4d、§5「自動部署把半套上線」 | `DEPLOY_HOLD` 不只停 next-admin 夜間部署，而是擋所有 app 的 sg-deploy（含手動）；整批 7 波期間 oracle-web（另一視窗正在部署）、video-workbench 都被拒；A 自己的 C11b「VW 手動部署」在 HOLD 下也做不了（自相矛盾）；next-admin 一週 168 個 commit 被壓成一次大爆炸半徑上線 | `scripts/sg-deploy.sh:204-217`（every app deploy is refused -- manual runs included）；`auto-deploy-next-admin.sh:124`；`git log --since=2026-11-14 -- apps/next-admin` = 168 | 取消全程 HOLD；改「先上惰性積木、再逐頁切換」（§5 新順序），每波自身一致、可隨夜間部署上線；High 卡（C3、C11b）push 前取得操作者 go |

### Major — A
| # | 位置 | 問題 | 證據 | 最小修正 |
|---|---|---|---|---|
| A1 | A §3b、C3、C9、C11a | 「某客戶的網站清單」兩個來源：`/api/client-context` 回 `sites`，C9 又給 `/api/content/sites` 加 `?organizationId=`；C11a 用前者、SiteManager 用後者。org 清單變三條（org-search、bootstrap、client-context） | A:128 vs A:181、A:183；`bootstrap/route.ts:37-48` 已有 first/include/q/scoped | C3 縮成「把 bootstrap 的 org 清單邏輯搬到門上可達的平台路徑」（只回 PickOrg，不回 sites／status），bootstrap 改呼叫同一 lib 或 VW 改打新路徑；網站清單唯一來源＝`/api/content/sites?organizationId=`（C9）；`status` 由 C2 `decide()` 在前端算 |
| A2 | C3 掛 `PLATFORM_APIS` | `PLATFORM_APIS` 自動成為「所有員工都能用」，客戶名清單從 6 個工具擁有變成全員工可讀，與 ADR 019 逐工具授權矛盾 | `staff-tools.ts:20`（org-search 只歸 6 格）、`:64`（`STAFF_PLATFORM.apis` 含全部 PLATFORM_APIS）；ADR 019 `:14,:16` | ADR 020 明寫此擴權並經操作者同意，或新路由在 `STAFF_API_OWNERS` 歸格、不經 STAFF_PLATFORM |
| A3 | C5（scope 必填）＋scope-declared 雙向測試 | 同一事實（此頁要不要客戶）寫兩處：登記表 `scope` 與頁面是否呼叫 `useClientContext`，再用測試逼兩者一致＝畫蛇添足；且要改 56 個側欄項＋全部 door nav（`sidebar-sections.ts` 多視窗高頻改動，必撞 merge） | A:139、A:177；`sidebar-sections.ts:9` | 刪 `scope` 欄位：頁面 `useClientContext(scope)` 把 scope 登記進外框提供的 context，外框固定位置渲染頂部列；選單連結一律帶目前 `org`（`site` 只在同 org 內帶），目標頁不用就忽略 |
| A4 | A §3a、§3c hook `setOrg` | 換客戶時「保留其他參數」→ 舊 `site` 留著 → 依「不一致」規則變 `site_mismatch` 錯誤畫面；「同頁只換參數」場景必踩 | A:122、A:137；現有 `OrgPicker.tsx:180-185` 就是保留全部參數 | 契約加一條：`setOrg` 一律清掉 `site`（及依附 site 的 `topic`） |
| A5 | A §3a ④、§6 決定 1 | 「沒選客戶」三種語意：契約＝未選；VW 員工無 org＝內部帳戶（自用）；開發信 null＝「自用 / 未指定」。契約未處理 VW 必有 org，也與 B「自用」不接 | `session/route.ts:13,43-45`；`OrgSwitcher.tsx:15`；ADR 017 `:34`（自用＝`kind=internal`） | ADR 020 定：「自用」＝內部組織的明確 org id，null 永不代表自用；VW 無 org 的現行為列為例外或同批改 |
| A6 | A §3a 優先序 ①>② | 客戶帳號（①=Y）登入白牌主機（②=X）時 ① 勝 → 在 X 的品牌網址顯示 Y 的資料；ADR 018 規定命中白牌＝該計費帳戶 | ADR 018 `:32` | 契約：① 與 ② 不同 → 拒絕（403／導回），不是取高者 |
| A7 | C10 在第 2 波、C8 在第 4 波 | C10 把客戶頁外連改成 `?org=&site=`，但 ContentStudio 到 C8 前只認 `siteId`；空 siteId → 選清單第一個站＝可能是別的客戶的站 | `ContentStudio.tsx:482,774`；`pick-initial-site.test.ts:14`（空字串 → `SITES[0]`）；A:182、A:223 | C10 依賴 C8（排在 C8 之後） |
| A8 | A §4e L8 | 伺服器端「沒給 siteId 就取第一個可存取站」延後；員工呼叫＝任一客戶的 WordPress。「不得退回第一個」只在畫面層成立，未關整類 | `wp-sites.ts:103-105,123-126` | 併入 C8：無 siteId 時，客戶帳號且恰 1 站 → 該站，其餘 → null（與 §3a「恰 1 站自動」同規則） |
| A9 | C11a vs A §3f、C5 | §3f 把 `/tools/video` 列後續批（scope none），C11a 卻要它「帶目前 org」；C5 雙向測試（scope none 卻用 hook）會紅 | A:165 vs A:183、A:177 | C11a 一併把 `/tools/video` 納入第一批並宣告 org |
| A10 | C11b | 沿用現成切換流程，結尾 `location.assign("/")` → 丟掉 `?open=` 深連結，從 app 帶客戶開某工具會落在首頁 | VW `organization-picker.js:95` | C11b 驗收加「切換後回到 `/?open=<原值>`（去掉 org）」 |
| A11 | A §3c 跨網域、C14 | `productHost()` 讀 `process.env`；在 use client 元件（DoorNav／SidebarNav／頂部列）裡 `PRODUCT_HOST_*` 讀不到 → 獨立主網域被默默換回子網域；C14 的 Node 測試吃 env，會假綠 | `hosts.ts:26-27`；`DoorNav.tsx:1`、`SidebarNav.tsx:1` 為 client；現行正確做法＝伺服器算好傳 prop（`WorkbenchEntry.tsx:14`） | 契約：主機只在伺服器算、以 prop／context 傳下；`withContext` 只收 host 字串；C14 加「client 元件不得 import `hosts.ts`」 |

### Major — B
| # | 位置 | 問題 | 證據 | 最小修正 |
|---|---|---|---|---|
| B1 | B §2「身分來源：WordPress…app 的 organizations 是副本」 | 記錄系統方向與 ADR 017 相反（會員主檔在 Supabase、WP 只是登入來源）；B:27 又說 §0b-6 不變＝同文自相矛盾；「副本」需要刪除／改 email 同步，缺口表沒列 | ADR 017 `:53`；B `:22` vs `:27`；現況報告 N3（`WP-MEMBERSHIP-STATUS-20261121.md:188`） | 改寫：主檔在 Supabase；WP 會員是該單位的一個外部身分（`customer_identities`）；加缺口「WP 會員刪除／改 email → app」 |
| B2 | B D1「無例外」 | 四種情況不成立：自用（`kind=internal`；程式只建／收 `kind=customer` 根組織）；E2E／測試組織；轉售站（會員屬轉售站不是 aware-wave.com，同人跨站被拒）；買斷安裝內單位（B:27 自己說照 ADR 018 §3） | `wp-customers.ts:27-30,45,56,121,185-187`；ADR 017 `:34`；B `:27` | D1 改為「我們 hosted 安裝裡、`kind=customer` 的根組織，各有一個收銀台網站會員（預設 aware-wave.com；轉售站客戶屬該站）」；internal／測試明列排除 |
| B3 | B D5「管理者＝持有會員的那個人」＋「先補組織層 owner」 | 一事實兩寫入方：`customer_identities.user_id`（誰持有會員）與 `organization_memberships.membership_type` = owner；聯絡人離職／換管理者無路徑（`linkIdentity` 只接受三欄相同，否則 identity_conflict） | `0001_core.sql:45`；現況報告 `:68`；B `:17` | 擇一：owner 由 identity 推出（不另存），或 owner 為唯一來源、identity 只記外部帳號；補「轉移會員」流程（WP 改 email＋identity 改 user）為缺口 |
| B4 | B D4 × `adoptableClient` | 只有「聯絡人 email＝該組織既有 client 帳號 email」才連到既有組織；否則 `ensureWpCustomer` 新建 `wp-member-<id>` 組織＝重複單位。現有 6 個組織多數沒有 client 帳號；且整條只在付款事件跑 | `wp-customers.ts:119-133,169,177-190`；現況報告 §7（`:124-139`） | G1 明寫：代辦由員工在客戶頁指定既有 organization_id 綁定（伺服器驗 WP 已驗證 email），不靠 email 比對 |
| B5 | B D3 | 「五種方式由三軸算出、寫成標籤」，但代操／自用屬 C 軸（每次請求的 actor），不是單位屬性；推導式未定義 → 不可實作、各人各算 | ADR 017 `:30,:34-35` | B 補一張表：每個標籤的判定式（例：代操＝有維運加購或員工代辦授權），放在 `lib/entitlements/` 單一函式 |
| B6 | B §2「人…登入走 local」 | 與登記表及 ADR 018 §3 不符：cognitive／hci／social 有 `awarewave-wp`，social 有 `customer-wp`；oracle「客戶練習」正走 customer-wp | `products.ts:43,46,49`；ADR 018 `:44` | 改為「人＝app 帳號；登入來源照該產品 `loginSources`（ADR 018 §3）」 |

### Minor
| # | 位置 | 問題 | 證據 | 修正 |
|---|---|---|---|---|
| m1 | A F5、§4c | 引用 `doors.ts:114-118`、`:107-118`，檔案只有 111 行 | 實際在 `doors.ts:107-111`（`:109` not_found） | 改 `:107-111` |
| m2 | A F15 | 引 `ContentStudio.tsx:761-767` 當「effect 讀一次」證據，該段是「已改成 reactive」的說明 | `ContentStudio.tsx:761-782` | 只留 `TopicsBoard.tsx:196-203` |
| m3 | A F4 | `(shell)/layout.tsx:36` 是 SidebarNav 一行，不能證明「layout 拿不到 searchParams」 | `(shell)/layout.tsx:36` | 改引 Next 文件或刪 |
| m4 | B §5 第 2 條 | A 已寫 020、ADR_INDEX 已保留 020，此條過時 | A:173；`ADR_INDEX.md:49` | 刪 |
| m5 | B §2 | 鍵寫 `(site_id, wp_user_id)`，實際欄位 `external_id` | 現況報告 `:67` | 改名 |
| m6 | A §3c | 頂部列與頁面各自呼叫 hook → 各自 fetch，無共享 provider | A:137-138 | hook 讀外框 provider，只抓一次 |
| m7 | C5 刪 `topics/clients` 早於 C7 | 第 2–4 波間 `CLIENTS_PAGE` 連結指向 404 | `TopicsBoard.tsx:151,156,443` | 刪頁併入 C7 |
| m8 | A §3a「未選」 | 單一客戶安裝（買斷）每次都要先挑 | — | 與網站同規則：可見 org 恰 1 個 → 自動選 |
| m9 | A §3e × B G1／G4 | 會員／代辦／授權畫面沒有位置；若 G 卡新增分頁會改 `ClientHubTabs.tsx:2472`（C10 同檔） | `ClientHubTabs.tsx:2472,2557`（帳號分頁＝`AccountsCard.tsx`） | §3e 加一列：員工端在客戶頁「帳號」分頁（`AccountsCard.tsx`）；客戶自助授權在 portal 工作區（組織層，不屬任一產品門）；G 卡排在 C10 後 |
| m10 | B D1 | 集團／子公司（`parent_organization_id`）是否各為「單位」未定 | ADR 017 `:220`；`wp-customers.ts:45` 只收根組織 | 明寫：單位＝根組織；子組織不另開會員 |

## 3. 逐題結論
- 題 1：60+ 處抽驗，3 處不符（m1–m3），其餘相符。
- 題 2 場景：員工無參數 ✓（但見 A5）；客戶帶他人參數 ✓（`tenant-guard.ts:198-205`）；網站不屬客戶 ✓；同頁換參數 ✗（A4）；app → video／content ✓，但主機計算有洞（A11）、深連結丟失（A10）；買斷單一客戶 △（m8）；未來自有網域 ✗（A6）；兩分頁兩客戶存檔 ✓（網址每分頁；VW 單 cookie＋BroadcastChannel 鎖，`organization-picker.js:17-28`）。
- 題 2 畫蛇添足：C3 的 sites／status（A1）、C5 scope 欄位與雙向測試（A3）。C11b 確認窗必要（cookie 是 VW 子請求授權來源，`session/route.ts:29-31`；連結不得悄悄換客戶），保留。漏卡：伺服器 site 後備（A8）。
- 題 2 檔案／依賴：無循環；無同檔衝突；跨波語意依賴錯 2 處（A7、m7）、範圍矛盾 1 處（A9）。HOLD 影響見 C1。
- 題 3：見 B1–B6、m10。D4 與 `adoptableClient` 只在 email 相同時相容（B4）。分類單向寫 FluentCRM 本身符合 §0b 第 5、6 條（經 `crm` 接頭、`crm=none` 可替換），問題在 B1 的主檔方向。
- 題 4：A 識別符（`organizations.id`）與 B `customer_identities` 不衝突（identity 是 org 的外部身分）。優先序在買斷／customer-wp 成立（客戶帳號恆 ①），白牌除外（A6）。C10 與 G1／G4／G5 只在 G 加分頁時同檔（m9）。「自用」語意需兩份一起定（A5 × B2）。先後：A 第 1、2 波 → B 改文 → G5 → G4 → G1（在 C10 後）。
- 題 5：實際衝突＝B §2 vs ADR 017 `:53`（B1）；B D1 vs ADR 017 `:34` 與 4c 轉售（B2）；B §2 登入 vs ADR 018 `:44`（B6）；A C3 vs ADR 019 `:14,:16`（A2）。A §4c 排除理由逐條成立（ADR 018 `:71`、`hosts.ts:27`、`session/route.ts:11-13`、`doors.ts:107-111`）。ADR 015 無新增衝突（D6 與 015 §1 一致）。
- 題 6：沒有明顯更好的整體做法。現案（網址＝唯一來源、外框固定位置、伺服器授權不動、VW cookie 限定角色）在下列修正後為最佳。

## 已核無問題
- `/api/content/sites` 不回 token（`sites/route.ts:84-85`）；客戶只見自己站（`:74`）。
- 外框用 `useSearchParams` 不會觸發靜態渲染錯誤：兩個外框都用 `headers()`，已是動態（`(shell)/layout.tsx:17`、`ProductDoorShell.tsx:19`）。
- 客戶帳號無法以網址值越權：`effectiveOrgId` 忽略要求值（`tenant-guard.ts:198-205`）；middleware 先剝外來標頭（`middleware.ts:24,356-357`）。
- 產品門上 org-search 確實 404（`doors.ts:109`），bootstrap 只在 video 門可達（`products.ts:52` api `/api/video`），故「門上要一條 org 清單路由」成立（A1 只縮範圍、不刪 C3）。

## 4. 整體判定
修正後開工（A 骨架正確；B 先改文再拆 G 卡）。

## 5. 修正清單（依先後）
1. A §4d：刪全程 `DEPLOY_HOLD`（C1）。新順序：
   - 第 1 波（惰性，可隨夜間部署）：C1（ADR 020，含 A4、A5、A6、A11、m8 條文）、C2、C3 縮版（只搬 org 清單＋ADR 019 歸格；High，push 前操作者 go）、C4（含 provider，m6）、C6 改為外框插槽（無頁登記時不顯示）。
   - 第 2 波（逐頁切換，各自可上線）：C8（含 A8 伺服器規則）→ C10（A7）；C7（含刪 topics/clients，m7）；C9（網站清單唯一來源，A1）。
   - 第 3 波：C11a（含 `/tools/video`，A9）＋C11b（A10），VW 手動部署 High。
   - 第 4 波：C12、C14（加 A11 檢查）、C13。
2. A：刪 C5 的 `scope` 欄位與雙向測試，改頁面登記（A3）；C3 去掉 `sites`／`status`（A1）。
3. A：引用改正 m1–m3。
4. B：改 §2 主檔方向（B1）、D1 範圍（B2、m10）、D5 單一來源＋轉移流程（B3）、G1 指定既有 org 綁定（B4）、D3 判定表（B5）、登入來源（B6）；刪 §5 第 2 條（m4）、改鍵名（m5）。
5. A §3e 加會員／授權位置；G 卡排在 C10 之後（m9）。
