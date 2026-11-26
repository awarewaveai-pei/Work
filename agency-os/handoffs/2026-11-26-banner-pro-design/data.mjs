// 橫幅 R2 監工台 -- 唯一資料來源。進度只改 PROGRESS／COMMITS／RISKS／GO；卡的內容正本在 PLAN-R2.md §5，狀態表在 §7（check.mjs 比對卡號）。
// 改完：node build.mjs → node check.mjs → 重新發布同一個網址。

export const META = {
  title: '橫幅工具第二輪監工台',
  updated: '2026-11-26',
  plan: 'agency-os/handoffs/2026-11-26-banner-pro-design/PLAN-R2.md',
};

// todo｜doing｜review｜done（done 要在 COMMITS 填 commit）
export const PROGRESS = { 'R2-A': 'doing', 'R2-B1': 'doing' };
export const COMMITS = {};

// 等你決定：要提前手動部署或高風險時才放這裡。{ card, what, rollback }
export const GO = [];

// 工人交回的 RISKS 與處置 { card, said, handling }。一批全部交回後一起看，處理完才部署。
export const RISKS = [];

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
