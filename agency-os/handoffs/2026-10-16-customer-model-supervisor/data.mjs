// 客戶怎麼來 監工台 -- 唯一的資料來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：ADR 017（三軸、順序 1–7）、ADR 018（三扇門）。這裡只放「狀態」與「指向」，不重述理由。

export const META = {
  title: '客戶怎麼來 監工台',
  updated: '2026-10-29',
  adr017: 'agency-os/docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md',
  adr018: 'agency-os/docs/architecture/decisions/018-product-doors-and-buyout-delivery.md',
  tasks: 'agency-os/TASKS.md「ADR 017 客戶怎麼買」',
  adr012: 'agency-os/docs/architecture/decisions/012-shared-platform-layer.md',
  adr015: 'agency-os/docs/architecture/decisions/015-awarewave-account-and-shared-wallet.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-16 續13（三軸）、續14（監工台）、續15（七張卡）；2026-10-18 全鏈自審條目；2026-10-23 續36（先後決策）；2026-10-24 續36（video、design 上線，門只讓持有產品的帳戶進）、續39（部署）、續57（4b 待決選項、設計更新、八張小卡）；2026-10-25 續73（帳號頁只列持有產品）、續76＋續79（現成方案評估）、續58＋續59（賣家設計與定案）、續68＋續70（賣家 4c-4、0133 套 prod）',
  self: 'agency-os/handoffs/2026-10-16-customer-model-supervisor/',
  url: 'https://claude.ai/artifact/Htm4xqe362YM987Fo8YLCr',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '說明客戶來源、付款方、操作人，以及系統尚缺的項目。',
  updated: '更新於 {date}',
  nav: { rules: '規則', now: '現況', ways: '五種客戶', priority: '先後與定價', steps: '待建項目', open: '待你決定', doors: '入口', paths: '檔案' },
  rules: { h: '每個系統都要過的規則', lead: '這三條寫在 ADR 017 §0b，測試會擋，不靠記憶。' },
  now: { h: '現況', lead: '客戶目前無法自行登入，也尚未收費；現在只有自用與代操。' },
  drill: { h: '實際帳戶演練（2026-10-23）', lead: '每個帳戶跑一次真正的判斷（can()、帳戶歸屬、用量記錄），資料照 prod 現況；標「加的」的帳戶 prod 沒有，是為了補齊缺的方式。來源：lib/entitlements/__tests__/customer-drill.test.ts。' },
  ways: { h: '五種客戶', lead: '每種客戶由三個答案決定：裝在哪、錢從哪來、誰操作。答案屬於客戶帳戶與每次請求，不屬於產品，所以每個產品五種都有、不用選。新增客戶類型只需增加一列，不必修改程式。', count: '共 {total} 種，{live} 種已運作' },
  priority: { h: '先後與定價', lead: '依你 2026-10-17 的決定排序；賣斷的收費結構是預設值，數字可改。', next: '接下來依序做（2026-10-23 依現況排）', nextLead: '先門、後收錢。三個答案互不等待：門是「客戶本人操作」的唯一前提，純內部工程、沒有待決；收錢的外部部分（金流商、會計師）卡兩個待決，內部部分（用量計量、人工付款入口）不等待決先做；登入目前的本機帳號已能用，WordPress 一鍵登入只在付款發生在 WordPress 時才有價值，所以跟 Woo 同一包。', pricing: '賣斷怎麼收錢' },
  steps: { h: '待建項目', lead: '項目須依序完成，每項都有完成條件。風險 High 的項目須經你同意後才能動工。標「待第一個…客戶出現」的項目刻意不做，不算進進度條。', count: '{done} 完成、{doing} 進行中、{parked} 等客戶出現' },
  open: { h: '待你決定', lead: '以下事項待你決定；決定後才能啟動對應項目。', count: '{n} 項', before: '須於第 {n} 項前決定', src: '出處' },
  doors: { h: '入口', lead: '三個網址分開登入；網址由設定決定，不寫入程式。', login: '登入' },
  paths: { h: '檔案', plan: '計畫正本', doors: '入口規則', platform: '共用平台與錢包', track: '追蹤', self: '本頁來源', howto: '修改 data.mjs，再執行 node build.mjs、node check.mjs，最後重新發布' },
  label: { card: '執行卡', yes: '有', no: '沒有', live: '已運作', notLive: '未開放', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成條件', details: '工程細節', depends: '前置', files: '檔案', none: '無', doneAt: '完成於', item: '第 {n} 項', also: '另有' },
};

// 每個系統都要過的規則（ADR 017 §0b）；監工台最上面一段
export const RULES = [
  { h: '同一個模式', t: '整套新系統先在 System Foundry 答「要／不要」，再執行 scripts/new-product.mjs --from-foundry；小工具直接執行 new-product.mjs 答五題。兩條路都產生同一份登記列、自己的門、自己的資料、收費前只問 can() 的骨架。手寫一列，測試紅燈。' },
  { h: '離開 WordPress 也能跑', t: '付款、登入、CRM 都在接頭後面，接頭的值是設定。整套測試以 payments=local、login=local、crm=none 跑一遍必須全綠。WordPress 是今天的門口與收銀台，不是房子。' },
  { h: '樂高：選配與串接', t: '登記表就是積木目錄，匯出到 System Foundry 成一節「AwareWave 積木」：勾行銷、客服、社群…就裝哪些，依賴自動帶入。功能用 features 與方案決定；買斷能單獨裝哪些積木由 standalone 與 dependsOn 決定；積木之間只走 API 與簽章事件，不讀對方的表。' },
];

// ADR 017 Q10：做的先後（操作者 2026-10-17）
export const PRIORITY = [
  { h: '① 先服務自己的客戶', t: '代操也要算得出每位客戶用了多少。', steps: [1, 2, 3] },
  { h: '② 訂閱與點數，產品要有樣子', t: '客戶在 aware-wave.com（WordPress）付款後自動開通；每個產品有自己的門與版面，打開就能用。', steps: [4, 8] },
  { h: '③ 賣斷給一般公司', t: '一鍵安裝到客戶主機，交接後收回存取權。', steps: [5] },
  { h: '④ 等第一個客戶出現再做', t: '只串 API 的客戶、代理商用一套服務多家客戶、客戶要用自己的網址；各自獨立，不卡前面三段。', steps: [6, 7, 9] },
];
// 接下來的實際順序（2026-10-23 依 prod 現況排；證據在 NOW 與各卡）。steps＝相關步驟；每個未完成步驟至少出現一次（check 擋）。
export const NEXT = [
  { h: '① 翻強制模式（等 10/31，不占工時）', t: '權利已就位（2026-10-23 部署）；客戶本人操作時已一律強制，翻的只影響員工。10/31 自動檢查 7 天「若強制就拒」歸零或都已解釋後，請你同意再翻（High）。', steps: [3] },
  { h: '② 用量計量與門上線阻擋項', t: '已做（2026-10-23）：每道付費縫記用量（自用與合約列只記不扣；單價待你定）、studio 精選免費路徑在付費閘前且門上藏 AI 按鈕。tarot 批次也已記操作者（0119 已套 prod，2026-10-23）。剩：員工路由在 withFeature 範圍外的付費工作仍記在自用帳戶（TASKS「員工路由用量歸屬」）。', steps: [3, 8] },
  { h: '③ 門逐個上線', t: 'tarot、studio（2026-10-23）、video、design（2026-10-24）、content（2026-10-30）已上線，共用一個 nginx 門區塊。每個功能分開買或贈送（你 2026-10-24 定）：客戶帳戶持有該產品才進得了門，否則只看到「尚未開通」；每扇門左邊選單列功能，沒持有的灰掉（做好待部署）。逐門任務在 cards/step-8-doors-video-design-content.md；剩 cs（等 Chatwoot）、collect、outreach（員工路由要先搬）最後。每個門上線 High。第一個自助客戶不等 Woo：員工邀請（本機帳號登入已能用）＋人工寫合約列，與 Soulful 同一條路。', steps: [8] },
  { h: '④ 收錢分兩段', t: '4a 已上線（2026-10-23；0120 已套 prod，程式 10/24 03:00 部署）：付款接頭、收件表、合約與權利同一交易寫入、錢包入帳與只退未用點數、拒付凍結、/ops/billing；付款來源「人工」（轉帳後用 scripts/record-payment.mjs 登記）。訂閱付款前還要你定第一個方案（plans 0 筆）。4b 設計與八張小卡已寫（2026-10-24，cards/step-4.md §4b）：付款事件由 wp-bridge 外掛用官方 PHP action 送（不用 Woo 原生 webhook：沒有續約事件、失敗 5 次就停用）；WordPress 會員對應計費帳戶一張表（0124）；第一次付款的會員自動建帳戶並寄設定密碼信；WordPress 一次性碼進產品門（ADR 015 順序 1）。4b-1～4b-5、4b-7 已完成（0124、0126 已套 prod；收費外掛 aware-wave-store 1.0.0 已裝 aware-wave.com，2026-10-25）；扣款、點數條款、點數規則三題已定（都選 A）。4b-6 由你在 WordPress 後台做（裝 WooCommerce Subscriptions、綠界個人會員收台灣卡、PayPal 收海外卡、結帳必登入、條款勾選；2026-10-30 改：你是個人、無統編，申請不了 TapPay，月收 5 萬須稅籍登記後再評估收攏單軌），綠界要開通信用卡與定期定額、PayPal 要連玉山全球通；也要你定第一個方案。收第一筆真錢前做 4b-9 真實付款演練：各段單獨有測試，但 WordPress→控制面整條沒跑過（prod payment_events 0 筆）。4c 賣家（收銀台可裝在任何網站，ADR 017 決定 #12，2026-10-25 你定 D1–D5）：代理權、收銀台登記表、各站鑰匙驗章與 /ops/sellers 已完成（0133、0140、0141 已套 prod；4c-2 已部署 2026-10-29），aware-wave.com 照舊；外掛代理商模式已發版並升級 aware-wave.com（1.2.0，月結依買家付款月份，0142）；剩第一個代理商網站實測。設計與執行卡在 cards/step-4-seller.md。', steps: [4] },
  { h: '⑤ 買斷安裝', t: '收錢兩段完成、待決 2 律師回覆後開工。授權檔改由自架 Keygen CE 簽發，不自寫簽章（現成方案評估 2026-10-25）。', steps: [5] },
  { h: '⑥ 等客戶出現', t: '只串 API、代理商、白牌網址：出現第一個這類客戶才做。', steps: [6, 7, 9] },
];
// 實際帳戶演練：way 必須是 WAYS 的名字（check 擋）。結果＝customer-drill.test.ts 的斷言。
export const DRILL = [
  { way: '自用', who: 'awarewave-ops（自用帳戶）', axes: 'hosted／comp／staff', result: '全產品可用、後台 AI 可用；記用量、不扣點。' },
  { way: '代操', who: 'soulful-expression', axes: 'hosted／contract／staff，替 Soulful', result: '用 Soulful 的合約；用量記在 Soulful、稽核寫員工本人；Soulful 底下的品牌也算 Soulful。' },
  { way: '訂閱', who: 'soulful-expression 的客戶登入', axes: 'hosted／contract／customer', result: '一律真判決；合約內功能可用，後台 AI（文化／時事）拒絕。' },
  { way: '自用', who: 'edd-research（你的研究，贈送）', axes: 'hosted／comp／staff 或 customer', result: '全產品免費可用。' },
  { way: '訂閱', who: 'mongolia-03（等刷卡）', axes: 'hosted／（尚無）／customer', result: '客戶本人全部拒絕；員工替它做在影子模式放行但記「若強制就拒」，強制後拒絕。' },
  { way: '訂閱', who: 'e2e-verify-0704、test-wp-webhook-co（測試）', axes: 'hosted／（尚無）／customer', result: '同未付款客戶，全部拒絕。' },
  { way: '點數', who: 'drill-credits（加的，content 點數包加購列＋錢包 50 點）', axes: 'hosted／credits／customer', result: '包含的點數功能用錢包付（單次上限 50）；包以外的功能與合約功能拒絕；目前不扣點（單價待你定）。' },
  { way: '點數', who: 'drill-wallet-only（加的，只有錢包 500 點、沒有列）', axes: 'hosted／credits／customer', result: '全部拒絕：只有錢包打不開任何功能（2026-10-25 決定 A）。' },
  { way: '訂閱', who: 'drill-social-subscriber（加的，只訂社群）', axes: 'hosted／contract／customer', result: '社群可用，其他產品拒絕。' },
  { way: '賣人＝買斷', who: '（未建）', axes: 'self_hosted／perpetual／customer', result: '授權檔與離線驗章還沒做（順序 5），演練標為待建。' },
];

// ADR 017 Q9：賣斷怎麼收錢（預設值，可改）
export const PRICING = [
  { h: '買斷價', t: '等於 36 個月訂閱價，含 12 個月更新。' },
  { h: '更新年費', t: '買斷價的 20%，選購；不續約仍可使用最後一版，永不鎖。' },
  { h: '維運月費', t: '分級選購：備份、監控、更新套用、支援回應時間；含一把維運用的金鑰。' },
  { h: 'AI 與平台 API', t: '客戶用自己的金鑰自付。' },
];

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
  { name: '訂閱', zh: '客戶自用，按期付費', story: '例：公司在 aware-wave.com 訂閱社群發文服務，每月扣款；員工登入 social.aware-wave.com 使用。', deployment: 'hosted', money: 'contract', actor: 'customer', note: '14 天試用起', live: false },
  { name: '點數', zh: '客戶自用，按次付費', story: '例：購買 500 點，在認知平台每次進行 AI 分析扣 3 點，用完再補。', deployment: 'hosted', money: 'credits', actor: 'customer', note: '共用錢包（ADR 015）', live: false },
  { name: '賣人＝買斷', zh: '安裝於客戶主機', story: '例：集團一次付清，系統安裝在集團主機，使用集團自己的 AI 金鑰；子公司與分公司共用同一套，不另收費。', deployment: 'self_hosted', money: 'perpetual', actor: 'customer', note: '＋updates_until；客戶已有網站就接入（§6）；購買維運時採 staff', live: false },
];

