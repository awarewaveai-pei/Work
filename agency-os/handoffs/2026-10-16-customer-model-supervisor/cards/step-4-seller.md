# 第 4 項附卡：賣家 — 收銀台可以裝在任何網站

**風險** High（金流、身分）　**模型** Fable 5.1 設計（本卡）→ Opus 5.5 實作　**前置** 4b 全部（0124、0128 已套 prod；aware-wave-store 1.0.0 已上線）　**正本** ADR 017 §0、§3、§6、順序 7；ADR 018 §3；TASKS.md 收件匣「續做 ADR 017「賣家」一軸」

> 這張卡只給操作者看、只做決定。**不寫 migration、不改程式**；操作者勾完 §6 的選項後才開 4c 執行卡。

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

## 6. 要操作者決定的取捨（勾一個；★＝建議）

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

## 7. 4c 執行卡會長什麼樣（給便宜模型；本卡不做）

- **4c-1 migration**（High；套 prod 前給操作者看）：§5 四步＋`.down.sql`；down 條件：`seller_sites` 只剩 aware-wave.com 一列、`sold_by`／`owner` 全 null 或 internal。
- **4c-2 next-admin**：`lib/payments/sites.ts`（查鑰匙→網站→賣家，service role only，`import-boundary` 加路徑）；`hmac.ts`＋`woo-billing.ts` verify 改查表；`wp-customers.ts` 加 `siteId`、slug 改 `wp-member-<key_id>-<wp user id>`（aware-wave.com 舊列不動）、`metadata.site_id`；`identities.ts` 鍵加 `siteId`；`awarewave-wp.ts` handoff 查站鑰匙；`contracts.ts` 傳 `p_site_id`；`/ops/sellers` 頁（登記網站、顯示 key_id、停用）；0130 總帳加賣家欄與篩選。
- **4c-3 外掛**：`aware-wave-store` 改名或加「本站是代理商收銀台」模式：產鑰匙、顯示公鑰、設定頁多 `key_id`；README 刪「只裝 aware-wave.com」。版號升、`release-wp-bridge.sh --plugin store`。
- **測試名**（4c-2）：`a payment signed by site B for a buyer sold by site A is refused`、`the body may not name a seller or a site`、`a plan owned by another seller is refused on this site`、`two sites with the same wp user id make two accounts`、`the legacy aware-wave.com site still verifies with the env secret`、`a disabled site is refused before the body is read`。
- **突變**（一個守衛一次）：拔掉「鑰匙→網站」查表、改讀 body 的 `site_id` → `the body may not name…` 紅，還原綠。
- **Rollback**：4c-2 `git revert`（舊程式只認 env 鑰匙，aware-wave.com 列仍是 `hmac-env`，照常）；4c-1 down；外掛關「代理商模式」開關。

## 8. 風險清單

- **鑰匙形式一旦選定就長期背著**（外掛裝在別人主機，換演算法要每站升級）：所以 D1 要一次選對；`verify_alg` 欄留擴充。
- **身分唯一鍵改動**：0124 已套 prod，有無資料要先 `select count(*) from customer_identities`（4c-1 開工第一句）；有資料就回填，不刪。
- **代理商的買家資料在我們手上**：隱私責任與代操客戶相同（三軸 C 軸 `on_behalf_of`），合約要寫；不是程式問題，但 4c-1 前要有一句書面。
- **不做**：賣家分潤自動結算、賣家自己的錢包、賣家後台的完整 UI（先只在 `/ops` 給員工用）。
