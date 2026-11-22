// 平台「會員、目前客戶、登入後介面」監工台 -- 唯一的資料來源。
// 更新進度只改下面兩個物件：PROGRESS（卡的階段）、COMMITS（完成的卡的 commit）。其餘欄位是 DISPATCH.md 的複本，check.mjs 會逐卡比對。
// 改完：node build.mjs → node check.mjs → 監工重新發布同一個網址。
// 卡片與批次的正本：DISPATCH.md §1（62 張卡）、§4（批次）、§8（操作者決定）。

export const META = {
  title: '平台會員與登入後介面監工台',
  updated: '2026-11-22',
  dispatch: 'agency-os/handoffs/2026-11-22-platform-membership-ux/DISPATCH.md',
  readme: 'agency-os/handoffs/2026-11-22-platform-membership-ux/README.md',
  self: 'agency-os/handoffs/2026-11-22-platform-membership-ux/',
};

// 卡的階段：todo 未開始｜doing 進行中｜review 待驗收｜done 完成（已併 main；要同時在 COMMITS 填 commit）。沒寫＝todo。
export const PROGRESS = {
  K1: 'done',
  K2: 'done',
  K3: 'done',
  U6: 'done',
};
export const COMMITS = {
  K1: 'd2201ecf7',
  K2: 'd09da8a7d',
  K3: 'c3c0c2624',
  U6: '677f550fb',
};

// 等你決定：高風險卡驗收過、要推上線前停在這裡。{ card, what: 白話風險, rollback: 怎麼退回 }。卡併入後刪掉該列。
export const GO = [];

// 風險：工人交回的 RISKS 與處置。{ card, said: 工人回報的, handling: 怎麼處理的 }。
export const RISKS = [
  { card: 'K2', said: '網址上的客戶或網站代號格式不對時，也會被當成「要改寫網址」；交辦單只寫了舊參數名要轉換。', handling: '保留：格式不對的代號本來就該從網址拿掉。第二批 K4 接線時照這個行為寫測試。' },
  { card: 'K2', said: '客戶帳號進到需要網站的頁面、網站清單還沒載入時，回「載入中」；交辦單沒寫這一支。', handling: '保留：沒有這一支就會先閃一下「沒有網站」。' },
  { card: 'K1', said: '決策文件索引裡，會員模型那一列少了日期欄。', handling: '已補上日期。' },
  { card: 'U6', said: '「點數不足」提示：新函式回有句號的版本，舊的滑鼠提示沒有句號。', handling: '保留：滑鼠提示維持原樣（去掉句號），畫面文字不變。' },
  { card: 'U6', said: '多加一個選填欄位，用來隱藏只給員工看的經銷功能；另多回一行員工才看得到的小字。', handling: '保留：都是選填，現有畫面不受影響。' },
  { card: 'U6', said: '權益來源（方案內／贈送／扣點）要到第四批 U5 才有資料，現在可用時不貼標籤。', handling: '照計畫：U5 做完才會出現標籤，在那之前不猜。' },
];

// 已有預設、沒答就照做的題目（DISPATCH §8）。
export const DECIDE = [
  { q: '客戶欄上方的「類別」用什麼分', blocks: 'U3（第五批）', def: '沒答就照建議：依合作方式與需處理分，測試客戶預設隱藏。' },
];

export const COPY = {
  sub: '會員、目前客戶、登入後介面三塊工作，共 {total} 張卡，分十一批做；之後還有兩個階段。',
  updated: '更新於 {date}',
  nav: {
    now: '現況', open: '等你決定',
    b1: '第一批', b2: '第二批', b3: '第三批', b4: '第四批', b5: '第五批', b6: '第六批',
    b7: '第七批', b8: '第八批', b9: '第九批', b10: '第十批', b11: '第十一批',
    p2: '第二階段', p3: '第三階段', risks: '風險',
  },
  now: { h: '現況', lead: '整個專案走到哪。' },
  steps: { h: '卡片', count: '{done}／{total} 完成' },
  open: { h: '等你決定', lead: '高風險的卡驗收過後，推上線前會停在這裡等你說可以。', none: '目前沒有要你點頭的卡。', count: '{n} 項', before: '{code} 上線前', src: '出處' },
  risks: { h: '風險', lead: '工人交回時回報的風險，以及怎麼處理。', none: '目前沒有回報的風險。' },
  label: {
    todo: '未開始', doing: '進行中', review: '待驗收', done: '完成', risk: '風險',
    High: '高', Medium: '中', Low: '低',
    seen: '上線後你會看到', accept: '怎麼驗收', rollback: '要退回時', details: '細節',
    after: '要先完成', model: '建議模型', none: '沒有', commit: '完成於', go: '可以併入正式版嗎',
    decideLead: '有預設、沒答就照做', blocks: '擋住',
  },
};

