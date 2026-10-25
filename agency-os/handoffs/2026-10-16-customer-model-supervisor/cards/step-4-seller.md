# 第 4 項附卡：賣家 — 收銀台可以裝在任何網站

**風險** High（金流、身分）　**模型** Fable 5.1 設計（本卡）→ Opus 5.5 實作　**前置** 4b 全部（0124、0128 已套 prod；aware-wave-store 1.0.0 已上線）　**正本** ADR 017 §0、§3、§6、順序 7；ADR 018 §3；TASKS.md 收件匣「續做 ADR 017「賣家」一軸」

> §1–§6 是設計（操作者 2026-10-25 已決）；§7 是 4c 執行卡，便宜模型照做，每張獨立 commit。**4c-1 套 prod 前先給操作者看（High）。**

## 1. 一句話

今天「誰賣的」寫死＝AwareWave：aware-wave.com 是唯一收銀台，付款事件只認一把密鑰，付錢的會員一律開成 AwareWave 的客戶。改成：**每個收銀台網站登記一列、各自一把鑰匙；控制面用鑰匙查出賣家，買家帳戶記「由誰賣出」；方案有擁有者**。五種方式、三條軸、`can()` 都不動。

## 2. 現況（讀過的檔，`file:line`）

| 寫死在哪 | 證據 | 後果 |
|---|---|---|
| 一把密鑰 | `lib/payments/woo-billing.ts:44` `verifyPayment(..., env.PAYMENTS_WOO_SECRET)`；`lib/payments/hmac.ts:13-17` | 第二個網站無鑰匙可用；同一把給兩站＝任一站外洩兩站都假得了 |
| 會員＝AwareWave 客戶 | `lib/entitlements/wp-customers.ts:21` slug `wp-member-<WP user id>`；`:42` `metadata.wp_user_id` | 兩個網站的 user id 都從 1 起算，第二站的會員 7 會撞第一站的會員 7 |
| 身分只認一個 provider | `0124_customer_identities.sql` `provider in ('awarewave-wp')`、`unique (provider, external_id)`；`lib/entitlements/identities.ts:3-6` | 同上：external_id 沒有「哪個網站」這一維 |
| 方案沒有主人 | `0110_plans_entitlements.sql:7-16` 無擁有者欄 | 任何網站都能賣任何方案 |
| 付款只認帳戶 | `0120_payment_events.sql` `billing_apply_payment_event` 檢查 `parent_organization_id is null and kind='customer'`；事件不記來源網站 | 總帳（0130 `billing_ledger`）分不出誰賣的 |
| 進門密鑰也是一把 | `lib/auth/sources/awarewave-wp.ts:45` `AUTH_WP_HANDOFF_SECRET`；外掛 `Settings.php:16-17` 兩個 option | 第二站的「進入」按鈕沒鑰匙 |
| 外掛只裝一站 | `packages/aware-wave-store-plugin/README.md:3`「Install only on aware-wave.com」 | 名字與定位要改 |

已定不動：0120 收件表、0124 身分表的「一會員一帳戶」、0128 點數包無期末列、4b-5 `pay: credits`。

## 3. 「賣家」是什麼（與三軸、組織樹、順序 7 的關係）

- **不是第四條軸。** 三軸是「每次請求／每個帳戶×功能」的值（ADR 017 §0）；賣家是 B 軸合約的**另一方**（counterparty），屬於計費帳戶的屬性，跟 `organizations.kind`（0110）同一層。存一欄，不改 `can()`、不改許可格式。
- **賣家本身就是一個 `organizations` 列。** AwareWave＝`kind='internal'` 那列（0110:38；`39ad4149-…`）；代理商＝它自己原本的 `customer` 帳戶。不另建 `sellers` 表（§0 第 4 條「不自建帳本」）。
- **買家「在賣家底下」不能用 `parent_organization_id`。** 三個硬理由：0077:63 父節點必須 `org_level='group'`；計費主體＝`coalesce(parent, id)`（ADR 017 §3）→ 會變成賣家替買家付錢；0120 付款只收 `parent_organization_id is null` 的帳戶。所以「底下」＝買家列上一欄 `sold_by_organization_id`，買家仍是自己的根帳戶、自己的錢包、自己的權利列（不變量 ②）。
- **與順序 7（轉售）的差別**：順序 7 是 `self_hosted`——代理商買斷整套裝在自己主機，買家住在那台機器裡，我們看不到，授權檔 `max_tenants` 數根組織。本卡是 `hosted`——買家住在我們的控制面，代理商的網站只是收銀台。兩者商業上都叫「代理」，程式是兩條路，各走各的；一家代理商可以同時兩種。
- **自用／代操／訂閱／點數／買斷五種方式不變**：賣家欄對每一種都成立（自用＝AwareWave 賣給 internal；代操客戶由員工邀請＝AwareWave 直賣，欄位 null）。