// 現在真的在跑的（2026-10-23 查：prod docker exec printenv、psql 唯讀）
export const NOW = [
  { what: '客戶可自行登入', state: 'no', ev: '2026-10-30 定案：註冊只在 aware-wave.com（WordPress 會員＋信箱驗證／Google），驗證後送 50 點註冊禮並自動建 app 帳號；portal 註冊已刪（reports/decisions/2026-10-30-customer-self-signup-email-google.md）。實走一次註冊→進入後改 yes' },
  { what: '已有付費客戶', state: 'no', ev: 'Soulful 代操合約已登記（全產品，0118）；自助付費 0：plans、錢包帳本皆 0 筆，Woo 尚未販售' },
  { what: '代操用量按客戶計', state: 'no', ev: '程式已接（2026-10-23）：每道付費縫 grant.recordUse() 每個 grant 記一列 entitlement.usage（lib/ai/gateway.ts、collect、video.tts），閘擋「credits 功能走不到 recordUse」；2026-10-24 03:00 自動部署後生效。扣點仍 0（每功能單價待你定）；錢包入帳只經付款事件（0120 billing_apply_payment_event，4a，2026-10-23）' },
  { what: '買斷', state: 'no', ev: '授權檔與模組清單未建；provision/ 只有一鍵架站（provisionClient.ts）' },
  { what: '許可判斷', state: 'yes', ev: '每個收費點只問 can()（e87de9225），影子模式（ENTITLEMENT_MODE 未設，can.ts:63）：照算判決並記錄，一律放行、不扣點。點數功能先認權利列（b3df190e9）；自用、EdD 免費與 Soulful 全產品合約每天自動補齊（0118），已部署；翻強制待 10/31 自動檢查與你同意；每功能扣幾點待你定價' },
  { what: '產品自己的門', state: 'yes', ev: 'social、tarot、studio、video、design、content 已上線（video／design 2026-10-24：DNS、憑證 15 SAN、兩層 nginx、部署 51a84b203；content 2026-10-30：憑證 16 SAN、部署 3f9bb4273；公網與 Playwright 煙霧測試通過）；門只讓持有該產品的帳戶進門頁（lib/portal/door-access.ts；API 層尚未查持有，見 TASKS 產品門條目）；其餘 5 個未開。開門規則與機械閘見 ADR 018 §2；登記表 11 個產品仍是 coming_soon（開放販售另做）' },
];

