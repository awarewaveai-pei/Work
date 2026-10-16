// 客戶怎麼來 監工台 -- 唯一的資料來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：ADR 017（三軸、順序 1–7）、ADR 018（三扇門）。這裡只放「狀態」與「指向」，不重述理由。

export const META = {
  title: '客戶怎麼來 監工台',
  updated: '2026-10-16',
  adr017: 'agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md',
  adr018: 'agency-os/docs/architecture/decisions/018-product-doors-and-buyout-delivery.md',
  tasks: 'agency-os/TASKS.md:133',
  adr012: 'agency-os/docs/architecture/decisions/012-shared-platform-layer.md',
  adr015: 'agency-os/docs/architecture/decisions/015-awarewave-account-and-shared-wallet.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-16 續13（三軸）、續14（監工台）',
  self: 'agency-os/handoffs/2026-10-16-customer-model-supervisor/',
  url: 'https://claude.ai/artifact/Htm4xqe362YM987Fo8YLCr',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '說明客戶來源、付款方、操作人，以及系統尚缺的項目。',
  updated: '更新於 {date}',
  nav: { now: '現況', ways: '五種客戶', steps: '待建項目', open: '待你決定', doors: '入口', paths: '檔案' },
  now: { h: '現況', lead: '客戶目前無法自行登入，也尚未收費；現在只有自用與代操。' },
  ways: { h: '五種客戶', lead: '每種客戶由三個答案決定：安裝位置、付款來源、操作人。新增客戶類型只需增加一列，不必修改程式。', count: '共 {total} 種，{live} 種已運作' },
  steps: { h: '待建項目', lead: '項目須依序完成，每項都有完成條件。風險 High 的項目須經你同意後才能動工。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '以下事項待你決定；決定後才能啟動對應項目。', count: '{n} 項', before: '須於第 {n} 項前決定', src: '出處' },
  doors: { h: '入口', lead: '三個網址分開登入；網址由設定決定，不寫入程式。', login: '登入' },
  paths: { h: '檔案', plan: '計畫正本', doors: '入口規則', platform: '共用平台與錢包', track: '追蹤', self: '本頁來源', howto: '修改 data.mjs，再執行 node build.mjs、node check.mjs，最後重新發布' },
  label: { yes: '有', no: '沒有', live: '已運作', notLive: '未開放', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成條件', details: '工程細節', depends: '前置', files: '檔案', none: '無', doneAt: '完成於', item: '第 {n} 項', also: '另有' },
};

// ADR 018 §1：三扇門
export const DOORS = [
  { key: 'public', name: '公開門', host: 'aware-wave.com（WordPress）', who: '所有人', does: '介紹、訂閱、付款與會員帳號管理（WooCommerce）', login: 'WordPress 會員' },
  { key: 'product', name: '產品門', host: '<產品>.aware-wave.com，每個產品一個', who: '付費客戶；員工也可使用', does: '只能查看這個產品的頁面與 API，以及自己所屬的品牌', login: 'local／awarewave-wp／customer-wp' },
  { key: 'staff', name: '員工門', host: 'app.aware-wave.com', who: '操作者與團隊', does: '管理客戶、網站與所有品牌，也能使用每個產品', login: '現有後台帳號' },
];

// ADR 017 §0：三條軸。值存 text，不存 boolean；加值不改 schema。
export const AXES = [
  { key: 'deployment', name: 'A 部署', q: '安裝位置', where: '每個安裝', values: [
    { v: 'hosted', plain: 'AwareWave 主機', zh: 'AwareWave 主機，控制面簽許可' },
    { v: 'self_hosted', plain: '客戶主機', zh: '客戶主機，離線授權檔' },
  ] },
  { key: 'money', name: 'B 錢從哪來', q: '付款來源', where: '計費帳戶 × 產品 × 功能', values: [
    { v: 'contract', plain: '訂閱', zh: '0062 合約：trial → active 訂閱' },
    { v: 'comp', plain: '免費（自用或贈送）', zh: '贈送、自用' },
    { v: 'credits', plain: '點數', zh: '錢包按次扣，不是權利列' },
    { v: 'perpetual', plain: '一次買斷', zh: '買斷授權檔' },
  ] },
  { key: 'actor', name: 'C 誰在按', q: '操作人', where: '每次請求', values: [
    { v: 'staff', plain: 'AwareWave 員工', zh: '員工，帶 on_behalf_of = 替哪個計費帳戶' },
    { v: 'customer', plain: '客戶本人', zh: '客戶自己' },
    { v: 'api_key', plain: '客戶的程式', zh: '機器；等第一個只串 API 的客戶（順序 6）' },
  ] },
];

// ADR 017 §0：對外五種方式 = 三軸的組合
export const WAYS = [
  { name: '自用', zh: 'AwareWave 自用', story: '例：在 app.aware-wave.com 使用社群發文、客服與資料蒐集，不收費。', deployment: 'hosted', money: 'comp', actor: 'staff', note: '計費帳戶的 organizations.kind = internal（Account#0）', live: true },
  { name: '代操', zh: '員工替客戶操作', story: '例：Soulful 支付月費，由 AwareWave 員工代操發文與回覆客服，客戶不必登入。', deployment: 'hosted', money: 'contract', actor: 'staff', note: '也可使用 credits；客戶買維運時採 self_hosted；on_behalf_of = 客戶', live: true },
  { name: '訂閱', zh: '客戶自用，按期付費', story: '例：公司在 aware-wave.com 訂閱社群發文服務，每月扣款；員工登入 social.aware-wave.com 使用。', deployment: 'hosted', money: 'contract', actor: 'customer', note: 'trial 自 14 天起', live: false },
  { name: '點數', zh: '客戶自用，按次付費', story: '例：購買 500 點，在認知平台每次進行 AI 分析扣 3 點，用完再補。', deployment: 'hosted', money: 'credits', actor: 'customer', note: '共用錢包（ADR 015）', live: false },
  { name: '賣人＝買斷', zh: '安裝於客戶主機', story: '例：集團一次付清，系統安裝在集團主機，使用集團自己的 AI 金鑰；子公司與分公司共用同一套，不另收費。', deployment: 'self_hosted', money: 'perpetual', actor: 'customer', note: '＋updates_until；客戶已有網站就接入（§6）；購買維運時採 staff', live: false },
];

// 現在真的在跑的（2026-10-16 查）
export const NOW = [
  { what: '客戶可自行登入', state: 'no', ev: '今天才開放：員工替客戶開立帳號，寄出設定密碼信；prod 缺少 RESEND_API_KEY，portal 的公開註冊仍關閉（WORKLOG 2026-10-16 續8、續10）' },
  { what: '已有付費客戶', state: 'no', ev: '0062 合約 0 筆、錢包帳本 0 筆、Woo 尚未販售點數包（ADR 015:13、ADR 017 脈絡）' },
  { what: '買斷', state: 'no', ev: '授權檔、安裝程式與模組清單均未建立（順序 5）' },
  { what: '許可判斷', state: 'no', ev: 'lib/entitlements 不存在；認知平台 check_entitlement 永遠回傳 grant（check.py:25）' },
];

// ADR 017「順序」。status: not_started | in_progress | done；done 必填 commit。
export const STEPS = [
  { n: 1, plain: '每項產品都列出收費功能，漏列就會導致測試失敗。', title: '登記表加 features[] 與 accessChannels；機械閘', what: 'products.ts 每個產品宣告收費功能（feature_key、上限種類、能不能買斷）與通道（ui）；閘：收費功能都有登記、可買斷模組無 SAFETY_GATE。',
    files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts'], gate: 'products.test.ts：漏填時紅燈；可買斷模組含 SAFETY_GATE 時顯示紅燈', risk: 'Low', model: 'Opus 5.5', depends: [], status: 'not_started' },
  { n: 2, plain: '資料庫記錄誰購買哪個方案、何時到期，以及哪位員工替哪位客戶操作。', title: 'Migration：plans、organization_entitlements、organizations.kind；許可帶 actor', what: '三表只給控制面；0062 加 plan_key、source_ref、放寬 CHECK；organizations.kind internal／customer（Account#0 → internal）；控制面簽功能級許可，欄位含 actor、on_behalf_of。',
    files: ['lobster-factory/packages/db/migrations/', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/'], gate: '靜態檢查：三表只能由 lib/entitlements/** 與 app/portal/** 引用；其他位置出現引用就建置失敗', risk: 'Medium', model: 'Opus 5.5（先出計畫）', depends: [1], status: 'not_started' },
  { n: 3, plain: '客戶在 aware-wave.com 付款後，系統自動開通，不需人工處理。', title: 'Woo 付款通知 → 合約與權利；帳本泛化', what: '付款通知帶 Woo 商品 id → plans.woo_product_ids 查方案 → 合約列 → 重算權利列；media_ 帳本去前綴加 product_key（ADR 015 §4）。',
    files: ['lobster-factory/packages/wp-bridge-plugin/', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/'], gate: '測試確認一筆付款通知只產生一組合約與權利列（冪等）', risk: 'High（金流）', model: 'Opus 5.5', depends: [2], status: 'not_started', before: '定期扣款外掛與台灣金流的支援方式（待決 1）；點數條款與預收會計處理（待決 3）' },
  { n: 4, plain: '每項收費功能執行前都先確認權限；未購買時按鈕顯示停用。', title: '每個收費點只問 can(主體, feature_key, actor)', what: '社群、collect、認知平台的收費按鈕與 API 呼叫前問一次；認知平台 check_entitlement 改成 can() 薄接頭（加 actor、回 grant 物件），呼叫端 main.py 9 處同 commit。',
    files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts', 'Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py', 'Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py'], gate: '測試：代操時按 on_behalf_of 扣點數，稽核記錄 actor；沒有 active 權利列時不簽許可', risk: 'Medium', model: 'Opus 5.5', depends: [2], status: 'not_started' },
  { n: 5, plain: '系統可一鍵完整安裝到客戶主機；交接時收回 AwareWave 的存取權。', title: '買斷安裝階段', what: '模組清單、建置時排除 SAFETY_GATE、授權檔簽發（含 max_tenants）、客戶主機商 token 的 adapter、交接撤 key。排在一鍵架站 Stage 4 之後。',
    files: ['lobster-factory/packages/workflows/src/provision/', 'agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md'], gate: '授權檔離線驗章；AwareWave 的伺服器停止後，安裝仍可正常使用', risk: 'High（交付）', model: 'Fable 5.1 設計 → Opus 5.5 做', depends: [4], status: 'not_started', before: '交付 Postiz AGPL 前請律師確認（待決 2）' },
  { n: 6, plain: '客戶只透過程式串接、不使用畫面時，系統也能計費。', title: 'API 通道', what: '計費帳戶發 API key（scope = feature_key 子集），actor = api_key:<id>，用量走同一個 report()；登記表 accessChannels 加 api。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/'], gate: '測試：key 的 scope 外功能會被拒絕', risk: 'Medium', model: 'Opus 5.5', depends: [4], status: 'not_started', waitFor: '待第一個只串 API 的客戶出現' },
  { n: 7, plain: '代理商用同一套系統服務多家客戶時，系統按客戶數計費。', title: '轉售（代理商版）', what: '授權檔 max_tenants > 1，安裝內「根組織」數受它限制：一家公司或一個集團（含子公司、分公司、部門）都算 1，不另收；代理商買去替多家不相干的客戶代操才是 >1，另訂價，隔離責任在客戶主機（操作者 2026-10-16 定案）。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/（授權檔格式，順序 5 建）'], gate: '測試：建立的租戶超過 max_tenants 時會被拒絕', risk: 'Medium', model: 'Opus 5.5', depends: [5], status: 'not_started', waitFor: '待第一個轉售客戶出現' },
];

// 操作者自己要決定的（agent 不能替她定）
export const OPEN = [
  { n: 1, what: '訂閱每月扣款：WooCommerce 應使用哪個定期扣款外掛？台灣金流是否支援定期扣款？', before: 3, src: 'ADR 017 產品決定 Q3' },
  { n: 2, what: 'Postiz 是 AGPL-3.0；買斷交付前請律師確認。', before: 5, src: 'ADR 017 §5' },
  { n: 3, what: '點數不退、不轉讓的條款如何撰寫（台灣數位內容解除權例外）；賣點數的款項使用前列為預收，請會計師確認。', before: 3, src: 'ADR 015 §4' },
];

// 要一起改但不是順序步驟的
export const SIDE = [
  { what: 'System Foundry 問卷須對齊三軸：補上「代操」CAP、將 self_hosted 設為獨立題目、加入 API 通道；藍圖必須寫明「許可只問 can()」', when: '順序 1 啟動時', src: 'TASKS.md:133' },
  { what: 'app.aware-wave.com /ops/products 頁面從 products.ts 與 customer-model.ts 渲染三扇門、三軸與五種客戶', when: '卡片 task_86d6f772', src: '本 session' },
];

// 今天的紀錄（誰改了什麼）
export const LOG = [
  { c: 'ca619c079', what: '猜了四種（訂閱／點數／贈送／買斷）寫進 AGENTS.md', verdict: '錯，撤回' },
  { c: 'c152ee003', what: '撤回上面那行', verdict: '' },
  { c: '1d6aefb34', what: '操作者定案五種：自用／代操／訂閱／點數／賣人＝買斷；AGENTS.md §0 一行、ADR 017 §0 表', verdict: '被 2c90ee8b4 重寫' },
  { c: '2c90ee8b4', what: 'ADR 017 §0 改三軸＋五種對應＋業界對照；§3 許可加 actor／on_behalf_of；§5 授權檔 max_tenants；順序 6、7；不採用「五種存 enum」；WORKLOG 續13', verdict: '現行' },
  { c: '9def149a6', what: '順序 4：認知平台 check_entitlement 改 can() 薄接頭，呼叫端 main.py 9 處；HCI 照 ADR-0031 閘、ADR-0009 主體', verdict: '現行' },
];