## 4. 不變量（寫進測試名）

1. **鑰匙→網站→賣家**：控制面由請求的鑰匙查出網站列，再由網站列得到賣家；請求 body 出現 `seller_organization_id`／`site_id`／`organization_id` 一律拒（現 `woo-billing.ts:66` 已拒 `organization_id`，照擴）。
2. **買家帳戶歸賣家**：由某網站首付建立的帳戶 `sold_by_organization_id`＝該站賣家；同一帳戶之後只收同一賣家網站的付款，別家網站送來的事件拒 `buyer_belongs_to_another_seller`。
3. **方案歸擁有者**：方案 `owner_organization_id` null＝AwareWave 目錄（所有網站可賣）；非 null 只能在該擁有者的網站賣，否則拒 `plan_not_sellable_here`。
4. **錢只走 `can()`＋三軸**：買家的合約、權利、錢包照 0120 寫在買家帳戶；賣家欠 AwareWave 的批發款**不進控制面帳本**（§6 D4）。

## 5. Schema 草案（只是草案，4c 才寫 migration；下一個空號 `ls lobster-factory/packages/db/migrations | sort | tail` 現為 0131）

```
seller_sites                      -- 收銀台登記；一列＝一個網站
  id uuid pk
  seller_organization_id uuid not null → organizations (restrict)   -- 賣家
  host text not null unique                                         -- 'aware-wave.com'
  platform text not null check (platform in ('woo'))                -- 日後 'shopify' 等加值不改 schema
  key_id text not null unique                                       -- 請求 header 帶，查表用；不是秘密
  verify_alg text not null check (verify_alg in ('ed25519','hmac-env'))
  public_key text                                                   -- ed25519：只存公鑰，DB 裡沒有秘密
  env_var text                                                      -- hmac-env：只給 aware-wave.com 過渡列，指 PAYMENTS_WOO_SECRET
  handoff_public_key text                                           -- 進門按鈕另一把（同 4b-4 的分鑰原則）
  status text check (status in ('pending','active','disabled'))
  created_at, activated_at, disabled_at
  check ((verify_alg='ed25519' and public_key is not null) or (verify_alg='hmac-env' and env_var is not null))

customer_identities               -- 0124 改
  + site_id uuid not null → seller_sites (restrict)
  unique (provider, external_id)   → unique (site_id, external_id)   -- WP user id 只在站內唯一
  unique (provider, user_id)       → unique (site_id, user_id)
  provider check 加 'customer-wp'（ADR 018 §3 的第三種登入來源）

organizations
  + sold_by_organization_id uuid null → organizations (restrict)   -- null＝AwareWave 直賣（員工邀請、轉帳登記）
  check (sold_by_organization_id <> id)

plans
  + owner_organization_id uuid null → organizations (restrict)     -- null＝AwareWave 目錄

payment_events
  + site_id uuid null → seller_sites                                -- 稽核：誰送的；local 事件 null

billing_apply_payment_event(p_provider, p_event_id, p_event, + p_site_id)
  新增三個拒絕：plan_not_sellable_here／buyer_belongs_to_another_seller／site_disabled
```

遷移順序（每步可回頭）：①建 `seller_sites`，插 aware-wave.com 一列（賣家＝internal 帳戶，`hmac-env`，`env_var='PAYMENTS_WOO_SECRET'`）→ ②`customer_identities` 加 `site_id`、回填成那一列、換唯一索引 → ③`organizations.sold_by_organization_id`：既有 `metadata.source='awarewave-wp'` 的帳戶回填 internal，其餘 null → ④`plans.owner_organization_id` 全 null。**第一天行為零改變**：唯一網站仍用環境變數裡那把鑰匙。

