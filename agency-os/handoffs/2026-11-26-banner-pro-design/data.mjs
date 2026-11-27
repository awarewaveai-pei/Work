// 橫幅 R2 監工台 -- 唯一資料來源。進度只改 PROGRESS／COMMITS／RISKS／GO；卡的內容正本在 PLAN-R2.md §5，狀態表在 §7（check.mjs 比對卡號）。
// 改完：node build.mjs → node check.mjs → 重新發布同一個網址。

export const META = {
  title: '橫幅工具第二輪監工台',
  updated: '2026-11-27',
  plan: 'agency-os/handoffs/2026-11-26-banner-pro-design/PLAN-R2.md',
  plan3: 'agency-os/handoffs/2026-11-26-banner-pro-design/PLAN-R3.md',
  plan4: 'agency-os/handoffs/2026-11-26-banner-pro-design/PLAN-R4.md',
};

// todo｜doing｜review｜done（done 要在 COMMITS 填 commit）
export const PROGRESS = { 'R2-A': 'done', 'R2-B1': 'done', 'R2-B2': 'done', 'R2-C': 'done', 'R3-A': 'done', 'R3-B': 'done', 'R3-C': 'done', 'R3-D': 'done', 'R4-A': 'doing', 'R4-B': 'doing', 'R4-C': 'todo' };
export const COMMITS = { 'R2-A': 'ef6572105', 'R2-B1': '528cb59d5', 'R2-B2': '06c46341e', 'R2-C': 'e2d125cd9', 'R3-A': 'ccaa2d151', 'R3-B': '4e97d619a', 'R3-C': '6496abefc', 'R3-D': 'd137012fa' };

// 等你決定：要提前手動部署或高風險時才放這裡。{ card, what, rollback }
export const GO = [];

