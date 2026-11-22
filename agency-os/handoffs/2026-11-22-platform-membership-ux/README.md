# 平台：會員、目前客戶、登入後介面 — 總覽

- 開始：2026-11-21｜更新：2026-11-22｜與影片專案無關（原誤放在 `2026-11-16-video-unify-supervisor/`，已搬出）
- 狀態：**第 1–4 批已上線（16 張）**；寫文章／題目／五步驟／網站四頁已改用側欄客戶欄；進度看 `data.mjs`（監工台 `supervisor.html`）。

## 1. 三塊工作

| 塊 | 解決什麼 | 正本 |
|---|---|---|
| 會員模型 | 誰是會員、身分怎麼分、代辦、授權 | `agency-os/docs/architecture/decisions/021-membership-model.md` |
| 目前客戶 | 員工替哪個客戶操作：全系統一種傳法、一個挑選方式 | `CLIENT-CONTEXT-PLAN-20261121.md`（卡 K1–K15；**待依藍圖改**，見 §4） |
| 登入後介面 | 會員與員工看到的版面、導覽、權益顯示；WordPress 怎麼接 | `PLATFORM-UX-BLUEPRINT-20261122.md`＋`platform-ux-wireframes.html` |

## 2. 操作者已定

- 跟我們買的每個單位都是 aware-wave.com 會員（含代操、經銷商、買斷買家、測試）；可代辦。他們自己的客戶與我們無關。
- AwareWave Ops＝Admin。
- 單位底下的人＝被授權的 app 帳號，不是會員。
- 身分三層：角色（Admin／客戶／TEST）→ 方式（訂閱／代操／買斷／點數／經銷）→ 產品。標籤成對貼（產品／方式），系統自動。
- 代辦用單位聯絡人 email，對方驗證後才連上；員工在客戶頁對指定的既有客戶發起。
- 先只賣點數。點數帳本維持原設計（ADR 015 §1：WooCommerce 賣點數包，帳本在 app，WordPress 會員頁讀餘額）；不用 TeraWallet。
- aware-wave.com 不裝 Ultimate Member、WooCommerce Memberships。
- 會員從 aware-wave.com 登入；用我們的外掛（`lobster-factory/packages/aware-wave-store-plugin/`）在「我的帳號」顯示產品與「進入」，工具留在各產品子網域，不嵌進 WordPress。
- 挑客戶：側欄清單（搜尋＋一列一個＋色點），分類別。
- 員工在 app 與各產品子網域都能用、都能換客戶。
- 網站設定：員工在客戶頁改；客戶在內容入口「網站」頁改。
- 內容入口（content.aware-wave.com）版面要重排。
- GPT 二十項：對將來有用的都規劃，標階段；與系統事實衝突的才改做法（取捨表在藍圖開頭）。

## 3. 文件

**照這個做（動工時讀）**

| 檔 | 內容 |
|---|---|
| `../../docs/architecture/decisions/021-membership-model.md` | 會員規則＋缺口 G1–G13 |
| `PLATFORM-UX-BLUEPRINT-20261122.md` | 藍圖：一頁結論、§2A 外掛怎麼包、§4 登記表要加的欄位、§8 權限狀態表、§17 路線圖與卡（U1–U35、W1–W8） |
| `platform-ux-wireframes.html` | 線框圖 16 頁，發布於 https://claude.ai/artifact/CZAXr4jabTBqzXs2tXdfcC |
| `CLIENT-CONTEXT-PLAN-20261121.md` | 目前客戶的契約與卡 K1–K15 |

**依據（動工不用讀）**

| 檔 | 內容 |
|---|---|
| `PLATFORM-UX-BRIEF-20261122.md` | 操作者原話＋GPT 二十項；驗收藍圖用 |
| `WP-MEMBERSHIP-STATUS-20261121.md` | 2026-11-21 WordPress 會員路徑現況（會過時） |
| `PLAN-REVIEW-20261121.md` | 獨立審查；發現已改進計畫與 ADR 021 |
| `../2026-11-16-video-unify-supervisor/R10-client-picker-inventory.md` | 挑客戶盤點（影片批 R10 產出，已完成） |

## 4. 尚未做

1. `CLIENT-CONTEXT-PLAN` 依藍圖改：頂部挑選列→側欄客戶欄；產品子網域上員工可換客戶；要改的節與卡列在藍圖（搜尋「CLIENT-CONTEXT-PLAN」）。
2. ADR 021 加缺口 G13（「進入」清單來自訂單而非權益，`aware-wave-store-plugin/includes/MyAccountDoors.php:109-121`）。
3. 藍圖 §17 的卡與 K 卡、G 缺口排成一份開工順序。
4. 線框圖未在瀏覽器逐頁看過（手機寬是否橫向捲動未驗）。
5. 藍圖標為假設的判斷（§20）未驗證；未能查證項見藍圖末。

## 5. 預設採用（操作者沒說要改就照做）

| 題 | 採用 |
|---|---|
| 客戶欄「分類別」畫法 | 線框圖第 15 頁 A：上方一排類別按鈕篩選（另一種 B：依類別分段） |
| 被授權的人看不看得到點數 | 看得到餘額與到期日；儲值與合約只有單位管理者 |
| 內容入口第一階段 | 只把頁籤升為左欄頁面、改名、主要動作移到第一屏；概覽頁第二階段 |
| 員工打開功能頁、網址沒有客戶 | 不預選，側欄挑；「AwareWave 自己」是清單一列 |