**為什麼不是「每站密鑰雜湊」**（TASKS 條目原寫法）：HMAC 是對稱金鑰，驗章要原文，雜湊後驗不了；雜湊只適用 bearer token。要做到「DB 被倒出來也拿不到鑰匙」只有兩條路：對稱鑰匙加密存（再多一把主鑰在 env）或**非對稱**（網站持私鑰簽、我們只存公鑰）。見 §6 D1。

## 6. 取捨（**操作者 2026-10-25 定：D1–D5 全部照★**；寫入 ADR 017 產品決定 #12。表留作為什麼不選別的）

### D1　每站鑰匙怎麼做

| 選項 | 做法 | 代價 | 程式影響 |
|---|---|---|---|
| **A ★** Ed25519 公鑰 | 外掛安裝時在站內產一對鑰匙（PHP 內建 sodium，7.2 起），私鑰不出站；設定頁顯示公鑰；控制面 `/ops/sellers` 新增網站時貼公鑰或用一次性登記碼讓外掛自己 POST 公鑰。簽章＝`Ed25519(raw body)`，header 帶 `key_id`＋簽章 | 外掛 `Signature.php` 多一種演算法；Node 用 `crypto.verify(null, …)`。ADR 017 §3 許可本來就用 Ed25519，不是新東西 | `hmac.ts` 改成 `verifyFor(site)`；`PaymentProvider.verify` 要能查表（現為同步 `provider.ts:25`，改成可非同步，同 4b-3 改 `parse` 的做法） |
| B 每站 HMAC，加密存 DB | 鑰匙隨機產生，用 env 主鑰 AES-GCM 加密存 `secret_ciphertext` | 多一把主鑰要備份；主鑰外洩＝全部鑰匙外洩；輪替要重加密 | 同上，少改外掛 |
| C 每站 HMAC，鑰匙全放 env | `PAYMENTS_WOO_SECRET_<KEY_ID>` | 每加一個網站就要 `safe-infra-patch.sh compose` 一次（High）；不可能給代理商自助 | 最少，但長不大 |

### D2　誰能定義方案（功能組合）

| 選項 | 規則 | 代價 |
|---|---|---|
| **A ★** AwareWave 目錄＋賣家自有方案 | `owner null`＝目錄，所有站可賣；賣家可在 `/ops`（日後賣家後台）建自己的方案，只能在自己站賣 | 方案表多一欄；寫入時檢查擁有者 |
| B 只有 AwareWave 目錄 | 賣家只能賣我們定義的組合，價格自己在 Woo 訂 | 最單純；代理商想包「社群＋設計」特價組合就要我們代建 |

價格一律在賣家自己的 Woo（ADR 017 §2 不變）；方案只定功能與上限。

### D3　賣家能賣哪些產品

| 選項 | 規則 | 代價 |
|---|---|---|
| **A ★** 賣家持有 `<product>.resell` 權利列 | 登記表每個產品加一個 feature `resell`（`billing: contract`）；賣家帳戶有 comp／contract 列才收該產品的付款事件；收回代理權＝把列結束。走現成 `can()`／`holdsProduct` | `products.ts` 每產品多一個 feature；0120 多一個檢查 |
| B `seller_sites.products text[]` | 網站列直接列產品 | 另一套「能不能」判斷，違反 §0 第 4 條 |

### D4　賣家欠我們的批發款怎麼結

| 選項 | 規則 | 代價 |
|---|---|---|
| **A ★** 月結報表＋人工發票 | `/ops/billing`（0130）加「賣家」篩選與每月合計（訂閱數、點數賣出數）；AwareWave 對賣家開發票，款不進控制面 | 一個 SQL 視圖欄位；會計流程在控制面外 |
| B 賣家錢包預付池，買家扣賣家點數 | 買家用量扣賣家錢包 | **違反不變量 ②**（帳算買家）；一個買家刷爆全池；不建議 |

### D5　同一個人向兩個賣家買

| 選項 | 規則 | 代價 |
|---|---|---|
| **A ★** 一站一帳戶 | 身分唯一鍵是 `(site_id, external_id)`；同一 email 在 A 站、B 站是兩個計費帳戶（兩個 WordPress 會員本來就是兩個人） | `emailOwner` 檢查（`wp-customers.ts:53`）要改成「同站同 email 才算半成品帳戶」，不同站同 email 要拒還是允許並存＝本題 |
| B 一人一帳戶跨站 | 以 email 合併 | email 會改（ADR 015 §2 已排除）；一個帳戶兩個賣家，不變量 ② 破 |

