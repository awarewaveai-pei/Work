// 客戶怎麼來 監工台 -- 唯一的資料來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：ADR 017（三軸、順序 1–7）、ADR 018（三扇門）。這裡只放「狀態」與「指向」，不重述理由。

export const META = {
  title: '客戶怎麼來 監工台',
  updated: '2026-10-16',
  adr017: 'agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md',
  adr018: 'agency-os/docs/architecture/decisions/018-product-doors-and-buyout-delivery.md',
  tasks: 'agency-os/TASKS.md:133',
  url: 'https://claude.ai/artifact/Htm4xqe362YM987Fo8YLCr',
};

// ADR 018 §1：三扇門
export const DOORS = [
  { key: 'public', name: '公開門', host: 'aware-wave.com（WordPress）', who: '所有人', does: '介紹、訂閱、付款、會員帳號（WooCommerce）', login: 'WordPress 會員' },
  { key: 'product', name: '產品門', host: '<產品>.aware-wave.com，每個產品一個', who: '付費客戶；員工也可用', does: '只有這個產品的頁面和 API，只看自己是成員的品牌', login: 'local／awarewave-wp／customer-wp' },
  { key: 'staff', name: '員工門', host: 'app.aware-wave.com', who: '操作者和團隊', does: '管客戶、管網站、管所有品牌，也能用每個產品', login: '現有後台帳號' },
];

// ADR 017 §0：三條軸。值存 text，不存 boolean；加值不改 schema。
export const AXES = [
  { key: 'deployment', name: 'A 部署', where: '每個安裝', values: [
    { v: 'hosted', zh: '我們主機，控制面簽許可' },
    { v: 'self_hosted', zh: '客戶主機，離線授權檔' },
  ] },
  { key: 'money', name: 'B 錢從哪來', where: '計費帳戶 × 產品 × 功能', values: [
    { v: 'contract', zh: '0062 合約：trial → active 訂閱' },
    { v: 'comp', zh: '贈送、自用' },
    { v: 'credits', zh: '錢包按次扣，不是權利列' },
    { v: 'perpetual', zh: '買斷授權檔' },
  ] },
  { key: 'actor', name: 'C 誰在按', where: '每次請求', values: [
    { v: 'staff', zh: '員工，帶 on_behalf_of = 替哪個計費帳戶' },
    { v: 'customer', zh: '客戶自己' },
    { v: 'api_key', zh: '機器；等第一個只串 API 的客戶（順序 6）' },
  ] },
];

// ADR 017 §0：對外五種方式 = 三軸的組合
export const WAYS = [
  { name: '自用', zh: '我們自己用', deployment: 'hosted', money: 'comp', actor: 'staff', note: '計費帳戶 organizations.kind = internal（Account#0）', live: true },
  { name: '代操', zh: '我們替客戶操作', deployment: 'hosted', money: 'contract', actor: 'staff', note: '也可 credits；客戶買維運時 self_hosted；on_behalf_of = 客戶', live: true },
  { name: '訂閱', zh: '客戶自己用，按期付', deployment: 'hosted', money: 'contract', actor: 'customer', note: '14 天 trial 起', live: false },
  { name: '點數', zh: '客戶自己用，按次扣', deployment: 'hosted', money: 'credits', actor: 'customer', note: '共用錢包（ADR 015）', live: false },
  { name: '賣人＝買斷', zh: '裝在客戶主機', deployment: 'self_hosted', money: 'perpetual', actor: 'customer', note: '＋updates_until；客人已有網站就接進來（§6）；買維運時 staff', live: false },
];

// 現在真的在跑的（2026-10-16 查）
export const NOW = [
  { what: '客戶能自己登入', state: 'no', ev: '今天才開：員工替客戶開帳號 → 設定密碼信；prod 缺 RESEND_API_KEY，portal 公開註冊關著（WORKLOG 2026-10-16 續8、續10）' },
  { what: '有人付錢', state: 'no', ev: '0062 合約 0 筆、錢包帳本 0 筆、Woo 未賣點數包（ADR 015:13、ADR 017 脈絡）' },
  { what: '買斷', state: 'no', ev: '授權檔、安裝程式、模組清單未建（順序 5）' },
  { what: '許可判斷', state: 'no', ev: 'lib/entitlements 不存在；認知平台 check_entitlement 永遠 grant（check.py:25）' },
];