// 工人交回的 RISKS 與處置 { card, said, handling }。一批全部交回後一起看，處理完才部署。
export const RISKS = [
  { card: 'R2-A', said: 'AI 每個尺寸會回徽章角與 logo 角，但這兩個欄位還不算「各尺寸自己的設定」，會漏到主設計。', handling: '已修（R2-B2 06c46341e）：徽章角、logo 角、自動字級都算各尺寸設定。部署暫停檔擋到第二批完成。' },
  { card: 'R2-A', said: 'AI 一鍵設計套用版面時，沒有經過「按鈕清掉拖曳位置」的同一條路。', handling: '已修：AI 套用版面經同一條路，重複的一份已刪（7ad07afed）。' },
  { card: 'R2-A', said: '關掉自動字級、字又放不下時，仍可能重疊或超出畫面；logo 拉到最大的長條 logo 也會超出。', handling: '保留：那是你手動指定的大小。新設計預設開自動字級（R2-B2）。' },
  { card: 'R2-A', said: '寬尺寸與商品放側邊時，文字位置和以前不同（邊距與文字欄重算）。', handling: '保留：這是本輪要的改法（文字讓開商品）。' },
  { card: 'R2-A', said: '按位置按鈕只清「正在編輯的尺寸」的拖曳位置。', handling: '確認照這樣：每個尺寸的拖曳各自獨立。' },
  { card: 'R2-A', said: 'Codex：直式 logo（例如高是寬的四倍）在 3:1 會超出畫面大半。', handling: '已修 c278c1b58：logo 高度上限為畫高的四分之一，重疊測試含直式 logo。' },
  { card: 'R2-B1', said: 'Codex：剛打完字就按清除，復原找不回（歷史半秒後才寫入）。', handling: '已修 c8bb7b463：清除前先寫入歷史，有測試。' },
  { card: 'R2-B1', said: 'Codex：只剩生成的文案清單時，清除鈕是灰的，清單清不掉。', handling: '已修 c8bb7b463。' },
  { card: 'R2-A', said: '數值範圍表目前只給排版引擎用，滑桿還沒接。', handling: '已接（R2-B2）；logo 大小滑桿在 R2-C 收尾接上。' },
  { card: 'R2-A', said: '重疊測試的尺寸清單寫在測試檔裡，新加的 2:1 不會自動進測試。', handling: '已改（R2-B2）：2:1 自動進重疊測試。' },
  { card: 'R2-B1', said: '改了交辦外的字色測試：拆檔後六處紅綠字色改用規則要的徽章字色，字色會稍微變。', handling: '保留：照全站字色規則，測試清單同步。' },
  { card: 'R2-B1', said: '2:1 的用途只查到 X 大圖連結卡，附的是舊版文件網址。', handling: '已查：X 開發者文件 summary_large_image 寫 2:1（最小 300×157），沿用；AI 背景用 16:9 再裁。' },
  { card: 'R2-B1', said: '本機驗收沒登入、文案 API 用假資料，AI 一鍵設計沒實測。', handling: 'R2-C 實打一次 AI 一鍵設計；部署後正式站再看一次。' },
  { card: 'R2-B1', said: '客戶搜尋的「品牌色」查詢參數在橫幅這邊沒人用了。', handling: '已刪（R2-B2）：選單篩選與 API 查詢參數；回應欄位保留。' },
  { card: 'R2-B1', said: '步驟摘要的測試標記跟著新編號變了。', handling: '保留：查過沒有測試引用。' },

  { card: 'R2-B2', said: '多改了排版畫圖檔兩行，回傳畫出的字級給滑桿顯示。', handling: '保留：自動字級時滑桿要顯示真正畫出的字級，只有這裡知道。' },
  { card: 'R2-B2', said: '在主尺寸手動調字級，其他尺寸也會變成固定字級。', handling: '保留：和以前一樣；各尺寸可各自按「自動字級」改回。' },
  { card: 'R2-B2', said: '套用一般模板會把自動字級設回開啟。', handling: '保留：模板本來就重設版面設定；片頭模板維持指定字級。' },
  { card: 'R2-B2', said: '商品陰影、倒影滑桿不在數值範圍表。', handling: '保留：AI 不會設定它們，滑桿範圍就是唯一來源，不會不一致。' },
  { card: 'R2-C', said: '暫時用了一個交集型別補兩個欄位。', handling: '已刪（7ad07afed）。' },
  { card: 'R2-C', said: '單一尺寸時現在會採用 AI 給的 logo 角與商品位置。', handling: '保留：這是本輪要的（AI 決定意圖、程式算位置）。' },
  { card: 'R2-C', said: '圖片背景的主色只用亮度判斷是否在文字框下，沒有逐像素顏色量測。', handling: '保留：亮度範圍本身就是在真實文字框量的，已比以前的上中下估計準。' },
  { card: 'R2-C', said: '換文案組不重跑對比檢查；字長不同時文字框會稍微移動。', handling: '已修（aacd0f002、e5a39cf5a）：換文案卡會用新字的文字框重跑對比檢查。' },
  { card: 'R2-C', said: '本機沒有記帳，按鈕價沒跟實際帳單比對；客戶套組與 logo 是模擬的。', handling: '部署後在正式站用真客戶實按一次並對帳。' },
  { card: 'R2-C', said: 'Codex：換文案卡與 AI 回答期間換背景，對比檢查用的是舊的量測。', handling: '已修 e5a39cf5a：檢查結果只套用到它量的那份設計，最新一次為準；檢查失敗就不套用。' },
  { card: 'R2-C', said: '瀏覽器沒在最後版本重測。', handling: '已部署 e3ec3c494；正式站要你登入後看一眼（監工不能代輸密碼）。' },
  { card: 'R3-A', said: '9:16 出界的根因：避頭尾讓放不下的全形逗號掛在行尾外面，置中後整行超出畫布。', handling: '已修 0ddfaf3d3：標點連同前一個字一起換行；量測＝繪製；手動字級放不下會縮到放得下。真實字型實測 0 筆超出。' },
  { card: 'R3-A', said: '手動字級被縮小時，文字步驟的滑桿仍顯示設定值。', handling: '已修 9c83527c2：顯示實際畫出的字級並註明「已縮」。' },
  { card: 'R3-A', said: 'Logo 自動／手動還沒正式進設計欄位，也不是各尺寸設定。', handling: '已修 9c83527c2。' },
  { card: 'R3-A', said: '自動模式下 Logo 滑桿固定顯示 10%，沒反映被主標上限縮小後的值。', handling: '已修 9c83527c2。' },
  { card: 'R3-A', said: 'Logo 大小改以短邊計；舊設計的舊數值不再被讀到，一律走自動。', handling: '保留：本輪要的規則；沒有存檔的設計資料，不影響已輸出的圖。' },
  { card: 'R3-A', said: '很寬的 Logo 寬度上限為畫寬四成；Logo 離邊距取邊距與淨空的較大值，位置與舊版略不同。', handling: '保留：淨空規範要求。' },
  { card: 'R3-B', said: '頂部「橫幅」列是這頁自己放的，不是全站元件。', handling: '已刪 81200595c，不影響其他頁。' },
  { card: 'R3-B', said: '只用畫面數值驗證，沒存截圖；1280×720 與 9:16、3:1 切換沒實測。', handling: '已補：R3-B 修正時以畫面數值實測 1280×720 與比例切換。' },
  { card: 'R3-B', said: '捲到頁面最底時，左欄會被頁面下方內距往上推一小段。', handling: '保留：只在捲到底的最後一小段發生，改它要動全站頁面外框。' },
  { card: 'R3-C', said: '最重要：商品烤進場景後，排版不再預留商品區，文字會壓到商品。', handling: '已修 9c83527c2（合併 e8697fc50）：只要有商品就預留商品區，生成指令與排版用同一個函式算；有突變測試。' },
  { card: 'R3-C', said: '含商品候選與「選定後各尺寸各生一張」沒在瀏覽器實打。', handling: '監工合併後本機實打一次（先印總價），再部署。' },
  { card: 'R3-C', said: '畫面步驟選的模型不會合成商品時，一鍵設計自動改用 Nano Banana 2（每張約 NT$1.8），按鈕依實際模型算價。', handling: '保留：合成需要會放商品的模型；價格照實顯示。' },
  { card: 'R3-C', said: '某尺寸圖還在生成或失敗時，那個尺寸暫用主尺寸的圖裁切，商品可能被裁到。', handling: '保留：失敗那行會顯示錯誤與已計費金額，可重按該尺寸；成功後自動換成自己的圖。' },
  { card: 'R3-C', said: '第一版付費實測約 NT$9.5（設計＋三張場景＋三個尺寸合成，都成功）。', handling: '已記錄。' },
  { card: 'R3-A', said: 'Codex：手動字級的縮小判定沒看價格、按鈕、信任列寬度，價格可能畫出畫布。', handling: '已修 e46225141：手動與自動用同一個判斷（含價格、按鈕、信任列）。' },
  { card: 'R3-A', said: 'Codex：字級縮到最小仍放不下的長網址會被裁掉。', handling: '已修 e46225141：長字在字元間斷行。' },
  { card: 'R3-B', said: 'Codex：視窗剛好 960 寬時內容區不夠兩欄，操作面板被擠到畫面下方。', handling: '已修 f771d78ac：量頁面容器實際寬度；1280×720 實測、9:16 與 3:1 切換預覽卡高度不變。' },
  { card: 'R3-C', said: 'Codex：沒有商品時生的場景，後來上傳商品再選，會把商品藏起來。', handling: '已修 f0c02e307。' },
  { card: 'R3-C', said: 'Codex：快速連選兩張場景，較早那張的其他尺寸可能蓋掉後選的。', handling: '已修 f0c02e307：選場景與其他尺寸生成共用同一組序號。' },
  { card: 'R3-C', said: 'Codex：主尺寸對比檢查失敗沒套用時，仍會付費生成其他尺寸。', handling: '已修 f0c02e307。' },
  { card: 'R3-C', said: 'Codex：上傳背景＋商品圖按一鍵設計，商品是疊加的卻沒開陰影倒影。', handling: '已修 f0c02e307。' },
  { card: 'R3-D', said: '介面新字樣（已縮、自動比例）只過型別檢查，沒在頁面看過；手動模式被縮時滑塊往上拖會跳回實際值。', handling: '監工部署前在本機實看；跳回是因為顯示的是實際畫出值，保留。' },
  { card: 'R3-D', said: '商品烤進背景後，舊的商品拖曳位置仍決定預留區，但預覽上拖不動。', handling: '保留：背景裡的商品本來就移不動；換位置用商品位置按鈕重生。' },
  { card: 'R3-D', said: 'AI 生成的商品不一定正好落在要求的區域。', handling: '保留：排版預留的是要求的區域；部署前本機實打一次看落點。' },
  { card: 'R3-D', said: 'Codex：拖動或縮放含商品的背景後，保留的商品區沒跟著移。', handling: '已修 R3-E（d137012fa）。' },
  { card: 'R3-D', said: 'Codex：某尺寸生成失敗、沿用主尺寸的圖時，保留區對不上圖裡的商品。', handling: '已修 R3-E（d137012fa）。' },
  { card: 'R3-D', said: 'Codex：畫布編輯傳回新背景、重新合成時失敗尺寸、移除商品圖，三種情況商品區會錯。', handling: 'R4-A 修：背景圖、含商品、商品區三者只經一個函式一起換。' },
  { card: 'R4-A', said: 'T1 實測：AI 有照做商品左右位置，沒照做大小；橫式商品畫成要求的兩倍高，每一張的商品頂端都衝進文字區、副標壓到滴管。', handling: 'R4-A／R4-B：字級設上下限、文字只用上三分之一、橫式只靠左右分區並把商品高度要求改成實測值。' },
];

