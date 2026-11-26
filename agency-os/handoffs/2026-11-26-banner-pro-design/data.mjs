// 橫幅 R2 監工台 -- 唯一資料來源。進度只改 PROGRESS／COMMITS／RISKS／GO；卡的內容正本在 PLAN-R2.md §5，狀態表在 §7（check.mjs 比對卡號）。
// 改完：node build.mjs → node check.mjs → 重新發布同一個網址。

export const META = {
  title: '橫幅工具第二輪監工台',
  updated: '2026-11-26',
  plan: 'agency-os/handoffs/2026-11-26-banner-pro-design/PLAN-R2.md',
};

// todo｜doing｜review｜done（done 要在 COMMITS 填 commit）
export const PROGRESS = { 'R2-A': 'done', 'R2-B1': 'done', 'R2-B2': 'doing', 'R2-C': 'doing' };
export const COMMITS = { 'R2-A': 'ef6572105', 'R2-B1': '528cb59d5' };

// 等你決定：要提前手動部署或高風險時才放這裡。{ card, what, rollback }
export const GO = [];

// 工人交回的 RISKS 與處置 { card, said, handling }。一批全部交回後一起看，處理完才部署。
export const RISKS = [
  { card: 'R2-A', said: 'AI 每個尺寸會回徽章角與 logo 角，但這兩個欄位還不算「各尺寸自己的設定」，會漏到主設計。', handling: 'R2-B2 把它們加進各尺寸設定。R2-A 合併時先放部署暫停檔，第二批做完才一起部署。' },
  { card: 'R2-A', said: 'AI 一鍵設計套用版面時，沒有經過「按鈕清掉拖曳位置」的同一條路。', handling: 'R2-B2 改成一律經同一條路。' },
  { card: 'R2-A', said: '關掉自動字級、字又放不下時，仍可能重疊或超出畫面；logo 拉到最大的長條 logo 也會超出。', handling: '保留：那是你手動指定的大小。新設計預設開自動字級（R2-B2）。' },
  { card: 'R2-A', said: '寬尺寸與商品放側邊時，文字位置和以前不同（邊距與文字欄重算）。', handling: '保留：這是本輪要的改法（文字讓開商品）。' },
  { card: 'R2-A', said: '按位置按鈕只清「正在編輯的尺寸」的拖曳位置。', handling: '確認照這樣：每個尺寸的拖曳各自獨立。' },
  { card: 'R2-A', said: 'Codex：直式 logo（例如高是寬的四倍）在 3:1 會超出畫面大半。', handling: '已修 c278c1b58：logo 高度上限為畫高的四分之一，重疊測試含直式 logo。' },
  { card: 'R2-B1', said: 'Codex：剛打完字就按清除，復原找不回（歷史半秒後才寫入）。', handling: '已修 c8bb7b463：清除前先寫入歷史，有測試。' },
  { card: 'R2-B1', said: 'Codex：只剩生成的文案清單時，清除鈕是灰的，清單清不掉。', handling: '已修 c8bb7b463。' },
  { card: 'R2-A', said: '數值範圍表目前只給排版引擎用，滑桿還沒接。', handling: 'R2-B2 接上。' },
  { card: 'R2-A', said: '重疊測試的尺寸清單寫在測試檔裡，新加的 2:1 不會自動進測試。', handling: 'R2-B2 改成讀尺寸總表。' },
  { card: 'R2-B1', said: '改了交辦外的字色測試：拆檔後六處紅綠字色改用規則要的徽章字色，字色會稍微變。', handling: '保留：照全站字色規則，測試清單同步。' },
  { card: 'R2-B1', said: '2:1 的用途只查到 X 大圖連結卡，附的是舊版文件網址。', handling: '已查：X 開發者文件 summary_large_image 寫 2:1（最小 300×157），沿用；AI 背景用 16:9 再裁。' },
  { card: 'R2-B1', said: '本機驗收沒登入、文案 API 用假資料，AI 一鍵設計沒實測。', handling: 'R2-C 實打一次 AI 一鍵設計；部署後正式站再看一次。' },
  { card: 'R2-B1', said: '客戶搜尋的「品牌色」查詢參數在橫幅這邊沒人用了。', handling: '查過只剩這條死路徑：R2-B2 一併刪掉（選單的篩選參數與 API 的查詢參數），回應欄位保留。' },
  { card: 'R2-B1', said: '步驟摘要的測試標記跟著新編號變了。', handling: '保留：查過沒有測試引用。' },

];

