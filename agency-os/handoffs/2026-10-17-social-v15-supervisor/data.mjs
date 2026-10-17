// 社群發文 V1.5 監工台 -- 唯一的狀態來源。改這裡，然後 `node build.mjs` 重生 supervisor.html，`node check.mjs` 驗規則。
// 事實的正本：PLAN.md §1b（每張卡怎麼做）、ADR 016 §5（操作者定案 1–6）。這裡只放「狀態」與「白話」，不重述做法。

export const META = {
  title: '社群發文 監工台',
  updated: '2026-10-17',
  plan: 'lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md',
  adr: 'agency-os/docs/architecture/decisions/016-social-manager-third-product.md',
  mock: 'lobster-factory/docs/social/mockups/social-manager-mock.html',
  tasks: 'agency-os/TASKS.md「社群管理平台 V1」',
  worklog: 'agency-os/WORKLOG.md 2026-10-17',
  self: 'agency-os/handoffs/2026-10-17-social-v15-supervisor/',
  url: 'https://claude.ai/artifact/R5rPFgHj5uuRfiWeSbr8h9',
};

// 頁面上所有固定文字（不含資料列）。{x} 由 build.mjs 代入算出來的值。
export const COPY = {
  sub: '把定案的新畫面做進 social.aware-wave.com。共 {total} 張卡，一張一個工作階段。',
  updated: '更新於 {date}',
  nav: { now: '現況', steps: '待建項目', open: '待你決定', paths: '檔案' },
  now: { h: '現況', lead: '目前的版本可以發文。新畫面已定案，還沒做進產品。' },
  steps: { h: '待建項目', lead: '依編號順序做。同一組的卡可以同時做，因為改的檔案不重疊。風險 High 的卡要你同意才動工。', count: '{done}／{total} 完成' },
  open: { h: '待你決定', lead: '這幾件決定後，對應的卡才能開工。', none: '目前沒有要你決定的事。', count: '{n} 項', before: '要在 {code} 開工前決定', src: '出處' },
  paths: { h: '檔案', plan: '每張卡怎麼做', adr: '你定案的版面', mock: '樣稿（規格）', track: '追蹤', self: '本頁來源', howto: '改 data.mjs，執行 node build.mjs 和 node check.mjs，再重新發布同一個網址' },
  label: { yes: '有', no: '還沒有', todo: '未開始', doing: '進行中', done: '已完成', risk: '風險', who: '負責', evidence: '完成條件', details: '工程細節', depends: '要先完成', none: '無', files: '檔案', card: '做法', doneAt: '完成於', decided: '你的決定', group: '可同時做：' },
};

// 現在真的在跑的（2026-10-17 查）
export const NOW = [
  { what: '可以發文', state: 'yes', ev: 'social.aware-wave.com 上線中（PLAN.md C12）；是舊版畫面' },
  { what: '新畫面定案', state: 'yes', ev: '樣稿第 16 版；ADR 016 §5 操作者定案 1–6（commit 0755e32ab）' },
  { what: '數據分析有真數字', state: 'no', ev: '要先查 Postiz 有沒有分析資料可拿（C24 第一步）' },
  { what: '留言自動回覆真的會動作', state: 'no', ev: '要等 Meta 審核通過（TASKS.md「Postiz Task 2 OAuth app 審核」）' },
];