// [卡號, 風險, 模型, 要先完成, 白話]。順序＝DISPATCH §1 的順序（check.mjs 比對）。
const C = (id, risk, model, after, plain) => ({ id, risk, model, after, plain });

export const BATCHES = [
  { code: 'b1', no: '第一批', title: '打底：文件與小函式', phase: 'P1',
    seen: '沒有畫面變化。新增的是文件、小函式，兩個既有功能可以指定客戶；灰掉按鈕的提示字改由同一個函式給，字不變。',
    accept: '各卡交回的測試指令重跑；員工身分呼叫客戶搜尋，回應的樣子與改前相同。',
    rollback: '各卡單獨還原。',
    cards: [
      C('K1', 'Low', 'Sonnet', '', '把「目前客戶」的規則寫成正式決策文件（編號 020）。'),
      C('K2', 'Low', 'Sonnet', '', '做一個小函式，決定「現在是哪個客戶、哪個網站」。'),
      C('K3', 'Medium', 'Sonnet', '', '客戶搜尋和網站清單兩個功能，可以指定要看哪個客戶。'),
      C('U6', 'Low', 'Sonnet', '', '「方案內／贈送／扣點／未開通」這些標籤，只由一個函式決定。'),
    ] },
  { code: 'b2', no: '第二批', title: '客戶欄、點數讀取、測試客戶標記', phase: 'P1',
    seen: '沒有畫面變化。客戶欄還沒放到任何頁面；新的點數讀取功能還沒有頁面使用；產品登記表多了欄位。併入後，兩個測試用客戶在資料庫標為「測試」。',
    accept: '客戶欄的畫面測試；會員讀點數時只看得到自己的單位；產品登記表測試；資料庫查到恰好兩個測試客戶。',
    rollback: '各卡還原。測試客戶標記要跑反向腳本（高風險，要你點頭）。',
    cards: [
      C('K4', 'Medium', 'Opus', 'K2、K3', '做好左邊的客戶欄（搜尋加清單），先不放到任何頁面。'),
      C('U7', 'Medium', 'Sonnet', '', '做出會員查看自己點數與合約的功能（只讀）。'),
      C('U22', 'Medium', 'Sonnet', '', '產品登記表多加分類、任務、一句話介紹等欄位。'),
      C('M1', 'High', 'Opus', '', '把測試用的客戶在資料庫標成「測試」。'),
    ] },
  { code: 'b3', no: '第三批', title: '同一個外框與左欄', phase: 'P1',
    seen: 'app 與各產品子網域的左欄換成同一個元件，外觀不變。選單連結會帶著網址上的客戶。',
    accept: '開 app 的工具頁並帶客戶，點選單後網址仍帶著客戶；員工開內容子網域，左欄與改前截圖相同；員工搜尋客戶與外掛摘要各有測試（外掛仍停用，正式站不受影響）。',
    rollback: '單卡還原。',
    cards: [
      C('K5', 'Medium', 'Opus', 'K4', 'app 與各產品網站換成同一個外框與左欄。'),
      C('U4', 'High', 'Opus', 'K3', '員工在產品子網域也能搜尋客戶。'),
      C('U21', 'Low', 'Sonnet', 'U6', '做工具卡片元件（三種大小）。'),
      C('W1', 'High', 'Opus', 'U6、U7', 'app 提供 WordPress「我的帳號」要畫的產品摘要。'),
    ] },
  { code: 'b4', no: '第四批', title: '內容頁改用客戶欄', phase: 'P1',
    seen: '寫文章、題目、五步驟、網站四頁的左側出現客戶欄。頁內挑網站的下拉選單與「題目›客戶」頁消失。員工沒選客戶時，頁面會請他先選。',
    accept: '員工開內容頁，客戶欄可搜尋，選了之後網址帶出客戶與網站；舊連結自動改成新網址；客戶帳號在內容子網域看不到客戶清單。',
    rollback: '單卡還原；刪掉「題目›客戶」頁的那張還原後，選單項會回來。',
    cards: [
      C('U5', 'High', 'Opus', 'K4、U6', '員工替客戶操作時，按鈕顯示的是那個客戶的開通狀態。'),
      C('K7', 'Medium', 'Opus', 'K3、K5', '寫文章頁改用客戶欄挑網站，拿掉兩個下拉選單。'),
      C('K8', 'Medium', 'Opus', 'K3、K5', '題目與五步驟頁改用客戶欄，刪掉「題目›客戶」頁。'),
      C('K9', 'Medium', 'Sonnet', 'K3、K5', '網站頁只列目前客戶的網站。'),
    ] },
  { code: 'b5', no: '第五批', title: '客戶頁與影片工作台帶著客戶', phase: 'P1',
    seen: '客戶頁每個網站都能改。客戶首頁列出有問題的客戶。從 app 開影片工作台會帶著客戶。客戶欄上方出現類別按鈕。',
    accept: '員工不指定網站就呼叫分類功能，會得到「找不到」；多網站客戶的頁面每個網站一塊；從 app 開影片工作台，網址帶著客戶。',
    rollback: '單卡還原；「不再拿第一個網站」那張還原就是恢復舊行為。',
    cards: [
      C('K6', 'High', 'Opus', 'K7', '伺服器不再「沒指定網站就拿第一個」。'),
      C('K10', 'Medium', 'Sonnet', 'K2、K7', '客戶頁每個網站都能改；客戶首頁列出有問題的客戶。'),
      C('K11', 'Medium', 'Opus', 'K3、K5、U4', '從 app 開影片工作台時帶著目前客戶。'),
      C('U3', 'Medium', 'Opus', 'K4、U4；類別怎麼分要你回答（沒答就照建議）', '客戶欄上方加類別按鈕。'),
    ] },
  { code: 'b6', no: '第六批', title: '會員的「我的工作台」', phase: 'P1',
    seen: '影片工作台遇到別的客戶會跳確認窗。會員登入後第一頁是「我的工作台」（已開通的在上、點數與合約在右）。「尚未開通」頁多一顆「了解這個產品」。新增「點數與合約」頁。',
    accept: '在影片工作台帶不同客戶開，會跳確認窗，取消就不切換；用客戶測試帳號登入，看工作台的三種狀態（載入中、失敗後重新整理、空的）。',
    rollback: '影片工作台那張還原後要重新部署；其餘單卡還原。',
    cards: [
      C('K12', 'High', 'Opus', 'K11', '影片工作台收到別的客戶時，先跳確認窗再切換。'),
      C('U8', 'Medium', 'Sonnet', 'U6、U7、U21', '會員登入後的第一頁改成「我的工作台」。'),
      C('U9', 'Low', 'Sonnet', 'K5', '「尚未開通」頁多一顆「了解這個產品」。'),
      C('U10', 'Medium', 'Sonnet', 'U7', '做會員的「點數與合約」頁。'),
    ] },
  { code: 'b7', no: '第七批', title: '頁名一致、代操記法', phase: 'P1',
    seen: '部分頁面標題改成與左欄同名。員工在客戶頁的「帳務」可以標「AwareWave 代操」。',
    accept: '頁名檢查器通過；代操切換後重新讀取一致；每個產品入口在本機測試都能進門。',
    rollback: '單卡還原；代操記法那張要跑反向腳本（高風險，要你點頭）。',
    cards: [
      C('U12', 'Low', 'Sonnet', 'K7、K8', '做檢查器：頁面名稱、左欄名稱、標題三者要一樣。'),
      C('U23', 'Low', 'Sonnet', '', '補上基本的使用紀錄（挑客戶、被擋、登入成功）。'),
      C('M2', 'High', 'Opus', 'M1', '合約可以記「AwareWave 代操」。'),
      C('M11', 'High', 'Opus', 'W1、K8、U22', 'aware-wave.com 進門時，照各產品登記的登入來源清單。'),
    ] },
  { code: 'b8', no: '第八批', title: '內容入口改版', phase: 'P1',
    seen: '內容入口改版：左欄是「寫文章／改寫／草稿／題目／我的網站／節日行事曆」，第一屏只有關鍵字、標題與生成。「功能」清單消失。按鈕顏色略深。',
    accept: '手機寬開內容頁，第一屏看得到「生成」；左欄名稱、頁面標題、分頁標題一致；外掛單元測試通過（外掛仍停用）；類別按鈕多了「代操／經銷」；五組顏色對比都達標。',
    rollback: '單卡還原；改顏色那張要先確認資料庫裡的主題沒有蓋掉舊值。',
    cards: [
      C('U11', 'Medium', 'Opus', 'K5、K7、K8、U12、M11', '內容入口重排：拆頁、改名、刪功能清單、下拉改按鈕。'),
      C('W2', 'Medium', 'Sonnet', 'W1', 'WordPress 外掛的「我的帳號」改畫 app 給的摘要。'),
      C('M3', 'Medium', 'Sonnet', 'M1、M2、U3', '由合約自動算出「產品／方式」標籤與測試標記。'),
      C('U13', 'Low', 'Sonnet', '要先和主題 session 協調', '修正五組對比不足的顏色。'),
    ] },
  { code: 'b9', no: '第九批', title: '手機底列、代辦（app 端）', phase: 'P1',
    seen: '手機出現底列。員工在客戶頁的「帳號」可以對既有客戶發起代辦（外掛端還沒做，只會留下待驗證的邀請）。',
    accept: '手機寬底列有四個入口、每個都夠大；本機走一遍的腳本跑完；故意弄壞客戶來源檢查器會變紅、還原後變綠；代辦的測試通過。',
    rollback: '單卡還原；代辦那張要跑反向腳本（高風險，要你點頭）。',
    cards: [
      C('U14', 'Low', 'Sonnet', 'U9、U13；要先和主題 session 協調', '做手機底列。'),
      C('W5', 'Low', 'Sonnet', 'W1、W2', '把「本機 WordPress＋app 走一遍」寫成可重跑的腳本。'),
      C('K13', 'Low', 'Sonnet', 'K7 到 K11', '做檢查器：頁面不得自己藏一份客戶來源。'),
      C('M5', 'High', 'Opus', 'M1、K10', '員工替既有客戶代辦會員（app 端）。'),
    ] },
  { code: 'b10', no: '第十批', title: '轉移會員、外掛端代辦', phase: 'P1',
    seen: '員工可以轉移會員。外掛端的代辦做好（外掛仍停用，正式站沒有變化）。',
    accept: '新增產品入口的驗收測試六項通過；外掛測試加本機腳本含代辦；轉移會員的測試通過。',
    rollback: '單卡還原；轉移會員那張要跑反向腳本（高風險，要你點頭）。',
    cards: [
      C('K14', 'Low', 'Sonnet', 'K5、K13', '做驗收測試：新增產品入口不用手改就接上。'),
      C('M6', 'High', 'Opus', 'W2、M5', '代辦的外掛端：會員驗證 email 後才連上。'),
      C('M8', 'High', 'Opus', 'M5', '員工可以轉移會員（換單位管理者）。'),
    ] },
  { code: 'b11', no: '第十一批', title: '期末驗收', phase: 'P1',
    seen: '沒有新畫面。第一階段期末驗收。',
    accept: '期末檢查清單全過；本機刪掉會員後，進門回「不是會員」。',
    rollback: '單卡還原。',
    cards: [
      C('K15', 'Low', 'Opus', '全部 K 卡', '目前客戶功能的期末檢查與第一階段驗收。'),
      C('M10', 'High', 'Opus', 'M5、M6', 'WordPress 刪會員或改 email 時，app 跟著知道。'),
    ] },
  { code: 'p2', no: '第二階段', title: '開放註冊前', phase: 'P2',
    seen: '第一階段全部併完後，才依卡之間的先後排批、展開派工單。',
    accept: '排批時再定。', rollback: '排批時再定。',
    cards: [
      C('W6', 'High', 'Opus＋你說可以', 'W5', '正式站重新開啟店面外掛與兩把密鑰。'),
      C('M9', 'High', 'Sonnet（先過備份）', '', 'aware-wave.com 關掉訪客結帳。'),
      C('M4', 'High', 'Opus', 'M3、W6', '標籤寫進 FluentCRM，WordPress 加測試角色。'),
      C('M7', 'High', 'Opus＋你', 'M5、M6、W6', '既有客戶逐一代辦成會員。'),
      C('W7', 'Medium', '你本人', 'W6、M5、M6、M8、M9、M10', '真人走一遍：註冊、付款、進入、扣點。'),
      C('U16', 'Medium', 'Sonnet', 'U11', '內容概覽首頁。'),
      C('U17', 'Medium', 'Sonnet', 'U8', '工作台「繼續上次」。'),
      C('U18', 'Low', 'Sonnet', 'K5、U22', '頂列搜尋。'),
      C('U19', 'High', 'Opus', 'M5', '客戶自己授權他人。'),
      C('U24', 'High', 'Opus', 'U8', '最近使用與常用。'),
      C('U25', 'Medium', 'Sonnet＋Haiku 填值', 'U22', '功能層分類欄位，並填入資料。'),
      C('U26', 'Low', 'Sonnet', 'U25', '登記表匯出成 catalog.json。'),
      C('U28', 'Medium', 'Sonnet', 'U5', '付款後立刻讓功能清單的快取失效。'),
    ] },
  { code: 'p3', no: '第三階段', title: '開放註冊時與之後', phase: 'P3',
    seen: '第一階段全部併完後，才依卡之間的先後排批、展開派工單。',
    accept: '排批時再定。', rollback: '排批時再定。',
    cards: [
      C('U20', 'High', 'Opus', 'U21', '收藏。'),
      C('U29', 'Medium', 'Sonnet', 'U26、W7', '公開面：首頁、全部工具、分類、介紹頁。'),
      C('U30', 'Low', 'Sonnet', 'U29', '搜尋沒結果時的表單與彙整。'),
      C('U31', 'Low', 'Sonnet', 'U25', '一百個以上工具的清單容器。'),
      C('U32', 'Medium', 'Opus', '藍圖 §4.8 的門檻', 'AI 智慧搜尋（有門檻）。'),
      C('U33', 'Medium', 'Opus', '你要先決定', '啟用免費或免登入。'),
      C('U34', 'High', 'Opus', '你要先決定', '啟用方案分級與功能額度。'),
      C('U35', 'Medium', 'Opus', '決策文件 017 第五節', '買斷安裝卡片。'),
    ] },
];

const STAGE_TO_STATUS = { todo: 'not_started', doing: 'in_progress', review: 'in_progress', done: 'done' };

// 給 kit 的 STEPS：一張卡一步（進度條、完成數都按卡算）。title／gate 是 kit 必填欄，這裡填卡號與所屬批的驗收。
export const STEPS = BATCHES.flatMap((b) => b.cards.map((c) => ({ ...c, batch: b.code })))
  .map((c, i) => {
    const stage = PROGRESS[c.id] || 'todo';
    const b = BATCHES.find((x) => x.code === c.batch);
    return {
      n: i + 1, code: c.id, batch: c.batch, title: c.id, plain: c.plain, gate: b.accept,
      risk: c.risk, model: c.model, after: c.after, stage,
      status: STAGE_TO_STATUS[stage] || 'not_started', depends: [], commit: COMMITS[c.id],
    };
  });

export const OPEN = []; // kit 的「待決」不用；等你決定改用 GO
export const NOW = [];