### D6　買家從哪扇門進

不是取捨，先知道：買家在賣家網站按「進入」→ 門仍是 `<產品>.aware-wave.com`（ADR 018 §1），登入來源 `customer-wp`（ADR 018 §3）、進門鑰匙＝該站 `handoff_public_key`。賣家想用自己的網址做門＝順序 9 白牌，另一張卡。

## 7. 4c 執行卡（便宜模型照做；順序 4c-4 → 4c-1 → 4c-2 → 4c-3；每張各自 Acceptance、各自 commit；`.ts/.tsx` 改動收尾前 `npx tsc --noEmit` 綠）

通則：next-admin 路徑皆相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；外掛路徑相對 `lobster-factory/packages/aware-wave-store-plugin/`。每張卡的 WORKLOG 證據行照 AGENTS.md §1 四動作。**不做無效益測試**：只寫下列點名的測試；突變只做在點名的守衛，一個守衛一次。

### 4c-4　登記表：每產品一個 `resell` 功能（無依賴；先做，4c-2 要用）
- Files：`lib/portal/products.ts`（`ProductFeature` 型別 `products.ts:12-18` 不動；每個 `door.app === "next-admin"` 產品的 `features` 加 `{ feature_key: "<key>.resell", name: "代理銷售", limitKind: "QUOTA", buyout: false, billing: "contract" }`，用一個 helper `resell(key)` 產生，放 `quota` helper（`:37`）旁）；`lib/entitlements/features.ts` 加常數 `RESELL_FEATURES`（每產品**字面**字串：`registry-code.test.ts:75` 的 asker 掃描只認字面，4c-2 的 `sites.ts` 用它 `grantFor`）；`lib/entitlements/__tests__/features.test.ts` 證明常數＝登記表。
- 閘注意：`registry-code.test.ts:75`「every feature … is asked by a call site」在 4c-2 之前會紅 → 本卡與 4c-2 **同一天連做**，或先把 `resell` 列加進 `BACK_OFFICE_FEATURES` 豁免、4c-2 再移出（二擇一，WORKLOG 寫明）。`billing: "contract"` 所以 `:87` 計量閘不適用。
- Acceptance：`npx vitest run lib/portal/__tests__ lib/entitlements/__tests__/features.test.ts` 綠；測試名 `every next-admin product declares exactly one resell feature`。
- Rollback：`git revert`。
- **實作（2026-10-25）與上列不同處**：代理權**不進** `products.ts` 的 `features[]`：門選單列出每個 feature（`app/ProductDoorShell.tsx:41`），全功能補列照每個 feature 發列（`lib/entitlements/tables.ts:9` `registeredFeatures`，0118）→ Soulful、edd-research 會變成每個產品的代理商。改照 `BACK_OFFICE_FEATURES` 做法：`lib/entitlements/can.ts` `sellerLicenceKey(productKey)`＝`<key>.resell`、`SELLER_LICENCES`（每個登記產品一把，含 external 門的 cognitive、hci）；判斷由 `sellerMaySell(store, seller, productKey)` 做：internal 直接放行、customer 要有一張活的 comp／contract 列（與 `issuePermit` 共用 `liveRow`）。**不經 `can()`**（Codex 第三輪 `partialreview-3da704b3`：經 `can()` 時影子模式會放行、且沒有許可簽章金鑰就答不出來）；`can()` 收到代理權鍵在任何模式都拒 `seller_licence_not_a_feature`。上面「暫列 `BACK_OFFICE_FEATURES`」也不可行（`registry-code.test.ts:79` 同樣要求有人問）。測試 `lib/entitlements/__tests__/can.test.ts` describe `seller licences`：`every product has one seller licence and none is a product feature`、`a customer without the seller licence row cannot sell`、`a customer with a live seller licence row can sell; an ended one cannot`、`the internal account sells every product without a row`、`can() never answers a seller licence, in shadow or enforce`。**4c-2 用 `sellerMaySell(createEntitlementStore(), …)`**，不用 `can`／`grantFor`／`verdictOf`。

