// 影音工作台監工台 -- 唯一的狀態來源。改這裡 → `node build.mjs` → `node check.mjs` → 重新發布同一網址。
// 做法正本：apps/video-workbench/docs/creative-suite-plan-20261102.md §4（check.mjs 驗卡號一一對應）；需求正本 handoff。這裡只放狀態與白話。

export const META = {
  title: '影音工作台監工台',
  updated: '2026-11-06',
  plan: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/creative-suite-plan-20261102.md',
  req: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/handoff/Claude_Code_handoff_20261102.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-02 續19–續45',
  self: 'agency-os/handoffs/2026-11-02-video-workbench-supervisor/',
  url: 'https://claude.ai/artifact/YRsAwgH1cVEtcSLdCPWzCs',
};

export const COPY = {
  sub: '影音工作台做成專業剪輯與動畫工具：剪輯、字幕、動畫合成、2D 角色骨架、3D，最後接進 video.aware-wave.com。共 {total} 張卡、{items} 項工作，已完成 {itemsDone} 項。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '卡片與工作', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前做得到與做不到的事（2026-11-02 查）。' },
  steps: { h: '卡片與工作', lead: '依編號一張一張做。EffectCraft 試驗（P0）的結果決定剪輯與動畫用哪個引擎。風險 High 的卡經你同意才執行。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的卡才能開始。', none: '目前沒有需要你決定的事。', count: '{n} 項', before: '第 {n} 張卡開始前決定', src: '出處' },
  paths: { h: '檔案', plan: '每張卡的做法', req: '需求與驗收', track: '工作紀錄', self: '本頁來源', howto: '修改 data.mjs 後，執行 node build.mjs 和 node check.mjs，再重新發布到同一個網址。' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成的樣子', details: '工程細節', depends: '需先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '已定', group: '可同時進行：' },
};

