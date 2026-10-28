// 影片工具重新設計 監工台 -- 唯一的狀態來源。改這裡 → `node build.mjs` → `node check.mjs` → 重新發布同一網址。
// 做法正本：VIDEO_TOOL_REDESIGN_2026-10-26.md §7（check.mjs 驗卡號一一對應）。這裡只放狀態與一行白話。

export const META = {
  title: '影片工具重新設計 監工台',
  updated: '2026-10-28',
  plan: 'agency-os/docs/video_generator/VIDEO_TOOL_REDESIGN_2026-10-26.md',
  req: 'agency-os/docs/video_generator/VIDEO_TOOL_OPERATOR_FINDINGS_2026-10-26.md',
  worklog: 'agency-os/WORKLOG.md 2026-10-28 續21–續25',
  self: 'agency-os/handoffs/2026-10-26-video-tool-supervisor/',
  url: 'https://claude.ai/artifact/ChAU93JZVbgkuptRpVYRdf',
};

export const COPY = {
  sub: '一支影片＝一個專案：客戶只選一次、關頁不丟、做完有結果頁，可選每步參與、④後自動或題目頁全自動。共 {total} 個階段、{items} 張卡，已完成 {itemsDone} 張。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '階段與卡片', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '已上線的修正，和還不能用的。' },
  steps: { h: '階段與卡片', lead: '依編號做；同組的階段改不同檔案，可同時做。風險 High 的卡套正式機前停下等你點頭。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '決定後，對應的階段才能開工。', none: '目前沒有要你決定的事。', count: '{n} 項', before: '要在 {n} 開工前決定', src: '出處' },
  paths: { h: '檔案', plan: '每張卡怎麼做', req: '你回報的問題', track: '紀錄', self: '本頁來源', howto: '改 data.mjs，執行 node build.mjs 和 node check.mjs，再重新發布同一個網址' },
  label: { yes: '可以', no: '還不行', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '建議模型', evidence: '完成的樣子', details: '工程細節', depends: '要先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時做：' },
};

// 現在真的能不能用（2026-10-28 查：正式機容器內有新程式、printenv 有字幕變數）
export const NOW = [
  { what: '技術 QA 不再把正常影片判成黑畫面', state: 'yes', ev: 'video-service 2026-10-26 已部署（40d4cd4e1）；正式容器內測試 8 OK' },
  { what: 'QA 沒通過會顯示中文原因', state: 'yes', ev: 'next-admin 2026-10-27 自動部署（40d4cd4e1）' },
  { what: '重新生成真的換圖、每個比例都換', state: 'yes', ev: '同上；圖庫素材會排除舊的那張' },
  { what: '動態預覽可捲動、有關閉鍵', state: 'yes', ev: '同上；尚待你在正式站看一眼' },
  { what: '字幕（Whisper）', state: 'no', ev: '主機設定已加（d62a2eee5），但字幕服務在筆電上，筆電沒開就不能用；快速影片改用腳本產字幕是 V4.6' },
  { what: '客戶只選一次、關頁不丟', state: 'yes', ev: 'V1 已推上 main（8e8f30c27），2026-10-29 台灣 03:00 自動部署後生效；資料庫 0138 已套用' },
  { what: '看成片的結果頁', state: 'yes', ev: 'V2 已推上 main（3459e3b32）：側欄 Video Projects；2026-10-29 台灣 03:00 部署後生效' },
  { what: 'QA 四項能全部通過、能建 Release', state: 'no', ev: 'V4 程式都在，但要做一支真實影片才知道；正式庫 Release 史上 0 筆' },
  { what: '發布不用填 JSON', state: 'yes', ev: 'V5 已推上 main（ad5a95745），2026-10-29 台灣 03:00 部署後生效；互動流程尚待你在正式站看一眼' },
  { what: '④ 後自動完成', state: 'yes', ev: 'V6 已推上 main（f74d16c86）；排程格預設關，要到客戶排程頁打開；尚未用真實影片走過一遍' },
];

const todo = (id, plain) => ({ id, plain, status: 'todo' });
const done = (id, plain, commit) => ({ id, plain, status: 'done', commit });
const V1 = '8e8f30c27';
const V2 = '3459e3b32';
const V34 = '9f6015039';
const V4A = '1a67f0052';
const V4B = '9fff275e6';
const V49 = '4a92e692e';
const V5 = 'ad5a95745';
const V6 = 'f74d16c86';
const V7 = '3b65d9e6a';

export const STEPS = [
  { n: 1, code: 'V1', group: 'A', title: '專案骨架', plain: '每支影片存成一個專案，客戶、腳本、比例都跟著走；腳本頁一顆鍵送去做影片。',
    gate: '腳本頁送出後影片頁不再問客戶；重整頁面停在同一步', risk: 'High（資料庫新欄位）', model: 'Opus 5.5', status: 'done', commit: V1, depends: [],
    waitFor: '程式 2026-10-29 台灣 03:00 自動部署後在正式站生效；資料庫已套用',
    what: 'migration 加專案欄位與 media_assets.media_project_id；projects API；腳本頁建專案；影片頁讀 ?project= 改 5 步',
    files: ['packages/db/migrations/', 'app/api/video/projects/route.ts', 'app/(shell)/tools/video/VideoPipeline.tsx', 'app/(shell)/tools/script-forge/ScriptForgePage.tsx'],
    items: [
      done('V1.1', '資料庫加專案欄位（自動化程度、來源、比例、錯誤原因），影片紀錄連到專案；舊的 4 筆測試資料封存', V1),
      done('V1.2', '專案 API 可查單一專案與它的影片，可存腳本、比例、自動化程度', V1),
      done('V1.3', '腳本頁兩顆送影片鍵併成一顆，送出就建專案並帶客戶；沒選客戶時按不了', V1),
      done('V1.4', '影片頁改 5 步、客戶只從專案來；第 1 步改成「腳本從哪來」，不再重複放 24 個模組', V1),
      done('V1.5', '做出來的影片記到它的專案', V1),
    ] },
  { n: 2, code: 'V2', group: 'B', title: '結果頁', plain: '所有影片（手動和題目頁自動）列在一頁，點進去能播每個比例、看 QA 和發到哪裡。',
    gate: '做一支影片後清單看得到，點進去兩個比例都能播', risk: 'Medium', model: 'Opus 5.5', status: 'done', commit: V2, depends: ['V1'],
    waitFor: '2026-10-29 台灣 03:00 自動部署後在正式站生效',
    what: '/tools/video/projects 清單與 /tools/video/projects/[id]；渲染完不自動跳步',
    files: ['app/(shell)/tools/video/projects/', 'app/sidebar-sections.ts', 'app/(shell)/tools/video/VideoPipeline.tsx'],
    items: [
      done('V2.1', '影片專案清單頁，側欄加入口', V2),
      done('V2.2', '單一專案頁：播放、下載、腳本、QA、Release、費用、繼續編輯', V2),
      done('V2.3', '影片做完停在成片畫面；「可以關閉頁面」改指專案頁；進階頁的生成記錄改連清單', V2),
    ] },
  { n: 3, code: 'V3', group: 'A', title: '腳本頁整理', plain: '多平台版本並存可選、照各平台規則改寫、送社群帶 hashtag；Remotion 改成加購片頭卡。',
    gate: '轉兩個平台後切回原版，送出的是原版；送社群草稿含 #', risk: 'Medium', model: 'Sonnet 5.5（卡已寫死）', status: 'done', commit: V34, depends: [],
    what: 'ScriptForge 版本並存；modules.ts 讀 limits.ts；Remotion 從模式移到第 2 步選項',
    files: ['app/(shell)/tools/video/ScriptForge.tsx', 'lib/script-forge/modules.ts', 'app/(shell)/tools/video/ModeSelectStep.tsx'],
    items: [
      done('V3.1', '原版和各平台版本並存，選一版當送出用，每版可複製', V1),
      done('V3.2', '平台改寫照各平台字數上限，並產出 hashtag', V1),
      done('V3.3', '送社群帶上 hashtag', V1),
      done('V3.4', 'Remotion 不再是製作模式，改成第 2 步「加片頭卡（6–22 秒）」', V34),
    ] },
  { n: 4, code: 'V4', group: 'B', title: 'QA 真能通過', plain: '每個比例各算一支成片；腳本、素材授權、字幕在做影片當下記好，四項 QA 才有可能全過。',
    gate: '一支 AI 生圖影片 QA 四項全綠', risk: 'Medium（含 video-service 部署）', model: 'Opus 5.5', status: 'in_progress', commit: V4B, depends: ['V1'],
    waitFor: '程式已 commit 未 push；video-service 部署等操作者 go-ahead，部署後在容器內跑測試並做一支 Edge 配音影片驗字幕句數',
    what: '一比例一列 media_assets；技術 QA 逐比例、failed 也入庫；metadata 記腳本與素材來源；Edge 配音時間點產字幕',
    files: ['lib/content/blocks/video-pipeline.ts', 'lib/content/video/qa-persistence.ts', 'apps/video-service/pipeline.py', 'apps/video-service/server.py', 'app/api/video/qa/editorial-rights/route.ts'],
    items: [
      done('V4.1', '每個比例存成一筆影片紀錄，清單只顯示一支；刪除時一起處理', V4A),
      done('V4.2', '技術 QA 每個比例各一份', V4A),
      done('V4.3', '技術 QA 沒過時也保留影片和原因，不整支丟掉', V4B),
      done('V4.4', '做影片時把腳本存進紀錄，編輯 QA 才找得到', V4A),
      done('V4.5', '取得素材當下記來源：AI 生圖、圖庫、自己上傳（上傳要勾「有權使用」）', V4A),
      done('V4.6', '快速影片字幕用腳本＋配音時間點產生，不用筆電', V4B),
      done('V4.7', '字幕步驟依影片種類自動選做法；快速影片顯示並可下載字幕', V4B),
      todo('V4.8', '改字幕後重燒：渲染時留一份無字幕底片，⑦ 逐句改字幕按「重燒字幕」，每個比例重做、品質檢查重跑'),
      done('V4.9', '上傳素材的「有權使用」改成上傳畫面上的勾選框，沒勾不能上傳；伺服器也擋', V49),
    ] },
  { n: 5, code: 'V5', group: 'C', title: '發布不填 JSON', plain: '勾平台、文案自動寫好可改、比例自動配對；WordPress 用選的。',
    gate: '勾 YouTube＋IG 得到兩個草稿，各自是 16:9 和 4:5', risk: 'Medium（外部寫入一律先成草稿）', model: 'Opus 5.5', status: 'done', commit: V5, depends: ['V4'],
    waitFor: '2026-10-29 台灣 03:00 自動部署後在正式站生效；沒有 migration',
    what: 'ReleaseDeliveryPanel 改結構化；社群走 savePost；WordPress 走 embedVideoInPost',
    files: ['app/(shell)/tools/video/ReleaseDeliveryPanel.tsx', 'lib/social/store.ts', 'lib/content/video/embed-in-post.ts'],
    items: [
      done('V5.1', 'QA 全過的比例一鍵建 Release，畫面不出現 SHA 或 UUID', V5),
      done('V5.2', '社群：勾已連的頻道，文案自動寫、可改，比例自動配平台，存成社群草稿', V5),
      done('V5.3', 'WordPress：選網站、選文章，嵌入影片', V5),
    ] },
  { n: 6, code: 'V6', group: 'C', title: '④ 後自動', plain: '按「生成並自動完成」後，字幕、QA、Release、社群草稿自己跑完；哪一步沒過就停下並寫原因。',
    gate: '按自動完成後關頁，回專案頁看到草稿，或看到停在哪一步和原因', risk: 'High（自動化，預設關）', model: 'Opus 5.5', status: 'done', commit: V6, depends: ['V4', 'V5'],
    waitFor: '部署後，到客戶的排程頁打開「影片做完自動完成」（預設關）才會動；先用一支測試影片走一遍',
    what: '排程器新 job video_project_advance（同一個每 5 分鐘時鐘）；生成鍵分兩顆',
    files: ['lib/schedules/jobs.ts', 'app/(shell)/tools/video/VideoStudio.tsx'],
    items: [
      done('V6.1', '排程每 5 分鐘把設成自動的專案往下推一步，沒過就停下記原因（排程格預設關）', V6),
      done('V6.2', '生成鍵分成「我要逐步審」和「生成並自動完成」', V6),
    ] },
  { n: 7, code: 'V7', group: 'B', title: '全自動接專案', plain: '題目頁自動做的影片也建成專案，出現在同一個結果頁。',
    gate: '題目頁做的影片出現在結果頁', risk: 'Medium', model: 'Sonnet 5.5（卡已寫死）', status: 'done', commit: V7, depends: ['V1', 'V2'],
    waitFor: '2026-10-29 台灣 03:00 自動部署後生效；下一支題目做影片時就會出現在結果頁',
    what: 'start.ts 開影片時建專案（source content_topic）',
    files: ['lib/content/video/start.ts', 'lib/content/topics/tick.ts'],
    items: [
      done('V7.1', '題目開始做影片時建一個專案，影片記到它', V7),
    ] },
];

export const OPEN = [];