### 4c-1　migration（High：套 prod 前給操作者看；下一個空號 `ls lobster-factory/packages/db/migrations | sort | tail`）
- 開工第一句：`select count(*) from customer_identities; select count(*) from organizations where metadata->>'source'='awarewave-wp'; select count(*) from plans;` 記進 WORKLOG（回填筆數）。
- Files：`lobster-factory/packages/db/migrations/<NNNN>_seller_sites.sql`＋`.down.sql`，照 0120／0124 樣式（`begin; set local lock_timeout='5s'; … notify pgrst,'reload schema'; commit;`；RLS 段照 0124 `do $$ … service_role` 迴圈）。
- 內容（§5 四步，同一檔同一交易）：
  1. `create table seller_sites(...)` 照 §5，另加 `handoff_env_var text`（aware-wave.com 過渡列用）；插 aware-wave.com 一列：`seller_organization_id = (select id from organizations where kind='internal' and parent_organization_id is null)`（0117:24 同法）、`host='aware-wave.com'`、`platform='woo'`、`key_id='aware-wave-com'`、`verify_alg='hmac-env'`、`env_var='PAYMENTS_WOO_SECRET'`、`handoff_env_var='AUTH_WP_HANDOFF_SECRET'`、`status='active'`。
  2. `alter table customer_identities add column site_id uuid references seller_sites(id) on delete restrict; update … set site_id=(那一列); alter … alter column site_id set not null;` 刪 `(provider, external_id)`、`(provider, user_id)` 兩個 unique（實際 constraint 名以 `\d customer_identities` 為準），加 `unique (site_id, external_id)`、`unique (site_id, user_id)`；`provider` check 改 `in ('awarewave-wp','customer-wp')`。
  3. `alter table organizations add column sold_by_organization_id uuid references organizations(id) on delete restrict, add constraint organizations_sold_by_not_self check (sold_by_organization_id is null or sold_by_organization_id <> id); update organizations set sold_by_organization_id=(internal id) where metadata->>'source'='awarewave-wp';`
  4. `alter table plans add column owner_organization_id uuid references organizations(id) on delete restrict;`（全 null）
  5. `alter table payment_events add column site_id uuid references seller_sites(id) on delete restrict;`（0120:99-102 的 immutable trigger 只擋 update/delete，加欄不衝突）
  6. `create or replace function billing_apply_payment_event(p_provider text, p_event_id text, p_event jsonb, p_site_id uuid default null)`：整段複製最新定義（`grep -l billing_apply_payment_event lobster-factory/packages/db/migrations/*.sql | sort | tail -1`），只加三處：(a) `p_site_id` 非 null 時 `select * into v_site from seller_sites where id=p_site_id and status='active'`，無列 `raise 'payment_rejected:site_disabled'`；(b) 查到 `v_org` 後：`if p_site_id is not null and coalesce(o.sold_by_organization_id, <internal id>) <> v_site.seller_organization_id then raise 'payment_rejected:buyer_belongs_to_another_seller'`（首付新帳戶由 4c-2 在建 org 時寫 `sold_by`，函式只驗不寫）；(c) 查到 `v_plan` 後：`if v_plan.owner_organization_id is not null and (p_site_id is null or v_plan.owner_organization_id <> v_site.seller_organization_id) then raise 'payment_rejected:plan_not_sellable_here'`；insert `payment_events` 多寫 `site_id`。`p_site_id is null`＝`local`（轉帳登記）照舊。**`resell` 檢查不在 SQL**：由 4c-2 `sites.ts` 以 `can()` 問（§0 第 4 條），函式不重複判。
  - down：`seller_sites` 只剩 aware-wave.com 一列、`sold_by` 只有 null／internal、`owner` 全 null、`payment_events.site_id` 全 null 或 aware-wave.com 才能 down，否則 `raise`；函式還原成前一版（複製前一個 migration 的定義）。