// PLAN.md §1b 的卡，依開工順序編號。status: not_started | in_progress | done；done 必填 commit。
// depends 用卡號（code），必須跟 PLAN.md 卡片標題括號裡的「Cxx 之後」一致（check.mjs 驗）。
export const STEPS = [
  { n: 1, code: 'C20', group: 'A', plain: '先在資料庫開好新功能要用的欄位：頻道照片、標籤、多則留言、週期性安排、自動回覆、智慧連結、數據、報表。', title: '資料表 0105', gate: '拋棄式資料庫套用、還原、再套用都成功；資料庫審查通過；測試全綠；不碰正式資料庫', risk: 'High（資料庫結構）', model: 'Opus 5.5', status: 'not_started', depends: [] },
  { n: 2, code: 'C19', group: 'B', plain: '畫面換成定案的樣子：上面六區、左邊頻道清單、日曆上方一列工具；建立貼文改成一整頁。', title: '骨架與路由', gate: '六區和六個分頁都能點；按「建立貼文」進到整頁再回日曆；檢查樣稿每個頁面在產品裡都有', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C20'] },
  { n: 3, code: 'C21', group: 'C', plain: '建立貼文的整頁：左邊選頻道、中間寫、右邊看各平台預覽；可以加多則留言、標籤、週期性安排和這則的自動回覆。', title: '撰寫頁', gate: '寫一則、加兩則留言、設定行程，回日曆看到它；截圖跟樣稿同一頁比對', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C19', 'C20'] },
  { n: 4, code: 'C22', group: 'C', plain: '日曆卡片有縮圖和標籤顏色，看得到現在時間和最佳發布時間；可以篩選、一次處理多則、看誰刪了哪則。', title: '日曆、卡片、清單、已刪除、篩選', gate: '勾兩則按「批次動作」送審，狀態跟著變；截圖跟樣稿比對', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['C19', 'C20'] },
  { n: 5, code: 'C26', group: 'C', plain: '一個放在個人簡介的連結頁，列出官網和報名表，看得到每個連結被點了幾次。', title: '智慧連結', gate: '加一個連結，公開頁看得到，點一下次數加一', risk: 'Medium（公開頁）', model: 'Opus 5.5', status: 'not_started', depends: ['C19', 'C20'], decided: '網址 social.aware-wave.com/smartlink/名字（你 2026-10-17 定）' },
  { n: 6, code: 'C29', group: 'C', plain: '看每個頻道有幾則留言和私訊還沒讀，一鍵打開客服收件匣。', title: '訊息收件匣', gate: '每個頻道的未讀數跟 Chatwoot 一樣', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['C19', 'C20'] },
  { n: 7, code: 'C23', group: 'D', plain: '自動發布清單用「星期 × 時間」的方格點選要發的時段。', title: '自動發布清單方格', gate: '三個時段跨兩天，系統排出的貼文順序正確；舊清單照常發', risk: 'Medium（改既有排程資料）', model: 'Opus 5.5', status: 'not_started', depends: ['C20', 'C21'] },
  { n: 8, code: 'C24', group: 'D', plain: '看每個頻道的追蹤者、觸及、互動和趨勢，以及哪則貼文表現最好。', title: '數據分析', gate: '一個頻道的一天數字寫進資料庫並顯示在頁面；沒有的數字寫明原因，不填假數字', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C19', 'C20'] },
  { n: 9, code: 'C27', group: 'D', plain: '有人留言或私訊某些字就自動回覆。品牌有通用規則，單則貼文可以另外設，單則的優先。', title: '自動化流程', gate: '規則比對測試通過（單則優先、關鍵字、平台）；真的回覆要等 Meta 審核', risk: 'High（代替品牌回覆客人）', model: 'Opus 5.5', status: 'not_started', depends: ['C20', 'C21'], waitFor: '真的回覆要等 Meta 審核' },
  { n: 10, code: 'C31', group: 'D', plain: '可以上傳影片、選封面、排列和裁切多張圖片；素材庫可以存整則貼文。', title: '媒體與影片', gate: '上傳 3 秒影片，預覽後排程成功', risk: 'Medium', model: 'Opus 5.5', status: 'not_started', depends: ['C21'] },
  { n: 11, code: 'C30', group: 'D', plain: '手機上也能看日曆和寫貼文，畫面不會被切掉。', title: '手機', gate: '每一頁在 390 寬的手機上都不會左右捲動', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['C19', 'C21', 'C22'] },
  { n: 12, code: 'C25', group: 'E', plain: '選頻道和期間，產生有品牌 logo 和顏色的報表；可以每月自動寄給客戶。', title: '報表管理', gate: '產生一份報表並存成 PDF，版面正確', risk: 'Low', model: 'Sonnet 5.5', status: 'not_started', depends: ['C24'], decided: '先只做 PDF；PPT、Excel 下一版（你 2026-10-17 定）' },
  { n: 13, code: 'C28', group: 'E', plain: '看 Meta 和 Google 廣告的花費與成效，可以暫停或繼續廣告。', title: '廣告管理', gate: '花費和點擊跟廣告後台一樣；暫停後廣告後台也顯示暫停', risk: 'High（動到廣告花費）', model: 'Sonnet 5.5', status: 'not_started', depends: ['C19', 'C20'], waitFor: '要等 Meta 廣告權限審核' },
];

// 操作者自己要決定的（agent 不能替她定）
export const OPEN = [];