// ADR 017「順序」。status: not_started | in_progress | done；done 必填 commit。
export const STEPS = [
  { n: 1, card: 'cards/step-1.md', plain: '新產品只有一個入口：執行 scripts/new-product.mjs，回答五題，登記列、頁面骨架、收費點與測試就產生好；漏填或未登記的工具都會讓測試失敗。', title: '登記表加 features[] 與 accessChannels；產生器 new-product.mjs；機械閘', what: 'products.ts 每個產品宣告收費功能（feature_key、上限種類、能不能買斷、billing: contract|credits）與通道（ui；api 待 API 通道那一項開放）；sync-foundry-catalog.mjs 把登記表匯出成 System Foundry 的「AwareWave 積木」題目；閘：收費功能都有登記、可買斷模組無 SAFETY_GATE、目錄檔等於登記表。',
    files: ['scripts/new-product.mjs', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts'], gate: 'products.test.ts：漏填亮紅燈；可買斷模組含 SAFETY_GATE 亮紅燈；app 內任何目錄既不在登記表、也不在後台清單就亮紅燈（客服、蒐集器、行銷住在 /ops 下也算產品，只補登記列不搬家）', risk: 'Low', model: 'Opus 5.5', depends: [], status: 'done', commit: '1ef1ee419' },
  { n: 2, card: 'cards/step-2.md', plain: '資料庫記錄誰購買哪個方案、何時到期，以及哪位員工替哪位客戶操作。', title: 'Migration：plans、organization_entitlements、organizations.kind；許可帶 actor', what: '三表只給控制面；0062 加 plan_key、source_ref、放寬 CHECK；organizations.kind internal／customer（Account#0 → internal）；控制面簽功能級許可，欄位含 actor、on_behalf_of。',
    files: ['lobster-factory/packages/db/migrations/', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/'], gate: '靜態檢查：付費 AI 的 SDK 與錢包帳本只准在 lib/entitlements/** 與 lib/ai/gateway.ts 引用；三張權利表只准在 lib/entitlements/** 與 app/portal/**；WordPress／Woo／Fluent 符號只准在各自接頭檔；其他位置出現就建置失敗', risk: 'Medium', model: 'Opus 5.5（先出計畫）', depends: [1], status: 'done', commit: 'ee3e7bde5' },
  { n: 3, card: 'cards/step-3.md', plain: '每項收費功能執行前都先確認權限；未購買時按鈕顯示停用。', title: '每個收費點只問 can(主體, feature_key, actor)', what: '社群、collect、認知平台的收費按鈕與 API 呼叫前問一次；認知平台 check_entitlement 改成 can() 薄接頭（加 actor、回 grant 物件），呼叫端 main.py 9 處同 commit。',
    files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts', 'Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py', 'Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py'], gate: '測試：功能一定要有權利列，只有錢包一律拒；列寫 pay: credits 的點數功能才扣錢包、餘額不足即拒（2026-10-25 改，4b-5）；代操時從 on_behalf_of 扣點，稽核記 actor；沒有 active 權利列不簽許可；沒有登記列的產品拿不到 grant', risk: 'Medium', model: 'Opus 5.5', depends: [2], status: 'done', commit: 'e87de9225' },
  { n: 4, card: 'cards/step-4.md', plain: '客戶在 aware-wave.com 付款後，系統自動開通，不需人工處理。', title: 'Woo 付款通知 → 合約與權利；帳本泛化', what: 'Woo 原生 webhook（六種事件含退款與拒付）→ 收件表去重 → 同一交易寫合約、權利、帳本；media_ 帳本去前綴加 product_key（ADR 015 §4）。',
    files: ['lobster-factory/packages/db/migrations/0120_payment_events.sql', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/payments/', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/contracts.ts', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/payments/', 'lobster-factory/packages/wp-bridge-plugin/'], gate: '測試：同一 event_id 重送不做事；退款只退未用點數；拒付凍結；假簽章 401', risk: 'High（金流）', model: 'Opus 5.5', depends: [3], status: 'in_progress', before: '扣款方式、點數條款、點數規則三題已定（2026-10-25，都選 A，寫進 ADR 017 產品決定 #3、#11 與 ADR 015 §待查）；點數包使用權不設期末（2026-10-25 決定，0128 已套 prod）',
    items: [
      { id: '4a', plain: '人工付款入口：收件表、合約與權利同一交易、錢包入帳、/ops/billing', status: 'done', commit: 'f2139d35a' },
      { id: '4b-1', plain: 'WordPress 會員對應計費帳戶（0124 customer_identities，已套 prod 2026-10-25）', status: 'done', commit: '0eb785f1c' },
      { id: '4b-3', plain: 'next-admin woo 收件接頭：驗章、查會員、第一次付款自動建帳戶（email 須經 WordPress 證明）；被拒的付款開 ops incident（0126 已套 prod）', status: 'done', commit: '125cdad43' },
      { id: '4b-2', plain: '外掛：送付款事件（WCS action，與金流商無關）、驗證會員 email、我的帳號「進入」按鈕；收費程式已拆到 aware-wave-store 1.0.0，裝在 aware-wave.com（WORKLOG 續53）', status: 'done', commit: 'ff5614403' },
      { id: '4b-6', plain: 'Woo 店面設定（你在 WordPress 後台做）：裝 WCS、綠界官方外掛（個人會員：信用卡一次付清，收台灣卡；個人開不了定期定額，台灣卡訂閱改手動續訂）、WooCommerce PayPal Payments（收海外卡；PayPal 商業帳戶＋玉山全球通提領）、結帳必登入、條款勾選、商品對應方案。2026-10-30 改：無統編申請不了 TapPay，月收 5 萬須稅籍登記後再評估收攏單軌', status: 'todo' },
      { id: '4b-7', plain: '/ops/billing 顯示客戶未用點數合計（合約負債）', status: 'done', commit: '125cdad43' },
      { id: '4b-4', plain: 'WordPress 一次性碼進產品門：next-admin 端做好（只給 email 已證明的帳戶、防登入固定），按鈕在外掛 4b-2；設密鑰才開', status: 'done', commit: '125cdad43' },
      { id: '4b-5', plain: '點數只付已持有功能（改 can() 點數分支，High）', status: 'done', commit: '81f81cf03' },
      { id: '4b-11', plain: '定價與扣點：1 點＝NT$1，每次交付成功的 AI 呼叫扣實際成本×3；錢包扣光就停；舊的客服每則 1 點預扣刪掉', status: 'done', commit: '33afaf874' },
      { id: '4b-9', plain: '真實付款演練：0 元試用與沙盒卡號各一筆，從 WordPress 結帳一路驗到開通、加點、一鍵進門、扣點、退款與取消（第一個方案 studio_basic 與定價 4b-11 已好；只等 4b-6）', status: 'todo' },
      { id: '4b-10', plain: '員工後台給／收某客戶的產品：客戶頁「帳務」分頁勾選＝贈送整個產品、取消＝收回，代理權（能不能賣）分開勾；只有擁有者／管理員，每次留稽核；只開贈送，合約仍走付款（0143 已套 prod 2026-10-29）', status: 'done', commit: '66b612ead' },
      { id: '4c-4', plain: '賣家：代理權（<產品>.resell）只看賣家帳戶的權利列，不經 can()（ADR 017 決定 #12）', status: 'done', commit: '38a8198fb' },
      { id: '4c-1', plain: '賣家：收銀台登記表 seller_sites（0133，已套 prod 2026-10-25）；aware-wave.com 是第一列，付款照舊', status: 'done', commit: '830dd301e' },
      { id: '4c-2', plain: '賣家：付款與「進入」按鈕都用該網站自己的鑰匙驗章，網站決定賣家，沒代理權的網站開不了帳戶；員工頁 /ops/sellers、總帳多「賣家」欄與每月各賣家合計（0140、0141 已套 prod 2026-10-29）', status: 'done', commit: 'b22ce2277' },
      { id: '4c-3', plain: '賣家：aware-wave-store 外掛代理商模式（每站一對 Ed25519 鑰匙）已發版並升級 aware-wave.com，現為 1.2.0（2026-10-29；付款事件帶付款時間，月結依付款月份；aware-wave.com 仍用原本的鑰匙）；剩第一個代理商網站：裝外掛、在 /ops/sellers 登記公鑰、試一筆 0 元訂單', status: 'todo' },
    ] },
  { n: 5, card: 'cards/step-5.md', plain: '系統可一鍵完整安裝到客戶主機；交接時收回 AwareWave 的存取權。', title: '買斷安裝階段', what: '三道閘後才開工：款項落定、客戶網域與主機歸屬驗證、操作者核准；模組清單、建置時排除 SAFETY_GATE、授權檔由自架 Keygen CE 簽發（含 max_tenants）、安裝專屬更新憑證、客戶主機商 token 以密鑰句柄傳入、交接撤 key。排在一鍵架站 Stage 4 之後。',
    files: ['lobster-factory/packages/workflows/src/provision/', 'agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md'], gate: '授權檔離線驗章；AwareWave 伺服器停止後安裝仍可用；安裝失敗只清本次 project；客戶網域由 compose、nginx、DNS 同一組值產生並 curl 200', risk: 'High（交付）', model: 'Fable 5.1 設計 → Opus 5.5 做', depends: [3, 4], status: 'not_started', before: '交付前請律師確認 Postiz AGPL 與 Keygen Fair Core License（待決 2）' },
  { n: 6, card: 'cards/step-6.md', plain: '客戶只透過程式串接、不使用畫面時，系統也能計費。', title: 'API 通道', what: '計費帳戶發 API key（scope = feature_key 子集），actor = api_key:<id>，用量走同一個 report()；登記表 accessChannels 加 api。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/'], gate: '測試：key 的 scope 外功能會被拒絕', risk: 'Medium', model: 'Opus 5.5', depends: [3], status: 'not_started', waitFor: '待第一個只串 API 的客戶出現' },
  { n: 7, card: 'cards/step-7.md', plain: '代理商用同一套系統服務多家客戶時，系統按客戶數計費。', title: '轉售（代理商版）', what: '授權檔 max_tenants > 1，安裝內「根組織」數受它限制：一家公司或一個集團（含子公司、分公司、部門）都算 1，不另收；代理商買去替多家不相干的客戶代操才是 >1，另訂價，隔離責任在客戶主機（操作者 2026-10-16 定案）。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/（授權檔格式，順序 5 建）'], gate: '測試：建立的租戶超過 max_tenants 時會被拒絕', risk: 'Medium', model: 'Opus 5.5', depends: [5], status: 'not_started', waitFor: '待第一個轉售客戶出現' },
  { n: 8, card: 'cards/step-8.md', plain: '每個產品都有自己的門與版面，一打開就是可用的樣子：產品名、功能清單、示範資料；不再只是後台裡的一頁。', title: '每個產品長成單一產品的樣子', what: '每個登記產品：頁面抽成共用元件、加 app/<key>/ 產品門路由（精簡版面）、開場即可用狀態、MODULE_MANIFEST 無 TODO；status: available 由測試擋；門上線（DNS、憑證、兩層 nginx）逐產品 High。不搬資料表、不改 API 前綴。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/<key>/', 'lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/<key>/ui/', 'lobster-factory/infra/hetzner-phase1-core/nginx/default.conf'], gate: '測試：available 的產品必有門頁、完整 manifest、至少一個功能；本機以 <subdomain>.localhost 開門看到產品版面；上線後 playwright smoke 綠', risk: 'Medium（每個門上線 High）', model: 'Fable 5.1 定規則 → Opus 5.5 逐產品做', depends: [1, 3], status: 'in_progress' },
  { n: 9, card: 'cards/step-9.md', plain: '客戶想用自己的網址（例如 social.客戶.com）開 AwareWave 主機上的產品，驗證網域後就能指過來。', title: '客戶自己的網址指到 hosted 產品門（白牌）', what: 'custom_domains 表；doorForHost 查表；DNS TXT 驗證；憑證自動（Cloudflare for SaaS 或 on-demand ACME，待決 4）。買斷安裝不用。', files: ['lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts', 'lobster-factory/packages/db/migrations/'], gate: '測試：未驗證的網址不路由；驗證後指到正確產品門與帳戶；網址本身不給登入', risk: 'Medium', model: 'Opus 5.5', depends: [8], status: 'not_started', waitFor: '待第一個要白牌網址的客戶出現', before: '憑證方式（待決 4）' },
];

// 操作者自己要決定的（agent 不能替她定）
export const OPEN = [
  { n: 2, what: '買斷交付前請律師確認授權：Postiz（AGPL-3.0）、MinIO（AGPLv3，Trigger 內含）、Redis（Trigger 與核心用浮動 7-alpine，7.4 起授權改為 RSALv2／SSPL）、Keygen CE（Fair Core License，授權檔簽發用）。', before: 5, src: 'ADR 017 §5' },
  { n: 4, what: '客戶白牌網址的憑證走 Cloudflare for SaaS（客戶 CNAME 到 AwareWave）還是主機上自動簽發（on-demand ACME）？', before: 9, src: 'ADR 018 §2' },
];

// 要一起改但不是順序步驟的
export const SIDE = [
  { what: 'System Foundry v1.7：選擇引擎留，產出重做——刪 74 節樣板、每模組一張可執行卡、每個產生的系統自帶監工台（supervisor-kit 共用）、接軌登記表與產生器、範例自動重生、加「裝在客戶自己的主機」一題', when: '已完成（V17-1～V17-8 全部 done）', step: 1, src: 'agency-os/handoffs/2026-10-18-foundry-v17-supervisor/data.mjs' },
  { what: '員工門產品目錄 app.aware-wave.com/ops/products：只讀 products.ts；三軸與五種的正本只留 ADR 017 §0，不另建 customer-model.ts', when: '併入', step: 8, src: 'cards/step-8.md' },
  { what: '門的授權檢查太寬：只要路由 import 了 grant.ts，就被當成「已檢查呼叫者」（grant.ts → subject.ts → tenant-guard.ts，檢查沒在 grant.ts 停下）。舊問題，不是這次造成的', when: '待做（舊問題）', step: 8, src: 'agency-os/TASKS.md「閘 ③「門路由要授權」」那一行；WORKLOG 2026-10-23 續46' },
  { what: '現成方案評估：訂閱維持 WooCommerce Subscriptions（金流 2026-10-30 改綠界＋PayPal 雙軌，見 TASKS 待決 1）；權利、錢包、代操維持自寫（市面沒有外掛做到「WordPress 掛了產品照跑」與「先預留再結算」）；買斷授權改用 Keygen CE；組織與席位可用 Memberships for Teams，等第一個企業客戶再評估', when: '已完成（2026-10-25）', step: 5, src: 'agency-os/reports/decisions/2026-10-25-customer-model-buy-vs-build.md' },
  { what: '客戶頁「帳號」只列客戶持有、且門已開的產品，每個帳號附各產品角色與「去設定」；設定密碼連結不再指向未開的門', when: '已完成（2026-10-25，e25ef5710）', step: 8, src: 'agency-os/WORKLOG.md 2026-10-25 續73' },
  { what: '影片存檔時沒帶組織、而 POD_DESIGNS_DEFAULT_ORG_ID 又沒設定，這支影片就不會被登記，用量也記不到客戶身上。舊問題，屬於「影片歸屬改為持久化 mapping」那一項', when: '待做（舊問題）', step: 3, src: 'agency-os/TASKS.md「影片歸屬改為持久化 outName → organization_id mapping」' },
];