- Acceptance：本機 Postgres（`lib/entitlements/__tests__/` 既有真 DB e2e 套法，見 commit `4386b1580`）：up → `\d seller_sites`、`\d customer_identities` 顯示新鍵 → down → up 再一次（冪等）。SQL 層測試（`lib/entitlements/__tests__/contracts-seller.test.ts`，e2e 套法）名：`a plan owned by another seller is refused on this site`、`a payment from site B for a buyer sold by site A is refused`、`a local payment with no site still applies`、`a disabled site is refused`。
- 套 prod：照 0120 套法（WORKLOG 2026-10-23 續51）；之後 `psql -c '\d seller_sites'`＋`select host, verify_alg, status from seller_sites;`＝一列 aware-wave.com／hmac-env／active。
- Rollback：`.down.sql`。
- **實作（2026-10-25，`0133_seller_sites.sql`，未套 prod）與上列不同處**：
  - 函式由腳本從 0128 原文產生，四處插入標 `0133`；參數變了＝新函式，所以先 `drop function …(text, text, jsonb)` 再建（`create or replace` 會留下兩個 overload）。
  - `woo` 沒帶 site＝aware-wave.com 那列（今天的外掛不帶 site，4c-2 前照常收錢）；`local` 帶 site 拒 `local_has_no_site`。buyer／seller 檢查對每種事件都做（不只首付）；`local` 不檢查（操作者登記轉帳）。
  - **網站送來的每個外部編號只在該站內唯一**（Codex 2026-10-25 `partialreview-20ba3e0c` 兩項：兩站各有訂單 7 時，外掛產生同一個 `wc:payment_complete:7:credit_pack`，帳本鍵也同為 `pack:woo:7`）：收件箱唯一鍵改 `(provider, site_id, event_id)`（`nulls not distinct`，local 為 null）＋check「local ⇔ 無 site」；0133 前的 woo 列補上 aware-wave.com（暫停 0120 只寫一次觸發器，只補這一欄）；帳本鍵、合約 `source_ref` 改用命名空間 `v_ns`＝aware-wave.com 用原本的 `woo`、其他站 `woo@<key_id>`（第一天鍵不變）；`key_id` 上限 24 字，組出的帳本鍵超過 128 字拒 `invalid_order_ref`。**4c-2 起任何由網站編號組成的新鍵都要帶 `v_ns`**。
  - critic（Codex 額度用完後的獨立審查）1H4M 全修：`sold_by` 只准控制面寫（`organizations_update` 政策 `0010:526-530` 讓會員能改自己組織列）；internal 根帳戶唯一索引，函式改由 aware-wave.com 列取得 AwareWave；`awarewave-wp` ⇔ aware-wave.com check；代理權也在 SQL 函式檢查（只對其他賣家網站的收錢事件：`seller_not_licensed`，無方案點數包 `seller_pack_needs_plan`）；方案不得含 `*.resell`。
  - **0133 推 main 前必須同日套 prod**：部署閘 `check-migrations-applied.sh` 會擋下 03:00 自動部署。
  - Codex 第三輪 `partialreview-3da704b3` 第 3 項：aware-wave.com 那列不是 active（例如鑰匙外洩後停用）時 down 拒絕，rollback 不得重開已關的收銀台。
  - Codex 第二輪 `partialreview-05afd543` 三項（皆屬實）：①`customer_identities.site_id` 暫設預設＝aware-wave.com 那列（今天的 `identities.ts:64-71` 不帶 site，沒預設新會員首付會失敗）→ **4c-2 帶 site 並在其 migration `drop default`**；②擁有者檢查只對網站來的事件做，操作者 `local` 可取消／退款賣家方案；③`seller_sites.key_id`、`seller_organization_id` 由觸發器鎖定不可改（換鑰匙＝同列換公鑰；換賣家＝新列）。
  - 賣家、買家的賣家、方案擁有者都必須是根計費帳戶：觸發器 `seller_root_account_check`（三張表共用）。
  - `seller_sites` 不設 `activated_at`／`disabled_at`（`status` 已足）；鑰匙欄互斥 check：ed25519 只能有公鑰、hmac-env 只能有環境變數名。
  - 測試放進既有 `payments.e2e.test.ts`（describe `sellers (0133)`，直接呼叫 SQL 函式），套件 `entitlements-real-db.py --suite payments` 加 0124、0133；「local 照舊」由同檔既有 11 個 local 測試涵蓋，不另寫。另加 `a woo event with no site is the aware-wave.com site`。
  - up → down → up 與「有第二個網站時 down 拒絕」「子組織不能當賣家」：拋棄式 Postgres 跑過（WORKLOG 2026-10-25 續68）。