// 現在真的能不能用（2026-11-02 查，出處見計畫 §1）
export const NOW = [
  { what: '程式在 repo 裡改，測試全綠。', state: 'yes', ev: 'apps/video-workbench 的測試全部通過（WORKLOG 11-02）。畫面上已沒有 SeedStar 字樣。' },
  { what: '打開 127.0.0.1:4178 看到的是 repo 版。', state: 'yes', ev: '2026-11-02 卡 0：舊資料 5 筆任務、17 個生成檔搬進 repo，角色頁出現「示範角色庫」。' },
  { what: '手機拍的 HEVC MOV 能預覽。', state: 'yes', ev: '2026-11-02 卡 M1：上傳後自動產 H.264 代理檔供預覽，輸出仍用原檔；同一支影片只存一份。' },
  { what: '素材與專案存在伺服器，清瀏覽器資料不會不見。', state: 'yes', ev: '2026-11-02 卡 M2，4178 已重啟：瀏覽器裡的 7 個素材、5 筆任務已搬到伺服器，每個素材都有來源標記；原版在瀏覽器另存備份。' },
  { what: '剪輯能精確到影格、加減軌道、用多種轉場。', state: 'yes', ev: '2026-11-02 卡 P2：軌道可增減、多種轉場、調色＋LUT、4K、混音響度 −16 LUFS。' },
  { what: '輸出 720p 或 1080p 的 H.264 影片，含字幕與混音。', state: 'yes', ev: 'editor-export.cjs:182；比例有 16:9、9:16、1:1、4:5、4:3。' },
  { what: '用模板做片頭（繁中可）。', state: 'yes', ev: '2026-11-02 卡 P1：剪輯器「片頭」分頁，自架 Remotion 服務渲染，免費；成品進素材庫並記來源。' },
  { what: '動畫合成（2D）。', state: 'yes', ev: '2026-11-03 卡 P3：工具「動畫合成」，輸出透明影片回剪輯。' },
  { what: '2D 角色骨架。', state: 'yes', ev: '2026-11-03 卡 P4：工具「角色綁定」，姿勢圖可當生成參考。' },
  { what: '3D。', state: 'yes', ev: '2026-11-03 卡 P5：工具「3D」，Blender 4.5.9 渲染回剪輯。圖片轉 3D 改走 S4b（Meshy 停用）。' },
  { what: '在 video.aware-wave.com 登入使用。', state: 'yes', ev: '2026-11-05 已上線：未登入回 401、偽造身分回 401、smoke 全綠；3D 用主機 CPU（Cycles）。送審缺口已補（P6.13）；全程投遞實測待你操作（P6.10）。' },
  { what: 'EffectCraft、FilmCraft 的專業功能在站上用得到。', state: 'no', ev: '11-02 試驗沒過，所以站上的剪輯與動畫都是自製的。11-06 重新試過：字型、焦點、重開素材都有解法，你 11-06 選了「並存」：做成「專業剪輯」「專業特效」兩個入口，現有工具都留著。卡 FC 上線後這一列才會變成可以。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const C0 = '82d19db9e';
const M1 = 'ca4297f00';
const S3 = 'd6835f354';
const P0 = '3859d8c69';
const M3 = 'b52b2ac04';
const M2 = '2ab702e3f';
const P1 = 'f9eca42b2';
const P2 = 'a0be1d012';
const P3 = '40c7b8ebd';
const P4 = '1c5bde805';
const P5 = '646cc9778';
const P6 = '9465bbc8c';
const RV = 'd84f65ec5';
const RE = '1c0dcce1f';
const RB = '28dff199c';
const FC1 = '6cbcae4e5';
const PJS = '7507aea7f';

export const STEPS = [
  { n: 1, code: '0', title: '切 4178 到 repo', plain: '例：打開 127.0.0.1:4178，角色頁出現「示範角色庫」，代表跑的是 repo 版；舊資料一筆不少。',
    gate: '4178 出現「示範角色庫」；任務筆數不少；素材庫、分鏡頁正常；啟動測試通過。', risk: 'Low', model: 'Opus（經 SDK API）', status: 'done', commit: C0, depends: [],
    result: '2026-11-02 取 20261102 完整最新版的 5 筆任務與生成檔，加另一份副本獨有的 2 支 mp4，共 17 檔（sha256 比對無衝突）；之後 Downloads 副本由你刪除，只剩 repo 這份。4178 由 repo 版提供，示範角色庫出現，啟動測試通過。',
    what: '確認埠持有程序與 jobs.json 無進行中任務 → 比對 Downloads 與 repo 的 .data → 較新者進 repo .data → 停舊、start.cmd 起新；列出只在本機的檔',
    files: ['VW/start.cmd', 'VW/.data/', 'VW/tests/startup.cjs'],
    items: [
      done('0.1', '確認 4178 由哪個程式佔用、有沒有進行中的生成任務。', C0),
      done('0.2', '比對舊副本與 repo 的資料，較新的那份放進 repo。', C0),
      done('0.3', '停掉舊的、從 repo 啟動；列出只存在本機、不在 git 的檔與備份去處。', C0),
      done('0.4', '驗收：示範角色庫出現、任務筆數不少、啟動測試通過。', C0),
    ] },
  { n: 2, code: 'M1', title: '媒體存放、探測、代理檔', plain: '例：把手機拍的 HEVC 影片拖進來，馬上能預覽；同一支影片上傳兩次，硬碟只存一份。',
    gate: '同一檔上傳兩次只存一份；HEVC MOV 匯入後可預覽、輸出用原檔；探測結果有影格率與色彩資訊；既有測試全綠。', risk: 'Medium', model: 'Opus（經 SDK API）', status: 'done', commit: M1, depends: ['0'],
    result: '2026-11-02 SDK 工人實作、主 session 審查；Codex 審出 2 項（H.264 MOV 沒產代理、影格率不固定的輸出沒被抓到）已修並加測試。34 個測試檔全綠，HEVC 代理在 Edge 實際播放。4178 已重啟，實測上傳 HEVC MOV 回傳代理檔。',
    what: '釘版 ffprobe＋checksum；media-inspect.cjs 換 ffprobe JSON；新增 media-store.cjs（uuid＋sha256、目錄、代理、縮圖、波形）；ffprobe 輸出核對 helper',
    files: ['VW/backend/media-inspect.cjs', 'VW/backend/media-store.cjs', 'VW/start.cmd'],
    items: [
      done('M1.1', '裝上固定版本的 ffprobe（影片探測工具），啟動時檢查。', M1),
      done('M1.2', '匯入時讀出編碼、影格率、色彩、音軌，存成一份紀錄。', M1),
      done('M1.3', '同內容只存一份；瀏覽器放不了的影片自動產預覽用代理檔，輸出仍用原檔。', M1),
      done('M1.4', '縮圖與聲音波形；測試。', M1),
    ] },
  { n: 3, code: 'P0', title: 'EffectCraft 試驗', plain: '例：在這台筆電上用 EffectCraft 網頁版剪一段有繁中字幕的片，看順不順、能不能存回工作台；結果決定之後用哪個引擎。',
    gate: '產出能力表、缺口清單與路線判定（A 單引擎、B 雙引擎、C 自製）；工時上限 8 小時。', risk: 'Medium', model: 'Opus（經 SDK API）', status: 'done', commit: P0, depends: ['M1'],
    result: '2026-11-02 判定路線 C：EffectCraft 網頁版不能載入繁中字型（中文全變方框），這台筆電的 WebGPU 約 54 秒後斷線、WebGL2 只有 0.47 倍速，嵌入後焦點回不來，重開專案素材全部離線。之後由 P1 起延伸現有編輯器。上游支援自訂字型時可一條指令重新試驗。',
    what: '釘 release＋checksum；放 /engines/effectcraft/；合成類硬閘 ①③⑤、剪輯類硬閘 ②④、軟閘；不接付費生成',
    files: ['VW/engines/effectcraft/VERSION.json'],
    items: [
      done('P0.1', '下載固定版本並記下校驗碼與授權，放進工作台。', P0),
      done('P0.2', '試：預覽有聲、繁中字幕顯示與輸出、嵌入後側欄正常。', P0),
      done('P0.3', '試：匯入、多圖層、裁切、混音、存檔重開、輸出。', P0),
      done('P0.4', '寫能力表與路線判定。', P0),
    ] },
  { n: 4, code: 'M2', title: '素材與專案存到伺服器', plain: '例：清掉瀏覽器資料，素材庫和專案還在；每個素材都記得從哪來（上傳、AI 生成、輸出）。',
    gate: '每筆素材有來源紀錄；清 localStorage 後清單完整；同一任務重送不重跑；取消中的任務狀態正確。', risk: 'Medium', model: 'Opus（經 SDK API）', status: 'done', commit: M2, depends: ['M1'],
    result: '2026-11-02 素材、專案、任務改存伺服器；兩分頁同時改時後存的那頁自動重新整理成最新資料；素材記來源；重送不重複付費。Codex 審出 6 項，5 項已修、1 項不成立。4178 已重啟，瀏覽器資料已搬到伺服器。',
    what: '帳冊搬 .data；AssetOrigin＋擴充；舊 localStorage 遷移（保留原版）；backup.export／import 走伺服器；任務冪等鍵、取消、重試',
    files: ['VW/shared/adapters.js', 'VW/shared/runtime.js', 'VW/backend/api.cjs'],
    items: [
      done('M2.1', '素材、專案、任務清單改存伺服器；瀏覽器只當快取。', M2),
      done('M2.2', '每個素材記下來源、模型、成本，格式跟主系統一樣。', M2),
      done('M2.3', '舊資料搬過來，原版保留。', M2),
      done('M2.4', '任務可取消、可重試、重送不重跑；測試。', M2),
    ] },
  { n: 5, code: 'M3', title: '影格時間、輸出檢查、專案格式', plain: '例：29.97 格的手機片剪在第 120 格，存檔重開、輸出都還是第 120 格；輸出若沒聲音會被抓出來。',
    gate: '裁切重開不偏移；故意靜音的輸出被判不合格；匯出主系統時間軸格式並列出丟失；舊五軌專案轉換列出未支援欄位。', risk: 'Medium', model: 'Opus（經 SDK API）', status: 'done', commit: M3, depends: ['M2'],
    result: '2026-11-02 片段時間改存整數影格，可選 29.97 等影格率；每次輸出自動檢查長度、規格、指定畫面與聲音，沒過就判失敗；可匯出成主系統時間軸格式並列出丟失的欄位。Codex 審出 3 項全修。4178 已重啟到新程式。',
    what: '{num,den}／影格型別；MediaTimelineV1 匯出器；輸出三步驗證 helper；專案外層格式；五軌編輯器改用此契約',
    files: ['VW/backend/editor-export.cjs', 'VW/scripts/tools-editor.js'],
    items: [
      done('M3.1', '時間改用影格，不再用小數秒。', M3),
      done('M3.2', '每次輸出自動檢查：長度、影格率、指定畫面、聲音不是靜音。', M3),
      done('M3.3', '專案格式統一，可匯出給主系統，丟失的欄位列出來。', M3),
      done('M3.4', '舊五軌專案轉過來，原版保留；測試。', M3),
    ] },
  { n: 6, code: 'S3a＋S2', title: '去背、同場景多鏡', plain: '例：按「去背」先看到費用，按下後得到透明背景圖進素材庫；同一個場景拍遠、中、近三鏡，重生一鏡不影響另外兩鏡。',
    gate: '去背按鈕顯示成本並記實際成本；去背圖可當參考圖；三鏡引用同一場景素材。', risk: 'Low', model: 'Opus（經 SDK API）', status: 'done', commit: S3, depends: ['M2'],
    result: '2026-11-02 素材庫圖片有「去背 · 約 US$0.011」按鈕，結果存成新素材；同一張圖不會付兩次錢，關掉任務視窗也不會丟成果。鏡頭可選場景、角色、景別，生成時以該場景的參考圖為主。Seedance 字樣已移除。Codex 審出 3 項全修。4178 已重啟，去背已可用。',
    what: '去背沿用主系統同版本（bg-remover.ts:12）、成本 cost-model.ts:184；場景標記＋景別；清 Seedance 標籤（分鏡檔不動）',
    files: ['VW/backend/', 'VW/scripts/templates-0.js', 'VW/scripts/characters-0.js'],
    items: [
      done('S3a.1', '去背按鈕：先顯示成本，結果成為透明圖素材。', S3),
      done('S2.1', '場景標記與景別（遠、中、近、俯、仰），每鏡引用同一場景。', S3),
      done('S2.2', '清掉畫面上的 Seedance 字樣；測試。', S3),
    ] },
  { n: 7, code: 'P1', title: '引擎接入與存檔閉環', plain: '例：選素材建專案、剪、存、關掉重開、輸出，成品自動成為素材庫的一筆。',
    gate: '建專案、編輯、保存、重開、輸出，成品成為素材並帶來源；舊編輯器仍可用。', risk: 'Medium', model: 'Opus（經 SDK API）', status: 'done', commit: P1, depends: ['P0', 'M3'],
    result: '2026-11-02 輸出的影片自動進素材庫，記得來自哪個專案、哪段素材；舊專案照樣能開能輸出。剪輯器多了「片頭」：選模板、打字、選背景圖，按「產生片頭（免費）」由我們自架的服務做 5 秒片頭，可放到時間軸開頭。實測做出一支繁中片頭。Codex 審出 2 項全修。',
    what: '路線 C（P0 定案）：延伸現有五軌編輯器，補 Remotion 片頭／動態字幕模板路徑（remotion-client.ts）',
    items: [
      done('P1.1', '依 P0 路線接上引擎，或延伸自製編輯器。', P1),
      done('P1.2', '存檔、重開、輸出閉環；成品回素材庫；測試。', P1),
    ] },
  { n: 8, code: 'P2', title: '完整剪輯', plain: '例：MOV、MP4、圖片、兩路音訊、字幕混在一起剪，加轉場、調色、音量正規化，輸出 4K。',
    gate: '混合素材成片；輸出自動檢查通過；響度在目標上下 1 LU 內、峰值不超過 −1 dBTP。', risk: 'Medium', model: 'Opus（訂閱制工人）', status: 'done', commit: P2, depends: ['P1'],
    result: '2026-11-02 軌道可增減（合計 16 條）；主軌真轉場（溶解、黑場、擦除、推移、圓形）；調色含 LUT；可輸出 4K；音量可設關鍵點，輸出自動統一到 −16 LUFS、峰值壓在 −1 dB 下；SRT／VTT 可匯入匯出。在 4178 實測混了一支 MOV＋MP4＋圖＋字幕＋兩路聲音的片，全部檢查通過。Codex 審出 2 項全修。',
    what: '增刪軌、影格裁切、xfade、調色＋bt709、多路混音、峰值表、可設定響度（預設 -16）、SRT／VTT、五比例＋4K、投遞比例讀主系統',
    items: [
      done('P2.1', '可增減軌道、精確裁切、多種轉場。', P2),
      done('P2.2', '調色（曝光、對比、白平衡、飽和、LUT）與 4K 輸出。', P2),
      done('P2.3', '多路混音、音量關鍵影格、響度正規化。', P2),
      done('P2.4', 'SRT、VTT 字幕匯入匯出，時間重疊也處理；測試。', P2),
    ] },
  { n: 9, code: 'P3', title: '2D 動畫合成', plain: '例：做一個片頭，標題緩緩放大、遮罩擦出、字幕逐字亮起；把去背圖拼在一起當參考圖。',
    gate: '可改的片頭含緩動、遮罩、混合；逐字字幕預覽與輸出同一格；透明成果回時間軸再回來改。', risk: 'Medium', model: 'Opus（訂閱制工人）', status: 'done', commit: P3, depends: ['P2'],
    result: '2026-11-03 新工具「動畫合成」：圖層、遮罩、混合、關鍵影格與曲線、表達式、特效；逐字出現與高亮（字詞時間暫用整句或平均分配）。「新增片頭範本」可改標題，輸出透明影片放回剪輯，來源改了會提示更新。構圖可存成參考圖。4178 實測輸出透明片頭成功。Codex 審出 6 項全修。',
    what: '圖層、2D 變形、遮罩、關鍵影格、曲線、受限表達式、特效、動態字幕（字詞時間用主系統本機 whisper）、拼貼＝圖層',
    items: [
      done('P3.1', '圖層、遮罩、關鍵影格、曲線。', P3),
      done('P3.2', '動態字幕與逐字高亮，字詞時間用本機語音辨識，免費。', P3),
      done('P3.3', '拼貼構圖匯出成參考圖；測試。', P3),
    ] },
  { n: 10, code: 'P4', title: '2D 角色骨架', plain: '例：把角色分成身體、上臂、前臂、手掌，做揮手動作；擺好姿勢後匯出姿勢圖，生成時當參考。',
    gate: '揮手動作保存重開可改；同角色兩個姿勢各生成一次，留比對截圖。', risk: 'Medium', model: 'Opus（訂閱制工人）', status: 'done', commit: P4, depends: ['P3'],
    result: '2026-11-03 新工具「角色綁定」：部件掛骨骼、轉上臂前臂跟著動（FK）、拖手掌手肘自動算（IK）、關節角度限制、頭髮披風用網格與控制釘變形、權重筆刷。姿勢存在角色下，匯出姿勢圖當參考圖。實測同一角色兩個姿勢各生成一張，都照姿勢畫出。Codex 審出 3 項全修。',
    what: 'A 肢體綁定 → B Puppet → C 骨骼鏈、IK、權重；姿勢存角色下',
    items: [
      done('P4.1', '肢體綁定與揮手動作。', P4),
      done('P4.2', '骨骼鏈與反向運動：拉手掌，手臂跟著動。', P4),
      done('P4.3', '姿勢圖匯出給生成用；測試。', P4),
    ] },
  { n: 11, code: 'P5', title: '3D', plain: '例：3D 角色綁好骨架、套上一段動作、轉鏡頭打燈，渲染成透明片段放回剪輯；一張物件圖轉成 3D 模型。',
    gate: '先過 3D 試驗（Blender 背景處理＋瀏覽器檢視器）；角色套用動作後保存重開可改，並渲染回專案。', risk: 'Medium', model: 'Opus（SDK 工人）', status: 'done', commit: P5, depends: ['P4'],
    result: '2026-11-03 新工具「3D」：匯入 3D 模型、檢視器轉鏡頭打光、擺骨架姿勢、把動作套到角色上、用 Blender 渲染成透明影片放回剪輯。圖片轉 3D 接 Meshy（約 30 點），金鑰未設定前按鈕停用。可行性五項全過。Codex 審出 4 項全修。',
    decided: '圖片轉 3D 只考慮 Meshy（美國）；Rodin 屬上海公司，排除。',
    what: 'P5.0 閘門：GLB 進出不丟骨架、建骨→蒙皮→IK→重定向→RGBA 序列；過了才做 3D 工作區與 Blender 任務',
    items: [
      done('P5.1', '3D 試驗：骨架、蒙皮、擺姿、套用動作、渲染回剪輯。', P5),
      done('P5.2', '3D 工作區：檢視器、鏡頭、燈光。', P5),
      done('P5.3', '圖片轉 3D（Meshy）；測試。', P5),
    ] },
  { n: 12, code: 'P6', title: '上線 video.aware-wave.com', plain: '例：員工登入 video.aware-wave.com 做好一支片，一鍵送到 Postiz 和 WordPress 成為草稿。',
    gate: '部署測試全綠；一支成品從工作台到 Postiz 草稿與 WordPress 草稿全程通。', risk: 'High', model: 'Fable 規劃；Opus 執行', status: 'in_progress', depends: ['P5'],
    decided: '2026-11-03 你已同意上線部署。做法與卡號（L0–L6、D1、H0–H6）見 docs/p6-golive-plan-20261103.md。自用組織不儲值、不設點數上限（11-03 你定）；自用花費上限＝各廠商帳戶的預付餘額。',
    what: 'compose 服務＋七項清單；素材帳冊→media_assets（補組織欄、R2 搬移）；任務新表；1:1 與 4:3 不投遞；許可 can()；QA→release→delivery',
    items: [
      done('P6.1', '內部名稱 SeedStar 改成 video-workbench，舊設定與瀏覽器資料自動沿用。', '5bc940864'),
      done('P6.2', '伺服器可部署：健康檢查、只認主系統轉來的登入身分、每個組織資料分開。', '08a362e29'),
      done('P6.3', '主系統資料庫加任務帳冊表，已套到正式資料庫。', 'c86f7d0fd'),
      done('P6.4', '主系統接口：登入、素材入帳（附技術品質檢查）、任務同步、用量回報；工作台付費前先拿許可。', P6),
      done('P6.5', '付費功能照廠商實際用量算錢並回報；主系統暫時連不上時用量先存檔，之後補送且只算一次。', P6),
      done('P6.11', '收尾小項：預設圖片模型補上官方價目，沒登記價目的模型一律不收費；雲端孤兒檔由排程清掃（超過一天且帳冊沒引用才刪）。', '1b869b8af'),
      done('P6.6', '送審與投遞：工作台按鈕開主系統的投遞頁，選社群帳號、選 WordPress 網站與文章，建成草稿；比例在入帳時記下，不再從檔名猜。', '1b869b8af'),
      done('P6.7', '舊素材搬進主系統素材帳冊的腳本：舊任務成品、素材庫、沒被引用的素材都登記，重跑不重複，不刪本機檔；復原只還原本機，帳冊列要用印出的編號以 SQL 刪。', '63b19bafb'),
      done('P6.8', '容器映像、compose、nginx 設定檔（只寫檔）。工作台只認主系統簽過的身分，同網路的其他容器偽造不了。', '99a1250b6'),
      done('P6.12', '部署管線七項：部署前自動打包主系統檔、映像建好後跑測試閘、未登入呼叫必須被擋的煙霧測試、自動回滾、通知、CI；外觀檔 forms.css 已原樣提交。', '62acae78b'),
      done('P6.9', '上主機完成：video.aware-wave.com 已上線（未登入與偽造身分都擋、其他產品門正常）；3D 在主機用 CPU 的 Cycles 引擎，1080p 約 12 秒一格、五秒片約半小時，一次只跑一支，超過三小時的片送出即拒。', '7b76f9f6c'),
      todo('P6.10', '全程實測：圖片生成、素材帳冊、任務帳冊、用量回報都已在正式環境實測通過；送審缺口已補（P6.13，已部署）。剩你用員工帳號走一次：剪一支有字幕的影片 → 匯出 → 送審與投遞 → 四項檢查通過 → 核准 → 社群與 WordPress 草稿。之後加 Uptime Kuma 監控 /healthz。'),
      done('P6.14', '每個登入帳號都有 profiles：新帳號自動建立（不給任何權限、不擋註冊），刪帳號時清掉個資；缺的兩筆已補，主機每十分鐘檢查一次，出錯發告警。工作台任務帳冊已能寫入。', '39f3a7dbd'),
      done('P6.15', '主題連動：在 app 存的外觀（顏色、圓角、字型名）video.aware-wave.com 也套用，最慢半分鐘生效；app 讀不到資料庫時 video 保留上一份，不會變回預設。變成獨立產品時不設連線，就用內建預設外觀，程式不用改。網路字型（Google Fonts）video 還不會另外載入，會用系統字型代替。', 'ff40c9be7'),
      done('P6.17', 'video 網站的分鏡靈感、模板牆、應用工具恢復：seedstar 參考資料（全部分鏡與圖片）放在主機資料區，只有員工看得到；客戶看到正常的空畫面。另修兩個限流：nginx 給 video 自己的限流區，Cloudflare 限速規則排除 video。', '9caa6a21a'),
      done('P6.18', '客戶看的範例已上線：自家原創的分鏡、模板與風格示意圖（著作權自有），所有人都看得到；員工另外看得到 seedstar 參考。實際花費 US$1.67。頁面上的 seedstar 擷取說明已拿掉。', 'de0e1836a'),
      done('P6.19', '其他產品子網域（hci、social、tarot、design、content、cs、collect、outreach）也排除在 Cloudflare 限速規則外，不會再因一頁載入太多被擋；檢查腳本會抓新加的子網域。', '9caa6a21a'),
      todo('P6.16', '（操作者 11-05 說先不用）主題改成 app 存檔才通知 video、使用者切回分頁時重讀，取代現在的「有人開頁面時最多 30 秒問 app 一次」。'),
      done('P6.13', '工作台成品能過送審：剪輯專案的文字或燒進去的字幕自動變成標題、腳本和字幕檢查的依據；上傳時可勾「我有權使用這些素材」。畫面上沒有任何字的影片照實不能送審。用調色檔（LUT）的成品權利檢查會不過（調色檔沒登記到 app），要另外處理。', '1aaa139d5'),
    ] },
  { n: 13, code: 'S4b', title: '圖片轉 3D 換供應商＋自動骨架', plain: '例：上傳一張人物圖，按一下（顯示價格）變成 3D 模型，自動綁好人形骨架，從動作庫挑「走路」套上去。',
    gate: '同一組十張圖跑三種方式比品質，選預設；生成的人形模型能自動綁骨並套用動作庫的動作。', risk: 'Medium', model: 'Opus（SDK 工人）', status: 'not_started', depends: ['P6'],
    decided: '主力 Stability API（英國）；免費走筆電本機 Stable Fast 3D；備援 Replicate TRELLIS（沿用去背金鑰）；Meshy 停用。金鑰已放好（STABILITY_API_KEY）；帳戶已關「用資料訓練模型」，沒有自動加值＝預付餘額就是上限。',
    what: 'provider adapter：Stability SPAR3D／SF3D、本機 SF3D（獨立可中止程序，PyTorch CUDA 12.8+）、Replicate TRELLIS；Blender Rigify 自動人形骨架；內建 CMU BVH 動作庫；一次點擊只呼叫一次廠商',
    items: [
      todo('S4b.1', '三種圖片轉 3D 方式接成同一個按鈕，按鈕顯示價格。'),
      todo('S4b.2', '十張圖品質比較，選預設。'),
      todo('S4b.3', '人形模型自動綁骨架＋內建免費動作庫。'),
    ] },
  { n: 14, code: 'RV', title: '影片模型接 Replicate', plain: '例：在工作台選影片模型時，除了 sora-2，還能按「Runway Gen-4 Turbo · US$0.25（5 秒）」「Veo 3.1 Fast」「Veo 3.1」「Luma Ray 3.2」，價格寫在按鈕上；舊專案照樣用 sora-2。',
    gate: '舊專案 sora-2 送出內容與改前相同；四個 Replicate 模型送出的欄位和 app 那份一致；真打一次 Runway 5 秒（US$0.25），成品能播，帳冊與用量記對模型和金額。', risk: 'Medium', model: 'Opus', status: 'in_progress', depends: ['P6'], before: '待決 1',
    decided: '沿用 app（next-admin）已實測、已定價的四個模型，不另做研究：Runway（美）、Google Veo（美）、Luma（美）；不列中國公司的模型。模型清單只有一份，放在 app，工作台直接讀。',
    what: 'NA MOTION_MODELS 抽成無 import 的 lib/ai/video-motion-models.ts（VW 經 awarewave-files.txt 讀）；每個任務依 settings.model 選 OpenAI 或 Replicate；價格只讀 VIDEO_MOTION_RATES；模型與專案設定的下拉改成按鈕；Replicate 任務重開續輪詢、可取消',
    files: ['VW/docs/replicate-video-models-plan-20261105.md', 'NA/lib/tarot/video-motion-gen.ts', 'NA/lib/ai/cost-model.ts', 'VW/backend/generation-policy.cjs', 'VW/backend/api.cjs', 'VW/backend/provider-cost.cjs', 'VW/scripts/index-0.js', 'VW/scripts/projects-0.js'],
    items: [
      done('RV.1', 'app 的影片模型清單搬成工作台也能直接讀的一個檔，全系統只有這一份。Veo 價格查過：只分有沒有聲音、不分解析度，app 現在的價格是對的，沒有少算。', RV),
      done('RV.2', '工作台後端每個任務照選的模型送：sora-2 走 OpenAI（送出內容和以前一樣），其他四個走 Replicate；算錢、帳冊、用量都記實際跑的模型。重開機會接著等同一支影片；取消會叫 Replicate 停止計費，Replicate 不接受就照實說還在跑。', RV),
      done('RV.3', '畫面：模型是五顆可見按鈕，每顆寫價格，生成按鈕也寫這次的費用；專案設定的下拉改成按鈕，選的模型會真的帶到生成頁；Runway 沒圖時按鈕不能按並寫原因；還原舊任務會帶回當時的模型。', RV),
      todo('RV.4', '上線後真打一次：Runway 5 秒、一張小圖，約 US$0.25；部署要你同意。'),
    ] },
  { n: 15, code: 'RE', title: '引擎路線重評', plain: '例：你問「說好的 EffectCraft、FilmCraft 怎麼沒看到」。這張卡把兩個引擎的最新版重新試一遍，寫出三條路線給你選；也回答「工具像零件」要怎麼串成一條線。',
    gate: '差距表、五個檢查的證據、計畫都寫好；你選定路線。', risk: 'Low', model: 'Fable', status: 'done', commit: RB, depends: ['P0'],
    decided: '2026-11-06 你選路線 B（並存）：FilmCraft 做成「專業剪輯」、EffectCraft 做成「專業特效」，跟現有工具並存；先把一支影片串成一條線。',
    result: '2026-11-06 兩個引擎都加上繁中字型重新建出網頁版並實測。11-02 卡住的字型、焦點、重開素材現在都有解法。剩效能：這台筆電的瀏覽器預設用內建顯示卡，FilmCraft 畫面每秒不到一格；改用 RTX 5060 時每秒二十格上下，連跑兩分半沒有再斷線。FilmCraft 新增了嵌入用的接口，成品可以直接交回工作台，不必下載。',
    what: 'EffectCraft v0.21.1、FilmCraft main 46763a8 各加繁中字型試建；重跑五閘；三者差距表；三條路線各附 rollback；專案主線回答重評 handoff §2b 四問。不改正式程式',
    files: ['VW/docs/engine-route-plan-20261106.md', 'VW/docs/p0-reeval-gates-20261106.md', 'VW/docs/p0-reeval-evidence/'],
    items: [
      done('RE.1', '差距表：EffectCraft、FilmCraft、現在自製的工具逐條比。剪輯是 FilmCraft 最完整，特效是 EffectCraft 最完整；骨架、3D 模型、AI 工具、送審只有自製的有。', RE),
      done('RE.2', '五個檢查重跑：繁中字（輸出畫面正確）、嵌入後焦點（工作台加一個按鍵就能回側欄）、重開素材、輸出都過或有解法；效能要看顯示卡，沒有獨立顯卡的電腦跑不順。', RE),
      done('RE.3', '計畫：三條路線的好處、代價、怎麼退回。建議「並存」：新增「專業剪輯」（FilmCraft，先做）與「專業特效」（EffectCraft，後做），現有工具全部留著。另寫「一支影片一條線」：從腳本到送審每一步用哪個工具、成品自動流到哪、前面改了後面怎麼知道。', RE),
      done('RE.4', '你選了路線 B。卡 PJ、FC、EC 已排進這一頁；專業剪輯的五張小卡寫到逐檔逐行，另外兩組開卡前再補細節。', RB),
    ] },
  { n: 16, code: 'PJ', title: '一支影片一條線', plain: '例：做 30 秒商品短片。建專案、產生分鏡、每個鏡頭按「生成」，成品自動掛在那個鏡頭上；按「排成時間軸」就照鏡頭順序排好；配音、字幕自動放到對的軌道；輸出的成片上直接按「送審與投遞」。不用再回素材庫找檔案。',
    gate: '舊的剪輯專案一筆不少、都能開、輸出設定不變；照上面的例子走一遍，每一步的成品自動出現在下一步。', risk: 'Medium', model: '設計 Fable；做 Opus', status: 'in_progress', depends: ['RV', 'RE'], before: '待決 5',
    decided: '2026-11-06 你決定鏡頭卡加一格「旁白」：AI 分鏡會一起寫，你也可以自己改；配音和字幕照它做。',
    what: '專案頁的「集」＝一支影片，底下掛剪輯檔、步驟紀錄、成片；舊剪輯專案原樣收進專案頁；工具做完自動寫回；來源改了標示要重做。等卡 RV.4 結束才動 projects-0.js',
    files: ['VW/docs/pj-project-spine-spec-20261106.md', 'VW/scripts/projects-0.js', 'VW/scripts/tools-editor.js', 'VW/scripts/tools-0.js'],
    items: [
      done('PJ.0', '四張卡的施工圖寫好了：每一集掛著剪輯檔、每一步的紀錄和成片；舊的剪輯專案原封不動收進專案頁。「旁白」那一題你已決定要加。', PJS),
      todo('PJ.1', '定好「每一步做了什麼」的紀錄格式；現有的剪輯專案自動收進專案頁，原檔不改。'),
      todo('PJ.2', '一集的畫面上有一排步驟，顯示還沒做、做好了、要重做；工具做完，成品自動掛回這一集。'),
      todo('PJ.3', '「排成時間軸」：照鏡頭順序與腳本秒數自動排好；配音、字幕自動放到對的軌道。'),
      todo('PJ.4', '前面的步驟改了，後面的步驟顯示「要重做」；每支成片可以看到它是怎麼做出來的。'),
    ] },
  { n: 17, code: 'FC', title: '專業剪輯（FilmCraft）', plain: '例：在應用工具按「專業剪輯」，選幾支素材，進到 FilmCraft 的完整剪輯畫面（修剪工具、三十多種轉場、調色曲線與色輪、混音器）。按存檔，專案存回工作台；按輸出，成片直接進素材庫與任務紀錄，不用下載再上傳。',
    gate: '送素材進去、存檔、關掉重開、輸出，成片在任務紀錄與素材庫都有，帶來源紀錄，送審檢查通過；沒有獨立顯示卡的電腦會先看到提醒。', risk: 'High', model: '建置可派工；頁面與入帳 Opus；上線等你同意', status: 'in_progress', depends: ['RE'], before: '待決 4',
    decided: '介面是英文、不跟站上的主題、裡面有下拉選單（引擎自己的畫面，改不了）。輸出最高 1080p；要 4K 或很長的片用一般剪輯。沒有獨立顯示卡的電腦會很卡，開啟前會提醒並可改用一般剪輯。',
    what: '建置鏈沿用 scripts/craft-web-build；外框頁用上游嵌入橋 ?host=parent 送檔、收存檔與輸出；輸出當成一筆已完成的任務，入帳與送審走現有路；主機靜態目錄＋nginx',
    files: ['VW/docs/engine-route-plan-20261106.md', 'scripts/filmcraft-pro/', 'VW/scripts/tools-engine-host.js', 'VW/scripts/tools-0.js', 'VW/backend/api.cjs', 'VW/backend/release-text.cjs', 'nginx/default.conf'],
    items: [
      done('FC.1', '建置完成：固定 FilmCraft 的版本、加繁中字型，一個指令建出可上線的檔案，跟向量版、畫布版共用同一套建置工具。審查時發現上游把 ArtCraft 的標誌編在程式裡，授權規定改過的版本要拿掉，已拿掉並加了自動檢查；已上線的向量版、畫布版查過沒有這個問題。', FC1),
      done('FC.0', '你到場確認過：播放有聲音、注音打得進中文、英文介面可以接受。視窗只用獨立顯示卡，全程沒有斷線。', FC1),
      done('FC.2', '應用工具多了「專業剪輯」：FilmCraft 嵌在工作台裡，素材從素材庫挑進去，存檔存回工作台、下次能重開；電腦沒有可用的獨立顯示卡時，開啟前先提醒，可改用一般剪輯。還沒上線（FC.4）。', 'dee7d0338'),
      done('FC.3', '專業剪輯的成片自動進任務紀錄與素材庫，記下用了哪些素材；字幕一起帶進送審。', 'e54d1c14e'),
      todo('FC.4', '上線到 video.aware-wave.com。要你說可以才做。'),
    ] },
  { n: 18, code: 'EC', title: '專業特效（EffectCraft）', plain: '例：在應用工具按「專業特效」，進到 EffectCraft 的完整畫面做片頭與特效（三百多個特效、曲線編輯器、表達式），做好的透明片段直接回到素材庫給剪輯用。',
    gate: '跟專業剪輯同一套流程在 EffectCraft 走通；重開專案時素材不會離線。', risk: 'High', model: 'Opus；上線等你同意', status: 'in_progress', depends: ['FC'],
    decided: '專業剪輯驗收過才開始。EffectCraft 複雜合成的預覽即使用獨立顯示卡也不到即時，適合做短的片頭與特效片段。',
    what: '建置鏈同 FC；另補嵌入橋補丁（照 scripts/photocraft-pro/web-host-api.patch 接 craft-web-host，上游已有就不補）；頁面與入帳沿用 FC 的外框與路由；重開後補 footage.relink',
    files: ['VW/docs/engine-route-plan-20261106.md', 'scripts/effectcraft-pro/'],
    items: [
      done('EC.1', 'EffectCraft 建置好了：固定版本、編入繁中字型、拿掉 ArtCraft 標誌；補上「成品交回工作台」的接口（上游沒有，自己補），實測存檔和輸出都直接交回、不下載。', 'b376094e5'),
      todo('EC.2', '「專業特效」頁：沿用專業剪輯的外框；重開專案時自動把素材接回來。'),
      todo('EC.3', '成片入帳與上線。上線要你說可以才做。'),
    ] },
];

// 操作者自己要決定或親手做的
export const OPEN = [
  { n: 1, before: 'RV', what: 'RV.4：部署工作台與 app（High），之後用 Runway 5 秒、一張小圖真打一次，約 US$0.25。要你說可以部署。', src: 'AGENTS §3' },
  { n: 4, before: 'FC', what: 'FC.4：把「專業剪輯」上線到 video.aware-wave.com（放引擎檔到主機、改 nginx、部署工作台）。要你說可以才做。', src: 'VW/docs/engine-route-plan-20261106.md §9 FC.4' },
  { n: 5, before: 'PJ', what: '分鏡靈感的六個受保護檔在 11-05 被改過（seedstar 參考改成員工限定、放上自家範例，都是你要的改動），但保護清單的指紋沒跟著更新，所以檢查一直是紅的。要接受現在的樣子當新的基準嗎？（不接受就要把那三次改動退回）', src: 'agency-os/WORKLOG.md 2026-11-06 續16；commits 31e89c479、1aaa139d5、de0e1836a' },
];