// 有預設、沒答就照做（PLAN-R2 §4 代決）
export const DECIDE = [
  { q: 'AI 一鍵設計的多版本是什麼？', def: '同一個設計附五組文案可換，一次呼叫（你更正過）。', blocks: 'R2-C' },
  { q: '清除設計保留什麼？', def: '保留客戶與已選尺寸，其餘全清；按復原可找回。', blocks: 'R2-B1' },
  { q: '「文案類型」是什麼？', def: '視為「文案模型」。', blocks: 'R2-B1' },
  { q: '2:1 用在哪些平台？', def: '工人查官方文件後寫，註解附網址。', blocks: 'R2-B1' },
];

export const COPY = {
  sub: '你的十點回饋，共 {total} 張卡，分兩批做；每批交回後先處理風險再上線。',
  updated: '更新於 {date}',
  nav: { now: '現況', open: '等你決定', b1: '第一批', b2: '第二批', risks: '風險' },
  now: { h: '現況', lead: '做到哪。' },
  steps: { h: '卡片', count: '{done}／{total} 完成' },
  open: { h: '等你決定', lead: '要你點頭才往下的事。', none: '目前沒有要你點頭的事。', count: '{n} 項' },
  risks: { h: '風險', lead: '工人交回時回報的風險，以及怎麼處理。', none: '還沒有工人交回。' },
  label: {
    todo: '未開始', doing: '進行中', review: '待驗收', done: '完成', risk: '風險',
    High: '高', Medium: '中', Low: '低',
    seen: '做完你會看到', accept: '怎麼驗收', rollback: '要退回時', details: '細節',
    after: '要先完成', model: '模型', none: '沒有', commit: '完成於', go: '可以嗎',
    decideLead: '我先代決的（不同意直接說）', blocks: '影響',
  },
};

const C = (id, risk, model, after, plain) => ({ id, risk, model, after, plain });

export const BATCHES = [
  { code: 'b1', no: '第一批', title: '排版引擎與介面流程（兩個工人同時做）',
    seen: '工具順序變成：開始、風格、尺寸、畫面、AI 文案與設計、版型模板、文字、行銷元素、匯出。預設 4:5、多了 2:1；文案卡會換行；多尺寸縮圖塞得進一個畫面；滾輪不再縮放背景（按住 Ctrl 才縮放）；有「清除設計」。排版引擎先做好，按鈕接上在第二批。',
    accept: '型別檢查與橫幅測試全綠（含重疊測試：所有尺寸下元素不互撞）；本機瀏覽器照你的四張截圖情境重跑並截圖；Codex 審過。',
    rollback: '每張卡一個 commit，單獨還原。',
    cards: [
      C('R2-A', 'Medium', 'Opus 5.5', '', '排版引擎：元素互不重疊、字的大小依尺寸自動算、倒影跟著商品、底襯和描邊一定看得到、AI 只決定放哪一區。'),
      C('R2-B1', 'Medium', 'Opus 5.5', '', '介面：拆檔、照你的順序重排九步、預設 4:5 加 2:1、文案卡換行、縮圖塞進畫面、Ctrl 才縮放、清除設計。'),
    ] },
  { code: 'b2', no: '第二批', title: '按鈕接上引擎、AI 文案多版本與 logo',
    seen: 'AI 一鍵設計後，所有位置按鈕都有效；設計附五組文案，點哪組換哪組；有品牌套組時 logo 和字體一起進設計且不壓到其他元素。',
    accept: '型別檢查與測試全綠；本機實按一次 AI 一鍵設計（約 NT$1.6）：五張文案卡可換、logo 出現、位置按鈕都會動、對比沒有未達標。',
    rollback: '每張卡一個 commit，單獨還原。',
    cards: [
      C('R2-B2', 'Medium', 'Opus 5.5', 'R2-A、R2-B1', '把位置按鈕、模板、字級滑桿接上引擎：按了就一定有效，手拖的位置被按鈕取代。'),
      C('R2-C', 'Medium', 'Opus 5.5', 'R2-A、R2-B1', 'AI 一鍵設計附五組文案可換；品牌 logo 與字體一起進設計；對比檢查改量真實文字位置。'),
    ] },
];

const STAGE_TO_STATUS = { todo: 'not_started', doing: 'in_progress', review: 'in_progress', done: 'done' };
export const STEPS = BATCHES.flatMap((b) => b.cards.map((c) => ({ ...c, batch: b.code })))
  .map((c, i) => {
    const stage = PROGRESS[c.id] || 'todo';
    const b = BATCHES.find((x) => x.code === c.batch);
    return {
      n: i + 1, code: c.id, batch: c.batch, title: c.id, plain: c.plain, gate: b.accept,
      risk: c.risk, model: c.model, after: c.after, stage,
      status: STAGE_TO_STATUS[stage], depends: [], commit: COMMITS[c.id],
    };
  });

export const OPEN = [];
export const NOW = [];