### 4c-2　next-admin：鑰匙→網站→賣家；首付帳戶記賣家（依賴 4c-1、4c-4）
- Files：
  - 新 `lib/payments/sites.ts`：`findSiteByKeyId(db, keyId)`；`verifySiteSignature(site, rawBody, signature, env)`：`ed25519` → `crypto.verify(null, Buffer.from(rawBody,'utf8'), {key: publicKey, format:'pem', type:'spki'}, Buffer.from(sig,'base64'))`；`hmac-env` → 現成 `verifyPayment(rawBody, sig, env[site.envVar])`（`hmac.ts:13`）；`sellerMaySell(db, site, productKey)` → `grantFor({orgId: site.sellerOrganizationId, kind}, RESELL_FEATURES[productKey], 'site:<key_id>')`，internal 賣家直接放行（`can.ts:164` 同理）。只讀 `seller_sites`，表只准 `lib/entitlements/**`／`lib/payments/sites.ts`：`import-boundary.test.ts:11` `tableAllowed` 加此檔。
  - `lib/payments/provider.ts:25`：`verify(headers, rawBody): boolean | Promise<boolean>`；route（`app/api/webhooks/payments/[provider]/route.ts:19`）`await`；`local.ts:14` 不改。
  - `lib/payments/woo-billing.ts`：新 header `X-AwareWave-Site: <key_id>`（常數放 `hmac.ts` 旁）；`verify` → 無 header 時**只**接受 aware-wave.com 那列（`key_id='aware-wave-com'`，向後相容今天的外掛）；有 header → `findSiteByKeyId` → `verifySiteSignature`；`parse` 把 `site` 傳進 `ensureWpCustomer`，`rest` 出現 `site_id`／`seller_organization_id` 時拒 `seller_not_allowed`（`:66` 同法）；`parse` 末對該事件的方案呼叫 `sellerMaySell(site, plan.product_key)`，拒 `seller_not_licensed`；`ReceivedPayment` 加 `siteId`。
  - `lib/entitlements/contracts.ts:20` rpc 加 `p_site_id: received.siteId ?? null`。
  - `lib/entitlements/wp-customers.ts`：`WpMember` 加 `site: {id, keyId, sellerOrganizationId}`；`wpOrgSlug(site, wpUserId)`＝aware-wave.com 列維持 `wp-member-<id>`（舊帳戶不換名），其他站 `wp-member-<key_id>-<id>`；`findWpOrganization`（`:32`）多比 `metadata.site_id`；`ensureWpOrganization`（`:42`）insert 加 `sold_by_organization_id: site.sellerOrganizationId`、`metadata.site_id`；`emailOwner` 判斷（`:111`）改成「同站、同 email、同半成品帳戶才放行；不同站同 email → `email_taken_elsewhere`」（D5：一站一帳戶，拒而不合併）。
  - `lib/entitlements/identities.ts`：`Identity` 加 `siteId`；查詢與 insert 帶 `site_id`；`provider` 由站決定（aware-wave.com＝`awarewave-wp`，其他＝`customer-wp`）。
  - `lib/auth/sources/awarewave-wp.ts:45-63`：body 加 `key_id`（舊外掛沒帶＝aware-wave.com 列）；驗章改 `verifySiteSignature(site, …)` 用 `seller_sites.handoff_public_key`，aware-wave.com 列用 `handoff_env_var`；`find` 帶 `siteId`。
  - `/ops/sellers`：`app/(shell)/ops/sellers/page.tsx`（唯讀表＋表單：新增網站（host、賣家帳戶、貼公鑰、貼進門公鑰）、停用／啟用；資料只經 `lib/payments/sites.ts`）；側欄登記照 `ops/billing` 的位置（grep `"/ops/billing"`）；`BACK_OFFICE` 清單加 `ops/sellers`（ADR 017 順序 1 反向登記閘）。
  - 0130 總帳：新 migration `<NNNN+1>_billing_ledger_seller.sql`：`billing_ledger` 回傳加 `sold_by`（賣家名）；`p_filter`（`0130:21`）加 `'seller:<uuid>'`；`app/(shell)/ops/billing/page.tsx` 多一欄＋篩選＋每賣家本月合計（訂閱付款筆數、`credit_pack` 點數合計；D4 月結用）。