// ADR 017「順序」。status: not_started | in_progress | done；done 必填 commit。
export const STEPS = [
  { n: 1, title: '登記表加 features[] 與 accessChannels；機械閘', what: 'products.ts 每個產品宣告收費功能（feature_key、上限種類、能不能買斷）與通道（ui）；閘：收費功能都有登記、可買斷模組無 SAFETY_GATE。',
    files: ['next-admin lib/portal/products.ts', 'lib/portal/__tests__/products.test.ts'], gate: 'products.test.ts：漏填紅燈；可買斷模組含 SAFETY_GATE 紅燈', risk: 'Low', model: 'Opus 5.5', depends: [], status: 'not_started' },
  { n: 2, title: 'Migration：plans、organization_entitlements、organizations.kind；許可帶 actor', what: '三表只給控制面；0062 加 plan_key、source_ref、放寬 CHECK；organizations.kind internal／customer（Account#0 → internal）；控制面簽功能級許可，欄位含 actor、on_behalf_of。',
    files: ['lobster-factory/packages/db/migrations/', 'next-admin lib/entitlements/'], gate: '靜態檢查：三表只准 lib/entitlements/** 與 app/portal/** 引用，別處出現建置失敗', risk: 'Medium', model: 'Opus 5.5（先出計畫）', depends: [1], status: 'not_started' },
  { n: 3, title: 'Woo 付款通知 → 合約與權利；帳本泛化', what: '付款通知帶 Woo 商品 id → plans.woo_product_ids 查方案 → 合約列 → 重算權利列；media_ 帳本去前綴加 product_key（ADR 015 §4）。',
    files: ['wp-bridge 外掛', 'next-admin app/portal/'], gate: '測試：一筆付款通知只產生一組合約與權利列（冪等）', risk: 'High（金流）', model: 'Opus 5.5', depends: [2], status: 'not_started', before: '定期扣款外掛與台灣金流查定（待決 1）；點數條款與預收會計（待決 3）' },
  { n: 4, title: '每個收費點只問 can(主體, feature_key, actor)', what: '社群、collect、認知平台的收費按鈕與 API 呼叫前問一次；認知平台 check_entitlement 改成 can() 薄接頭（加 actor、回 grant 物件），呼叫端 main.py 9 處同 commit。',
    files: ['next-admin lib/entitlements/can.ts', 'ai_lego/platform/entitlement/check.py', 'ai_lego/apps/api/main.py'], gate: '測試：代操時點數扣 on_behalf_of、稽核記 actor；沒有 active 權利列不簽許可', risk: 'Medium', model: 'Opus 5.5', depends: [2], status: 'not_started' },
  { n: 5, title: '買斷安裝階段', what: '模組清單、建置時排除 SAFETY_GATE、授權檔簽發（含 max_tenants）、客戶主機商 token 的 adapter、交接撤 key。排在一鍵架站 Stage 4 之後。',
    files: ['lobster-factory/packages/workflows/src/provision/', 'APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md'], gate: '授權檔離線驗章；我們的伺服器停了安裝照常能用', risk: 'High（交付）', model: 'Fable 5.1 設計 → Opus 5.5 做', depends: [4], status: 'not_started', before: 'Postiz AGPL 交付請律師確認（待決 2）' },
  { n: 6, title: 'API 通道', what: '計費帳戶發 API key（scope = feature_key 子集），actor = api_key:<id>，用量走同一個 report()；登記表 accessChannels 加 api。', files: ['next-admin lib/entitlements/'], gate: '測試：key 的 scope 外功能被拒', risk: 'Medium', model: 'Opus 5.5', depends: [4], status: 'not_started', waitFor: '等第一個只串 API 的客戶' },
  { n: 7, title: '轉售', what: '授權檔 max_tenants > 1，安裝內租戶數受它限制；合約與價格另訂。', files: ['授權檔格式'], gate: '測試：超過 max_tenants 的租戶建立被拒', risk: 'Medium', model: 'Opus 5.5', depends: [5], status: 'not_started', waitFor: '等第一個轉售客戶' },
];

// 操作者自己要決定的（agent 不能替她定）
export const OPEN = [
  { n: 1, what: '訂閱每月扣款：WooCommerce 用哪個定期扣款外掛？台灣金流能不能定期扣款？', before: 3, src: 'ADR 017 產品決定 Q3' },
  { n: 2, what: 'Postiz 是 AGPL-3.0：買斷交付前請律師確認', before: 5, src: 'ADR 017 §5' },
  { n: 3, what: '點數不退、不轉讓的條款寫法（台灣數位內容解除權例外）；賣點數的錢用掉前算預收，問會計師', before: 3, src: 'ADR 015 §4' },
];

// 要一起改但不是順序步驟的
export const SIDE = [
  { what: 'System Foundry 問卷對齊三軸：補「代操」CAP、self_hosted 獨立題、API 通道；藍圖必寫「許可只問 can()」', when: '順序 1 啟動時', src: 'TASKS.md:133' },
  { what: 'app.aware-wave.com /ops/products 頁：從 products.ts 與 customer-model.ts 渲染三扇門、三軸、五種', when: '卡片 task_86d6f772', src: '本 session' },
];

// 今天的紀錄（誰改了什麼）
export const LOG = [
  { c: 'ca619c079', what: '猜了四種（訂閱／點數／贈送／買斷）寫進 AGENTS.md', verdict: '錯，撤回' },
  { c: 'c152ee003', what: '撤回上面那行', verdict: '' },
  { c: '1d6aefb34', what: '操作者定案五種：自用／代操／訂閱／點數／賣人＝買斷；AGENTS.md §0 一行、ADR 017 §0 表', verdict: '被 2c90ee8b4 重寫' },
  { c: '2c90ee8b4', what: 'ADR 017 §0 改三軸＋五種對應＋業界對照；§3 許可加 actor／on_behalf_of；§5 授權檔 max_tenants；順序 6、7；不採用「五種存 enum」；WORKLOG 續13', verdict: '現行' },
  { c: '9def149a6', what: '順序 4：認知平台 check_entitlement 改 can() 薄接頭，呼叫端 main.py 9 處；HCI 照 ADR-0031 閘、ADR-0009 主體', verdict: '現行' },
];
