# ADR 018: 產品交付有三扇門 — 公開站收錢、產品子網域給客戶用、app 給員工；網址與登入來源由設定決定，買斷裝在客戶網域

- **狀態**：已接受（操作者 2026-10-15：三扇門的表由操作者改寫定案；「所有的系統工具都是這樣」＝適用每個產品；「先寫 ADR 017（三扇門＋買斷）、SOP 清單、products.ts 欄位＋測試，再做 ⑥、⑤」）。017 號已是〈客戶怎麼買〉，本 ADR 用 018。
- **日期**：2026-10-15
- **承接**：[ADR 012](012-shared-platform-layer.md) §5（產品登記表是機械閘）、[ADR 015](015-awarewave-account-and-shared-wallet.md) §2（WordPress 會員一鍵進入）、[ADR 016](016-social-manager-third-product.md) §3（品牌層角色）、[ADR 017](017-entitlements-and-self-hosted-modules.md) §5–6（買斷安裝、客戶既有網站）。
- **來源**：操作者 2026-10-15「我要直接掛入 aware-wave.com (wordpress) 方便一起訂閱和會員管理，但是我的 app.aware-wave.com 他是我設定管理客戶和網站的地方」「那買斷客戶呢? 可能是 wordpress 或其他方式」「所有的系統工具都是這樣，你要寫在哪裡，之後架設系統會成為預設?」。

## 脈絡

- 一個 next-admin 同時服務 app.aware-wave.com 與 portal.aware-wave.com。門的判斷寫死網域：`middleware.ts:217-220`（`isWrongHostForPortal` 比對 `"portal.aware-wave.com"`）、`:197`（客戶被擋時轉到 `https://portal.aware-wave.com`）；產品網址寫死在 `lib/portal/products.ts:36-38` 的 `domain`。
- 客戶身分只能進 `/portal/*`（`middleware.ts:180`）。社群頁在 `app/(shell)/tools/social/`，套員工側欄。
- 登入 cookie 不設 Domain（`lib/supabase/auth-cookie-options.ts:4`），每個網址各自一份登入。
- 品牌成員表已建（`lobster-factory/packages/db/migrations/0096_social_manager.sql:188-194`），但 middleware 不帶使用者 id（`middleware.ts:18`、`:118`），`lib/social/authz.ts` 只看 `ops_role`。

## 決策

### 1. 三扇門

| 門 | 線上預設網址 | 給誰 | 做什麼 | 登入 |
|---|---|---|---|---|
| 公開門 | aware-wave.com（WordPress） | 所有人 | 介紹、訂閱、付款、會員帳號（WooCommerce，ADR 015） | WordPress 會員 |
| 產品門 | `<子網域>.aware-wave.com`（每個產品一個） | 付費客戶；員工也可以用 | 只有這個產品的頁面和 API，只看得到自己是成員的品牌 | 見 §3 |
| 員工門 | app.aware-wave.com | 操作者和團隊 | 管客戶、管網站、管所有品牌，也能用每個產品（`/tools/<產品>`） | 現有後台帳號，不變 |

- portal.aware-wave.com（現有的註冊與啟動頁）照產品門的規則處理，它的「產品」是啟動頁。V2 由公開門的會員取代註冊時再決定去留。
- 不認得的網址一律 404（fail closed）：員工門只回應 `STAFF_HOSTS`（預設 app 的網址，本機開發加 localhost）；現況 `doors.ts:34-39` 把未知 host 當員工門，順序 1 改掉（Codex 2026-10-18 M19）。

### 2. 網址由設定決定：程式裡不寫死網域

- `lib/portal/products.ts` 每個產品宣告 `subdomain`，以及在 next-admin 裡的頁面前綴、API 前綴（產品不在 next-admin 就宣告 external）。
- **每個產品都有子網域，登記那天就保留**：每個產品都適用五種方式（ADR 017 §0），「誰操作」是每次請求的值，不是產品的屬性，所以登記表不分客戶版／員工版。子網域開不開是部署狀態（DNS、nginx、`status`），不是程式差異。沒有子網域的是營運後台頁 `/ops/*`，它們不是產品、不在登記表（操作者 2026-10-16 問「都要做成子網域嗎」；先前擬的 `audience` 欄已撤，理由同上）。
- 網址＝`subdomain`＋基底網域。基底網域讀環境變數 `PUBLIC_BASE_DOMAIN`（預設 aware-wave.com），單一產品可用 `PRODUCT_HOST_<KEY>` 覆寫。**客戶自己的網址指到 hosted 產品門（白牌）**：表 `custom_domains(host unique, organization_id, product_key, verified_at)`，`doorForHost` 在設定網址之後查它，命中＝該產品門＋該計費帳戶；驗證走 DNS TXT 挑戰，憑證走 Cloudflare for SaaS 或 on-demand ACME；每客戶每產品一列（ADR 017 順序 9，等第一個要白牌的客戶；操作者 2026-10-18「有可能掛在客戶自己網域」）。網址對應到哪扇門，只在 `lib/portal/doors.ts` 判斷，middleware 和頁面都問它。
- 產品門上：不在該產品前綴的路徑改寫到頁面前綴（`/` → `/social`）；員工路由和其他產品的 API 回 404。產品的頁面前綴在別的網址也回 404。
- 產品門的頁面用自己的精簡版面，不套員工側欄；畫面元件和員工門的 `/tools/<產品>` 共用同一份。
- middleware 的 matcher 跳過的路徑（`/intake`、`/api/webhooks`、`/api/internal` 等）不經過門的判斷，所以產品門的 nginx 區塊自己擋掉它們，只留 `_next`、favicon、`/login`；也擋編碼過的 `.`／`/`，讓 middleware 和 Next 看到同一條路徑。`middleware-portal-guards.test.ts` 比對 matcher 和 nginx 兩邊，漏擋就紅燈。

