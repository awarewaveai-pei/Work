// 影片剪輯補齊監工台 -- 唯一的狀態來源。改這裡 → `node build.mjs` → `node check.mjs` → 重新發布同一網址。
// 做法正本：apps/video-workbench/docs/editor-parity-spec-20261106.md §3（check.mjs 驗卡號一一對應）。這裡只放狀態與白話。

export const META = {
  title: '影片剪輯補齊監工台',
  updated: '2026-11-10',
  plan: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/editor-parity-spec-20261106.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-06',
  self: 'agency-os/handoffs/2026-11-06-video-editor-parity-supervisor/',
  url: 'https://claude.ai/artifact/Dz5uKTSs8RH1moVgbsh5u7',
};

export const COPY = {
  sub: '應用工具的「影片剪輯」補到跟參考工作台一樣：功能、流程、版面、快捷鍵相同，外觀用 AwareWave 主題。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '剪輯器現在做得到與做不到的事（2026-11-06 實際打開查）。' },
  steps: { h: '卡片與工作', lead: '依編號做。先做版面骨架，各分頁接著做，要付費服務的放最後。風險 High 的卡經你同意才上線。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '完整清單與每張卡的做法', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '已定', group: '可同時進行：' },
};

export const NOW = [
  { what: '左側每個分頁、匯出視窗、專案列表各自一個檔，可以多個 session 同時做。', state: 'yes', ev: '2026-11-10 ED.0（a98153452、25397763e、7c7976bcb、cd5ea376f）＋每卡樣式檔（a3deedf2e）；ED.2 偶發失敗已從根因修好，連跑 10 次全綠。' },
  { what: '字幕後端：逐字時間、整片辨識、卡拉 OK／逐字高亮輸出、剪贅字資料。', state: 'yes', ev: '2026-11-10 e28bcbc4d（未部署）；剪輯器裡的字幕分頁畫面是 ED.10 後半，還沒做。' },
  { what: '兩邊每個鍵都按過的對照表。', state: 'yes', ev: '2026-11-06 逐鍵對照：同 18、不同 17、缺 24、本機多 2；每一列都歸到卡（docs/editor-parity-compare-20261106.md）。' },
  { what: '剪輯、分割、複製、刪除、多軌、轉場、濾鏡、匯出 1080p。', state: 'yes', ev: '既有功能，tests/tools-editor.cjs 真實匯出過。' },
  { what: '上傳大支影片不會「頁面通訊逾時」。', state: 'yes', ev: '已修好，2026-11-06 上線（6d3dda8f6，部署 96ddd7f70）。' },
  { what: '版面跟參考一樣（圖示側欄、可收合、整片設定、播放列）。', state: 'yes', ev: '2026-11-06 卡 ED.1（9df955245），2026-11-06 已上線（部署 96ddd7f70）。參考沒有的片頭、調色、影格率、峰值表、多軌都還在，搬到對應位置。' },
  { what: '多選、磁吸、磁性主軌、波紋刪除、快捷鍵全套。', state: 'yes', ev: '2026-11-06 卡 ED.2（5b726b2eb），2026-11-06 已上線（部署 96ddd7f70）。tests/ed2-timeline.cjs 在真瀏覽器把每個新鍵實按一次。' },
  { what: '屬性面板：整片／此軌／此片段效果、光漏、震動、關鍵影格、分離音訊、速度鈕，輸出照做。', state: 'yes', ev: '2026-11-06 卡 ED.3（afc1d90ba–af1517238）；2026-11-10 部署 22ceb6e47，同時修好擋住部署的打包清單（f36751b79）。tests/ed3-inspector.cjs、ed3-effects.cjs 真輸出抽畫面。' },
  { what: '字幕辨識、翻譯、剪贅字在剪輯器裡完成。', state: 'no', ev: '卡 ED.10、ED.11；現在要跳去字幕工具。' },
  { what: '剪輯 Agent（打字叫它剪）。', state: 'no', ev: '卡 ED.13，最後做。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const VW = 'VW/scripts/tools-editor.js';
const ED1 = '9df955245';
const ED2 = '5b726b2eb';

export const STEPS = [
  { n: 1, code: 'ED.1', title: '版面骨架', plain: '例：左邊一排圖示（素材、文字、音訊…），按「«」收起來；右邊沒選片段時顯示整片設定；播放列有跳頭尾、前後一秒、循環、720P／1080P、全螢幕。',
    gate: '每個新控制項在本機點過有反應；收合、拖寬重開後記得；既有剪輯測試全綠。', risk: 'Medium', model: 'Opus', status: 'done', commit: ED1, depends: [],
    decided: '版型與功能跟參考一模一樣；參考沒有的功能保留並搬到對應位置；新建視窗多一張 4:3（2026-11-06）。',
    what: '圖示側欄＋收合拖寬、頂列（改名、比例、已儲存時間、總時長、匯出）、預覽播放列、檢查器收合拖寬、時間軸高度；不放剪輯 Agent 按鈕（ED.13 才加）',
    files: [VW, 'VW/styles/tools.css'],
    items: [
      done('ED.1.1', '左邊圖示側欄八格，可收起、可拖寬；右邊屬性欄同樣，大小重開後照舊。片頭搬進文字、調色搬進片段屬性。', ED1),
      done('ED.1.2', '頂列：改名、比例、「已儲存 幾點幾分」、總長度、匯出；新建視窗有比例卡。空專案顯示從哪裡開始。', ED1),
      done('ED.1.3', '播放列：跳頭尾、前後一秒、循環、全螢幕；時間尺可點選位置；時間軸高度可拖。播放中切換分頁或側欄不會停。', ED1),
      done('ED.1.4', '預覽畫質 720P／1080P：素材旁邊自動產生短邊 720 的預覽檔，選 720P 就播它；長片先顯示「製作中」，做好自動換上。', '836de9121'),
      done('ED.1.5', '頂列「比例」改成可見按鈕，跟整片設定同一組；剪輯器不再被頂列撐寬。', '539a80249'),
    ] },
  { n: 2, code: 'ED.2', title: '時間軸操作', plain: '例：按住 Shift 點三個片段一起拖；開「磁性主軌」後刪掉中間一段，後面自動補上；按 ? 跳出快捷鍵表。',
    gate: '快捷鍵表上每一個鍵都實際按過；多選拖曳、磁吸、波紋刪除各有指名測試。', risk: 'Medium', model: 'Opus', status: 'done', commit: ED2, depends: ['ED.1'],
    what: '多選、磁吸開關、磁性主軌、波紋刪除、片段與樣式複製貼上、標記跳轉、縮放全套、片段縮圖與波形、軌道中文名／每軌＋／上下移、片段上音量與轉場鈕、快捷鍵表、說明、J/K/L',
    files: [VW, 'VW/shared/editor-model.js'],
    items: [
      done('ED.2.1', '多選與整組拖曳、複製貼上片段、複製貼上樣式。', ED2),
      done('ED.2.2', '磁吸、磁性主軌、波紋刪除。', ED2),
      done('ED.2.3', '縮放、標記跳轉、J／K／L 倒播快播、快捷鍵表。', ED2),
      done('ED.2.4', '軌道中文名、每軌＋、上下移；片段顯示縮圖與聲音波形。', ED2),
      done('ED.2.6', '工具列每個鍵「圖示＋文字」（加＋字幕；複製／貼上樣式只有圖示；磁吸、磁性主軌是外框開關）；軌道標頭「圖示＋中文名」加 ＋、眼睛、上下移、靜音。', ED2),
      done('ED.2.5', '對照差異：縮放改成 −／＋ 每次 15、自適應全片、預設 50 px/s；時間旁顯示倍速；重做後不保留選取；「刪除並前移」改名波紋刪除。', ED2),
    ] },
  { n: 3, code: 'ED.3', title: '屬性面板', plain: '例：選一段影片，把濾鏡設成「只套這段」，加光漏和鏡頭震動，在第 2 秒和第 5 秒設關鍵影格讓它放大；輸出的片照樣有這些效果。',
    gate: '每個新效果輸出一次真影片並抽畫面確認；舊專案打開輸出結果不變。', risk: 'High', model: '設計 Fable；做 Opus', status: 'done', commit: 'af1517238', depends: ['ED.1'],
    decided: '2026-11-06（你交給監工決定）：施工圖已寫好（docs/ed3-properties-spec-20261106.md，15d3aedf2）。整片、此軌、此片段三層同時有設定時，以最近的一層為準，因為全部疊加會讓舊專案的成片變樣。分離音訊沿用原影片檔，不另存一份。上線點：ED.1–ED.3 做完後，跟專業剪輯、專業特效一起部署，部署前再跟你確認。',
    what: '整片設定；片段：套用範圍三層、光漏、震動、遮罩、Transform＋關鍵影格、背景模糊／純色、分離音訊、旁白時自動降低；文字片段；數字欄位操作；editor-export.cjs 補輸出',
    files: [VW, 'VW/backend/editor-export.cjs', 'VW/shared/editor-model.js'],
    items: [
      done('ED.3.1', '沒選片段時顯示整片設定：比例、整片濾鏡、聲音、輸出資訊，都用按鈕。', 'afc1d90ba'),
      done('ED.3.6', '屬性分組可收合，標題旁直接顯示目前的值；數字欄位可拖、可打字。', '6ded608d6'),
      done('ED.3.2', '影片片段：效果可選整片、此軌或此片段；十六顆濾鏡鈕加強度、光漏、震動、遮罩、背景模糊。', '61ac8cd09'),
      done('ED.3.3', '變形與關鍵影格；分離音訊（沿用原影片檔）；有旁白時配樂自動降低。', '8331ce93e'),
      done('ED.3.4', '輸出端照做；舊專案輸出逐格不變的測試先建好，每次改動都跑。', 'c9574d507'),
      done('ED.3.5', '對照差異補齊：播放速度四顆鈕、2 倍速片段長度減半、來源終點、音量用 dB。', 'af1517238'),
      done('ED.3.8', '預覽畫出遮罩、顆粒、背景模糊，跟輸出一致；半透明圖重畫不會越疊越濃（d6ab0a1c6，未部署）。', 'f9fdd9548'),
    ] },
  { n: 4, code: 'ED.4', title: '素材分頁', plain: '例：素材分頁直接看到縮圖，篩「影片」，上面一組是「已使用」並標「已用 × 2」，按 ＋ 放到主視訊最後面。',
    gate: '三個分頁、搜尋、篩選、已使用分組、收藏、拆出音軌都點過。', risk: 'Low', model: 'Sonnet', status: 'in_progress', depends: ['ED.1'],
    what: '我的素材庫／本次上傳／收藏、搜尋、類型篩選、已使用／未使用、已用×n、收藏星、縮圖長度解析度、加到指定軌、拆出音軌',
    files: [VW, 'VW/shared/assets-ui.js'],
    items: [
      done('ED.4.1', '縮圖格、三個分頁、搜尋、類型篩選；點素材卡就加到主視訊末端並選取（未部署）。', '8c12108aa'),
      done('ED.4.2', '已使用／未使用、收藏、拆出音軌；按軌道＋就加到那條軌（舊的選素材視窗已刪）。', '977eb2ef2'),
      todo('ED.4.3', '對照參考再看兩處：上傳後是否自動放上時間軸；收藏與本次上傳沒有東西時的文字。'),
    ] },
  { n: 5, code: 'ED.5', title: '文字分頁', plain: '例：文字分頁選「標價」，看到「限時優惠」「8 折起」的樣板預覽，按 ＋ 放到播放頭位置。',
    gate: '每張自製樣板加入一次、輸出一次；不含參考網站的圖或字樣設計。', risk: 'Low', model: 'Sonnet', status: 'in_progress', commit: '07022ba27', depends: ['ED.1'],
    what: '自製樣板，數量與分類同參考（開場／標價／CTA／強調／片尾）、搜尋、純文字、品牌字型、文字動畫、雙擊或拖曳加入',
    files: [VW],
    items: [
      done('ED.5.1', '參考有的每種文字樣板都有一張自己設計的，分類、預覽、搜尋；每張都真的輸出過一次（未部署）。', '07022ba27'),
      done('ED.5.2', '純文字、品牌字型、文字動畫；按 ＋、雙擊或拖曳加入。加入空白文字的預設字改成「新文字」。', '07022ba27'),
      todo('ED.5.3', '預覽也播出文字動畫；輸出的文字底色跟預覽一致。兩處都在共用檔，跟 ED.7.3、ED.10.4 併一張卡做。'),
    ] },
  { n: 6, code: 'ED.6', title: '音訊分頁', plain: '例：音訊分頁點「配樂」，從內建曲庫挑一首放進配樂軌，勾「旁白時配樂降低」，再用 AI 旁白念一段文案（先看價格）。',
    gate: '分類、目標軌、內建曲庫、音訊設定五項、AI 旁白都點過；AI 旁白先顯示價格。', risk: 'Medium', model: 'Opus', status: 'not_started', depends: ['ED.1'],
    decided: '2026-11-10：目前只有你自己用、不賣客戶，所以先走免費。音效與環境音用 Freesound 的公眾領域（CC0）檔案；內建配樂也要有，用公眾領域（CC0）的現成曲，照曲風盡量湊到 80 首，US$0；也能上傳自己的音樂。曲庫是一份清單，每首記來源與授權，以後要換曲只換清單，程式不用改。參考網站的曲子不能用。ElevenLabs 不開。',
    what: '依用途標籤分類、目標軌 A1／A2、內建庫、音訊設定（整體音量、對齊切點、旁白降 12 dB、循環延伸、響度）＋BPM 建議、AI 旁白接現有 spoken',
    files: [VW, 'VW/backend/api.cjs'],
    items: [
      todo('ED.6.1', '六種分類、目標軌切換、內建曲庫（曲風、排序、試聽、加入）。'),
      todo('ED.6.2', '音訊設定：整體音量、對齊切點、旁白時降低、循環、響度、建議 BPM。'),
      todo('ED.6.3', 'AI 旁白：文字、聲音描述、語速音高音量，先顯示價格。'),
      todo('ED.6.4', '內建曲庫清單：公眾領域（CC0）的配樂、音效、環境音，每首記來源與授權；下載前逐字讀一次授權條款，清單先給監工看。'),
    ] },
  { n: 7, code: 'ED.7', title: '轉場與貼圖', plain: '例：選「融接」按「套用全部剪點」，每個剪點都加上；上傳公司 Logo 當浮水印，下一個專案也還在。',
    gate: '套用全部、預覽剪點、移除、曲線都輸出過；浮水印與品牌套件換專案還在。', risk: 'Low', model: 'Sonnet', status: 'in_progress', depends: ['ED.1'],
    what: '轉場套用全部 (n)、預覽剪點、移除、曲線；浮水印 PNG／SVG 帳號保留；品牌套件跨專案',
    files: [VW, 'VW/shared/runtime.js'],
    items: [
      done('ED.7.1', '轉場：先點剪點才能套用，五種效果、套用全部剪點、預覽、移除、三種曲線，輸出照曲線走；舊專案只有存了曲線的那一段變（未部署）。', '52fda4dfa'),
      done('ED.7.2', '浮水印（PNG／SVG）與品牌套件（色彩、字型、Logo），換專案還在；浮水印進輸出由 ED.8 做。', '3ca146b0b'),
      todo('ED.7.3', '預覽轉場也照曲線走（現在預覽固定線性），在共用檔，跟 ED.5.3、ED.10.4 併一張卡做。'),
    ] },
  { n: 8, code: 'ED.8', title: '匯出視窗', plain: '例：按匯出，選「TikTok / Reels」就自動是 9:16、1080P；勾「套用浮水印」；看到總長度與費用再按開始。',
    gate: '五個平台預設各輸出一次，規格與標示相同。', risk: 'Low', model: 'Sonnet', status: 'done', commit: '4c54b797d', depends: ['ED.1'],
    what: '平台預設、自訂 1080P／720P、浮水印開關、總時長、預估費用',
    files: [VW],
    items: [
      done('ED.8.1', '五個平台預設（TikTok／Shorts／YouTube／Instagram／自訂）帶入比例與畫質，自訂 720P／1080P／4K（未部署）。', '4c54b797d'),
      done('ED.8.2', '浮水印開關（真的出現在輸出畫面）、總長度、預估費用（本機輸出免費）。', '4c54b797d'),
    ] },
  { n: 9, code: 'ED.9', title: '專案列表頁', plain: '例：打開影片剪輯先看到專案卡（縮圖、比例、長度、更新日期），可搜尋、改名、刪除；卡上寫「屬於 專案 › 第 2 集」。',
    gate: '舊剪輯專案一筆不少；搜尋、改名、刪除都點過；跟專案頁開到同一份剪輯檔。', risk: 'Low', model: 'Sonnet', status: 'done', commit: 'a64ee7b07', depends: [],
    decided: '列表頁照參考做，卡上多一行屬於哪一集；跟 PJ.1 一起對齊（2026-11-06）。',
    what: '搜尋、專案卡、改名、刪除、空狀態；與 PJ.1 的集歸屬',
    files: [VW, 'VW/docs/engine-route-plan-20261106.md'],
    items: [
      done('ED.9.1', '專案卡（縮圖、比例、長度、更新日期）、搜尋、改名、刪除（先留備份）、空狀態（未部署）。', 'a64ee7b07'),
      done('ED.9.2', '卡上顯示屬於哪一集，跟專案頁開同一份檔；內容有改才更新日期。', 'a64ee7b07'),
    ] },
  { n: 10, code: 'ED.10', title: '字幕', plain: '例：在剪輯器按「一鍵整片字幕」，先看價格，辨識完出現繁中字幕軌；再翻成英文成另一軌；樣式選「卡拉 OK」，字一個一個亮。',
    gate: '辨識、翻譯先顯示價格；逐句編輯、分割、合併、匯出 SRT 都點過；逐字高亮輸出正確。', risk: 'High', model: '設計 Fable；做 Opus', status: 'in_progress', depends: ['ED.1'],
    what: '三分頁搬進剪輯器；每語言一軌；/transcriptions 改回逐字時間與分數、整片 V1＋A1 辨識、找回結果；翻譯接 /tools/subtitles/translate；逐字高亮／卡拉 OK 輸出',
    files: [VW, 'VW/backend/api.cjs', 'VW/backend/editor-export.cjs'],
    items: [
      done('ED.10.1', '逐句：新增、改時間與文字、播放頭分割、合併、刪除、匯出 SRT；每種語言一條軌；舊專案打開不寫入（未部署）。', '2f722426f'),
      done('ED.10.2', '樣式：八種（含逐字高亮、卡拉 OK）、字級、上下位置，一次套到整條軌。', '2f722426f'),
      done('ED.10.3', '辨識整片與翻譯，先按「查看費用」看價格（免費或 NT$）；找回已完成結果。', '2f722426f'),
      todo('ED.10.4', '預覽畫出八種字幕樣式（現在只有輸出會畫），在共用檔，跟 ED.5.3、ED.7.3 併一張卡做。'),
      done('ED.10.5', '時間軸上分割、裁切、設入出點、改速時，逐字時間跟著移；被切掉的字文字也跟著改（未部署）。', '51827cf5a'),
    ] },
  { n: 11, code: 'ED.11', title: '剪贅字', plain: '例：把停頓上限設 0.5 秒、勾「剪掉嗯、呃」，按估價再套用；畫面、旁白、字幕一起剪，配樂不斷。',
    gate: '一支有「嗯」與長停頓的測試片剪完，字幕時間對得上、配樂連續。', risk: 'High', model: 'Opus', status: 'not_started', depends: ['ED.10'],
    what: '用 ED.10 的逐字時間碼；停頓上限、語氣詞、語言、估價；V1＋A1＋字幕同剪、配樂連續',
    files: [VW, 'VW/shared/editor-model.js'],
    items: [
      todo('ED.11.1', '停頓上限、剪語氣詞、語言、估價。'),
      todo('ED.11.2', '畫面、旁白、字幕一起剪，配樂不斷。'),
    ] },
  { n: 12, code: 'ED.12', title: '特效裡的 AI 功能', plain: '例：選一段模糊的影片按「AI 畫質增強」，看價格後送出，完成後自動換掉原片段、剪輯設定不變。',
    gate: '兩個功能都先顯示價格；替換後片段的剪輯設定不變。', risk: 'Medium', model: 'Opus', status: 'not_started', depends: ['ED.3'],
    what: 'AI 畫質增強替換片段；從這裡重新生成（接現有增強與 reshoot）',
    files: [VW, 'VW/backend/api.cjs'],
    items: [
      todo('ED.12.1', 'AI 畫質增強：先看價格，完成後換掉原片段。'),
      todo('ED.12.2', '從這裡重新生成：以停住的畫面接著重生，取代失敗的後段。'),
    ] },
  { n: 13, code: 'ED.13', title: '剪輯 Agent', plain: '例：打「整片上字幕，配樂淡出讓位旁白」，它說要花多少，按確認後自動完成。',
    gate: '五個快捷需求各實跑一次；每則訊息與每次生成都先告知費用。', risk: 'High', model: '設計 Fable；做 Opus', status: 'not_started', depends: ['ED.2', 'ED.3', 'ED.10'],
    what: '浮動對話視窗、快捷需求、以工具呼叫改剪輯模型、每則扣點先告知',
    files: [VW, 'VW/backend/api.cjs'],
    items: [
      todo('ED.13.1', '浮動對話視窗、新對話、快捷需求。'),
      todo('ED.13.2', '照文字改剪輯；每次花費先告知。'),
    ] },
];

export const OPEN = [
];
