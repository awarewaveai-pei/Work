// 影音工作台監工台 -- 唯一的狀態來源。改這裡 → `node build.mjs` → `node check.mjs` → 重新發布同一網址。
// 做法正本：apps/video-workbench/docs/creative-suite-plan-20261102.md §4（check.mjs 驗卡號一一對應）；需求正本 handoff。這裡只放狀態與白話。

export const META = {
  title: '影音工作台監工台',
  updated: '2026-11-02',
  plan: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/creative-suite-plan-20261102.md',
  req: 'lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/handoff/Claude_Code_handoff_20261102.md',
  worklog: 'agency-os/WORKLOG.md 2026-11-02 續19–續45',
  self: 'agency-os/handoffs/2026-11-02-video-workbench-supervisor/',
  url: 'https://claude.ai/artifact/MCTZ7PAeZdGKRuvDxPquUd',
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
  { what: '剪輯能精確到影格、加減軌道、用多種轉場。', state: 'no', ev: '影格精確已完成（卡 M3）；加減軌道與更多轉場在卡 P2。' },
  { what: '輸出 720p 或 1080p 的 H.264 影片，含字幕與混音。', state: 'yes', ev: 'editor-export.cjs:182；比例有 16:9、9:16、1:1、4:5、4:3。' },
  { what: '動畫合成、2D 角色骨架、3D。', state: 'no', ev: '都還沒有。卡 P3、P4、P5 做。' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const C0 = '82d19db9e';
const M1 = 'ca4297f00';
const S3 = 'd6835f354';
const P0 = '3859d8c69';
const M3 = 'b52b2ac04';
const M2 = '2ab702e3f';

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
    gate: '建專案、編輯、保存、重開、輸出，成品成為素材並帶來源；舊編輯器仍可用。', risk: 'Medium', model: 'Opus', status: 'not_started', depends: ['P0', 'M3'],
    what: '路線 C（P0 定案）：延伸現有五軌編輯器，補 Remotion 片頭／動態字幕模板路徑（remotion-client.ts）',
    items: [
      todo('P1.1', '依 P0 路線接上引擎，或延伸自製編輯器。'),
      todo('P1.2', '存檔、重開、輸出閉環；成品回素材庫；測試。'),
    ] },
  { n: 8, code: 'P2', title: '完整剪輯', plain: '例：MOV、MP4、圖片、兩路音訊、字幕混在一起剪，加轉場、調色、音量正規化，輸出 4K。',
    gate: '混合素材成片；輸出自動檢查通過；響度在目標上下 1 LU 內、峰值不超過 −1 dBTP。', risk: 'Medium', model: 'Opus；子卡 Codex', status: 'not_started', depends: ['P1'],
    what: '增刪軌、影格裁切、xfade、調色＋bt709、多路混音、峰值表、可設定響度（預設 -16）、SRT／VTT、五比例＋4K、投遞比例讀主系統',
    items: [
      todo('P2.1', '可增減軌道、精確裁切、多種轉場。'),
      todo('P2.2', '調色（曝光、對比、白平衡、飽和、LUT）與 4K 輸出。'),
      todo('P2.3', '多路混音、音量關鍵影格、響度正規化。'),
      todo('P2.4', 'SRT、VTT 字幕匯入匯出，時間重疊也處理；測試。'),
    ] },
  { n: 9, code: 'P3', title: '2D 動畫合成', plain: '例：做一個片頭，標題緩緩放大、遮罩擦出、字幕逐字亮起；把去背圖拼在一起當參考圖。',
    gate: '可改的片頭含緩動、遮罩、混合；逐字字幕預覽與輸出同一格；透明成果回時間軸再回來改。', risk: 'Medium', model: '方向 Fable；做 Opus', status: 'not_started', depends: ['P2'],
    what: '圖層、2D 變形、遮罩、關鍵影格、曲線、受限表達式、特效、動態字幕（字詞時間用主系統本機 whisper）、拼貼＝圖層',
    items: [
      todo('P3.1', '圖層、遮罩、關鍵影格、曲線。'),
      todo('P3.2', '動態字幕與逐字高亮，字詞時間用本機語音辨識，免費。'),
      todo('P3.3', '拼貼構圖匯出成參考圖；測試。'),
    ] },
  { n: 10, code: 'P4', title: '2D 角色骨架', plain: '例：把角色分成身體、上臂、前臂、手掌，做揮手動作；擺好姿勢後匯出姿勢圖，生成時當參考。',
    gate: '揮手動作保存重開可改；同角色兩個姿勢各生成一次，留比對截圖。', risk: 'Medium', model: '方向 Fable；做 Opus', status: 'not_started', depends: ['P3'],
    what: 'A 肢體綁定 → B Puppet → C 骨骼鏈、IK、權重；姿勢存角色下',
    items: [
      todo('P4.1', '肢體綁定與揮手動作。'),
      todo('P4.2', '骨骼鏈與反向運動：拉手掌，手臂跟著動。'),
      todo('P4.3', '姿勢圖匯出給生成用；測試。'),
    ] },
  { n: 11, code: 'P5', title: '3D', plain: '例：3D 角色綁好骨架、套上一段動作、轉鏡頭打燈，渲染成透明片段放回剪輯；一張物件圖轉成 3D 模型。',
    gate: '先過 3D 試驗（Blender 背景處理＋瀏覽器檢視器）；角色套用動作後保存重開可改，並渲染回專案。', risk: 'Medium', model: '試驗與設計 Fable；做 Opus', status: 'not_started', depends: ['P4'],
    decided: '圖片轉 3D 只考慮 Meshy（美國）；Rodin 屬上海公司，排除。',
    what: 'P5.0 閘門：GLB 進出不丟骨架、建骨→蒙皮→IK→重定向→RGBA 序列；過了才做 3D 工作區與 Blender 任務',
    items: [
      todo('P5.1', '3D 試驗：骨架、蒙皮、擺姿、套用動作、渲染回剪輯。'),
      todo('P5.2', '3D 工作區：檢視器、鏡頭、燈光。'),
      todo('P5.3', '圖片轉 3D（Meshy）；測試。'),
    ] },
  { n: 12, code: 'P6', title: '上線 video.aware-wave.com', plain: '例：員工登入 video.aware-wave.com 做好一支片，一鍵送到 Postiz 和 WordPress 成為草稿。',
    gate: '部署測試全綠；一支成品從工作台到 Postiz 草稿與 WordPress 草稿全程通。', risk: 'High', model: 'Fable 規劃；Opus 執行', status: 'not_started', depends: ['P5'], before: '待決 1',
    what: 'compose 服務＋七項清單；素材帳冊→media_assets（補組織欄、R2 搬移）；任務新表；1:1 與 4:3 需 migration（High）；許可 can()；QA→release→delivery',
    items: [
      todo('P6.1', '服務部署，登入接主系統。'),
      todo('P6.2', '素材與任務搬進主系統資料庫，檔案搬到雲端儲存。'),
      todo('P6.3', '成品經品質檢查送 Postiz 與 WordPress；內部名稱改掉。'),
    ] },
];

// 操作者自己要決定或親手做的
export const OPEN = [
  { n: 1, before: 'P6', what: '上線部署是 High 風險，要你同意才執行。', src: 'AGENTS §3' },
];