- Acceptance：`npx vitest run lib/payments lib/entitlements app/api/webhooks/payments app/api/auth lib/portal/__tests__` 綠；測試名：`a request without a site header verifies against the aware-wave.com env key`、`a request naming a site verifies with that site's ed25519 public key`、`the body may not name a seller or a site`、`two sites with the same wp user id make two accounts`、`a seller without the resell row for the product is refused`、`a legacy wp-handoff without key_id still signs in`。本機 `curl -X POST localhost:3000/api/webhooks/payments/woo -H "X-AwareWave-Site: test-site" -H "X-AwareWave-Payment-Signature: <ed25519 sig>" -d @fixture` → `{"ok":true,…}`；同 body 換 header 指另一站 → 401。
- 突變（一個守衛）：`sites.ts` 改成讀 body 的 `site_id` 決定網站 → `the body may not name a seller or a site` 紅；還原綠。
- Rollback：`git revert`；舊程式只認 env 鑰匙，aware-wave.com 列是 `hmac-env`，照常。

### 4c-3　外掛 `aware-wave-store`：代理商收銀台模式（依賴 4c-2 上線）
- Files：`includes/Signature.php`（加 `signEd25519(rawBody, secretKey)`＝`base64_encode(sodium_crypto_sign_detached($rawBody, $sk))`；HMAC 保留給 aware-wave.com）；`includes/Settings.php`（新 option `aware_wave_site_key_id`、`aware_wave_site_keypair`（只存站內，`sodium_crypto_sign_keypair()` 首次啟用產生，不可匯出）、`aware_wave_handoff_keypair`；`OPT_PAYMENTS_SECRET`／`OPT_HANDOFF_SECRET` 保留：有 key_id 用 Ed25519，否則 HMAC）；`includes/Admin/SettingsPage.php:45` 旁加「代理商模式」區：顯示 key_id、兩把公鑰（PEM，貼到 `/ops/sellers`）、「重新產鑰」（舊鑰立刻失效，提示先到 `/ops/sellers` 換）；`includes/PaymentSender.php:59` 與 `includes/MyAccountDoors.php:18-23` 送出時加 header／欄位 `key_id`；`README.md:3` 改「aware-wave.com 或代理商收銀台」；`aware-wave-store.php` 版號升 1.1.0；`tests/`：`SignatureTest`（Ed25519 向量：固定 seed 的公鑰＋body＋期望簽章，同一組向量放 next-admin `lib/payments/__tests__/fixtures/ed25519-v1.json` 兩邊跑，照 ADR 017 §3 permit-v1 的做法）。
- `scripts/rollout-wp-bridge.ps1 -Plugin store` 的「只有開過收費的網站才能裝」閘：改成「`seller_sites` 有該 host 的 active 列」（查法：next-admin 新唯讀 route `GET /api/internal/sellers/sites?host=`，Bearer `SCHEDULE_INGEST_TOKEN` 同法）。
- Acceptance：`php -d extension=mbstring phpunit-9.6.phar` 綠；測試名 `an ed25519 signature over the exact bytes verifies against the fixture public key`、`a site with a key id sends it in the header and never sends an hmac`、`regenerating keys invalidates the previous signature`。發版 `bash scripts/release-wp-bridge.sh --plugin store`；aware-wave.com 升級（High）；第一個代理商站：`/ops/sellers` 登記 → 貼公鑰 → 外掛開「送付款事件」→ 0 元試用訂單 → `/ops/billing` 篩該賣家出現合約。
- Rollback：關外掛「代理商模式」（回 HMAC，或關整個送事件開關）；`/ops/sellers` 停用該站列。

## 8. 風險清單

- **鑰匙形式一旦選定就長期背著**（外掛裝在別人主機，換演算法要每站升級）：所以 D1 要一次選對；`verify_alg` 欄留擴充。
- **身分唯一鍵改動**：0124 已套 prod，有無資料要先 `select count(*) from customer_identities`（4c-1 開工第一句）；有資料就回填，不刪。
- **代理商的買家資料在我們手上**：隱私責任與代操客戶相同（三軸 C 軸 `on_behalf_of`），合約要寫；不是程式問題，但 4c-1 前要有一句書面。
- **不做**：賣家分潤自動結算、賣家自己的錢包、賣家後台的完整 UI（先只在 `/ops` 給員工用）。