// 有預設、沒答就照做（PLAN-R2 §4 代決）
export const DECIDE = [
  { q: 'AI 一鍵設計的多版本是什麼？', def: '同一個設計附五組文案可換，一次呼叫（你更正過）。', blocks: 'R2-C' },
  { q: '清除設計保留什麼？', def: '保留客戶與已選尺寸，其餘全清；按復原可找回。', blocks: 'R2-B1' },
  { q: '「文案類型」是什麼？', def: '視為「文案模型」。', blocks: 'R2-B1' },
  { q: '2:1 用在哪些平台？', def: '工人查官方文件後寫，註解附網址。', blocks: 'R2-B1' },
];

export const COPY = {
  sub: '你的十點回饋與第三輪修改清單，共 {total} 張卡；每批交回後先處理風險再上線。',
  updated: '更新於 {date}',
  nav: { now: '現況', open: '等你決定', b1: '第一批', b2: '第二批', b3: '第三輪', b4: '第四輪', risks: '風險' },
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
  { code: 'b3', no: '第三輪', title: '預覽欄、文字不出畫布、Logo 規範、AI 場景與合成適配（三個工人同時做）',
    seen: '頂部「橫幅」列不見了；左邊預覽從標題列開始固定，高度不變，縮圖列填滿畫面；9:16 字不會跑出畫布；Logo 依短邊與主標自動配大小並留白；AI 一鍵設計會直接生出場景縮圖讓你挑，商品帶陰影倒影；「AI 合成進場景」每個尺寸各生一張、商品完整在畫面內。',
    accept: '型別檢查與測試全綠；本機截圖對照你的三張圖；AI 場景與合成實打一次並先印總價；Codex 審過。',
    rollback: '每張卡一個 commit，單獨還原。',
    cards: [
      C('R3-A', 'Medium', 'Opus 5.5', '', '排版引擎：文字一定留在畫布內（手動字級也一樣）；Logo 依短邊與主標自動配大小、四周留白、手動調整優先。'),
      C('R3-B', 'Low', 'Sonnet 5.5', '', '版面：拿掉頂部「橫幅」列；預覽欄固定在畫面上、高度不變；尺寸縮圖列填滿剩下的高度。'),
      C('R3-C', 'Medium', 'Opus 5.5', '', 'AI：一鍵設計直接生場景讓你挑、商品擬真預設開；「AI 合成進場景」每個已選尺寸各依比例生成，商品不被字遮住。'),
      C('R3-D', 'Medium', 'Opus 5.5', 'R3-A、R3-B、R3-C', '收尾：商品烤進場景時文字照樣讓開商品；Logo 自動／手動記在各尺寸；滑桿顯示實際畫出的大小。'),
    ] },
  { code: 'b4', no: '第四輪', title: '依實測定字級與構圖（T1：11 個尺寸實打一次）',
    seen: '每個尺寸的標題大小有上下限（依實際顯示大小算，不再頂到畫面寬）；版面分三群：手機直式、卡片橫式、網頁；16:9 分成「網站 Hero」與「社群／縮圖」；AI 合成依實測調整，商品不再頂到文字。',
    accept: '同一組素材再實打一次（約 NT$20）：每一張的商品與文字都不重疊、標題都在範圍內、縮到四分之一仍讀得到標題。',
    rollback: '每張卡一個 commit，單獨還原。',
    cards: [
      C('R4-A', 'Medium', 'Opus 5.5', '', '排版：標題大小上下限、構圖三群、16:9 拆兩個；背景圖與商品位置一起換（R3-E 的三條）。'),
      C('R4-B', 'Low', 'Sonnet 5.5', '', '合成指令：橫式商品在右欄、高度約一半；先查 AI 能不能直接出 21:9 給 3:1 用。'),
      C('R4-C', 'Low', 'Sonnet 5.5', 'R4-A、R4-B', '驗收：同素材再實打一次並量測。'),
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