### 3. 一種身分，登入來源可以換

- middleware 輸出的身分只有一種：使用者 id、員工或客戶、組織、後台角色。不管從哪裡登入，最後都換成本系統自己的登入狀態（ADR 015 §2 的一次性碼），所以產品程式不知道人是從哪裡登入的。
- 登入來源三種：本機帳號 `local`（現在唯一做好的）、我們的 WordPress 會員 `awarewave-wp`（ADR 015 §2，V2）、客戶自己的 WordPress `customer-wp`（wp-bridge 簽章，買斷用）。每個產品在登記表宣告可用的來源，而且一定要有 `local`：買斷預設用安裝自己的登入（ADR 017 §6）。
- 品牌層的角色看成員表（社群＝`social_brand_members`）。員工的 owner／admin 仍是所有品牌的擁有者；其他員工在某個品牌有成員列時照成員列，沒有就照後台角色對應。客戶只看得到自己有成員列的品牌，以及自己所屬的組織。
- 登入 cookie 不跨子網域，每扇門各自登入；從一扇門到另一扇門用一次性碼交換，不共用 cookie。
- 客戶身分只能用自己所在那扇門的路徑；在員工門一律被送去啟動頁。

### 4. 買斷＝同一份程式，換設定

- 照 ADR 017 §5 裝到客戶主機：基底網域換成客戶的（例：social.客戶.com），登入來源用 `local` 或 `customer-wp`。客戶不登入我們的任何網址。
- 每個產品宣告 `standalone`：能不能單獨安裝。依賴哪些模組寫在 ADR 017 §5 的模組清單。
- 買斷安裝程式（ADR 017 順序第 5 步）要用同一組值做三件事：把 `PUBLIC_BASE_DOMAIN`／`PORTAL_HOST`／`PRODUCT_HOST_<KEY>` 傳進 next-admin 容器；照這些網址產生 nginx 的 `server_name`；DNS 指過去。現在線上只用預設值，compose 和 nginx 都還沒接這些變數（Codex 2026-10-15）。

### 5. 怎麼讓它成為預設

- **測試擋**：`lib/portal/__tests__/products.test.ts` 檢查每個產品都填了 `subdomain`、門（next-admin 前綴或 external）、`loginSources`（不得為空，要有 `local`）、`standalone`。反向：`app/(shell)/tools/<x>` 與 `app/<門前綴>` 每個目錄都要對得到一列（ADR 017 順序 1）。子網域不能重複，也不能用 app、portal、www。前綴不能和員工路由重疊，也不能跟別的產品重疊。漏填就紅燈，提交不了。
- **規劃時想到**：[`GOVERNED_SYSTEM_BUILD_SOP.md`](../../operations/GOVERNED_SYSTEM_BUILD_SOP.md) §18 開新系統的必填清單。
- **每輪都看得到**：`agency-os/AGENTS.md` §0 一行指向本 ADR。

## 順序

1. 本 ADR、SOP 清單、登記表欄位和測試（2026-10-15）。
2. ⑥ middleware 帶出使用者 id；`lib/social/authz.ts` 讀成員表。
3. ⑤ social.aware-wave.com：程式（`doors.ts`、middleware、產品門頁面），再上線（DNS、主機 nginx、lobster-nginx、sg-deploy；High-STOP，要操作者 go）。
4. V2：WordPress 會員一鍵進入（ADR 015 §2）→ WooCommerce 訂閱開通權限（ADR 017 順序第 4 步）。

## 不採用

- **把產品嵌進 WordPress 頁面（iframe）**：第三方 cookie 會被瀏覽器擋、手機難用，也容易被誘導點擊（ADR 015 §2 同理）。
- **登入 cookie 設成整個 .aware-wave.com 共用**：aware-wave.com 底下也有客戶的 staging WordPress（`middleware.ts:225`），共用 cookie 讓那些網站也帶得到登入。
- **每個網址在 nginx 寫路徑改寫（portal 的做法）**：每加一個產品就要改 nginx，買斷安裝又要再改一次。改成 middleware 讀登記表；portal 現有的 nginx 改寫保留，middleware 的改寫遇到已有前綴的路徑不再動它。
- **每個產品一個獨立 app**：多出好幾套登入和主題（ADR 016、017 同理）。

## 後果

- 正面：新產品＝登記表加一列＋一個頁面前綴；買斷只換設定，不改程式；客戶身分走到哪都被門擋住。
- 代價：middleware 多一層網址判斷；每個產品要有產品門的精簡版面。
- 需跟進：~~品牌成員管理畫面~~（2026-10-15 完成，0103）；portal 註冊開放前要先驗證 email（成員用 email 加入，未驗證的註冊會搶走別人的品牌；程式已關門 `SIGNUP_VERIFIES_EMAIL`）；`ADR_INDEX.md`；ADR 016 §3、ADR 015 §2 加一行指向本 ADR。
