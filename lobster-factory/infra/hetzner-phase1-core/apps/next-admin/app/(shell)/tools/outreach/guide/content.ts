// Guide copy drafted by GPT (codex-oracle, 2026-11-06); facts re-checked against the outreach pages.
export type GuideStep = { do: string; where: string; example: string };
export type GuideSection = { id: string; title: string; steps: GuideStep[] };

export const INTRO = "依序設定寄件信箱、建立名單、審核信件，再到 Gmail 寄出並查看成效。";

export const SECTIONS: GuideSection[] = [
  { id: "s0", title: "先設定", steps: [
    { do: "按「操作客戶」選擇這次要替哪個組織作業。", where: "每頁頂端的「操作客戶」按鈕", example: "選「自用」，代表替 AwareWave 自己作業。" },
    { do: "確認 Gmail 寄件信箱已連線。", where: "側欄「Connectors」", example: "主信箱 awarewaveai@gmail.com 已連線，目前使用草稿模式。" },
    { do: "設定服務檔、禁用詞、拒收名單與同步規則。", where: "側欄「Outreach Settings」", example: "服務檔寫明賣什麼、給誰、賣點與語氣。" },
    { do: "了解寄件信箱的每日上限。", where: "目前由系統設定，頁面上沒有調整按鈕；要改請告訴工程師", example: "主信箱目前每天上限為 100 封。" },
  ] },
  { id: "s1", title: "找名單", steps: [
    { do: "填寫「找什麼」與「地區」，再按「找名單」。", where: "側欄「Lead Inbox」的「找名單（地圖上的店家）」", example: "找什麼填「瑜珈教室」、地區填「台中市」；一次最多 20 家、費用最多約 NT$0.10，沒有網站也沒有電話的店家不會加入。" },
    { do: "搜尋營業項目、點選項目與縣市，再按「找公司」。", where: "側欄「Lead Inbox」的「找公司（經濟部商工登記）」", example: "輸入營業項目文字後按「搜尋營業項目」，點一個 F 開頭的項目（僅開放零售、批發、餐飲），再點縣市；一次最多 100 家，附負責人姓名，系統會逐家搜尋官網，每次費用最多約 NT$4。經濟部不提供 email、電話與網站。" },
    { do: "職稱或 Instagram 關鍵字至少填一項，再搜尋公開的個人簡介。", where: "側欄「Lead Inbox」的「找人（搜尋引擎公開的個人簡介）」", example: "職稱填「行銷經理」，縣市填「台中市」；一次最多 20 位、費用最多約 NT$0.13，只讀搜尋結果的標題與摘要，不打開社群頁。摘要裡有 email 才會填入。" },
    { do: "貼上手上已有的一個人的資料，並寫一句資料來源。", where: "側欄「Lead Inbox」的「貼上個人資料」", example: "填姓名、個人頁網址，以及「來自公開的公司團隊頁」。" },
    { do: "匯入 Meta 名單廣告表單匯出的 CSV。", where: "側欄「Lead Inbox」的「匯入 META 名單 CSV」", example: "匯入後直接成為暖名單並同步 FluentCRM，不會收到開發信。" },
    { do: "需要時改用手動新增一筆，或批次匯入。", where: "側欄「Lead Inbox」的「手動新增一筆」或「批次匯入（JSON 陣列）」", example: "手上只有一家店的資料時，用「手動新增一筆」。" },
    { do: "搜尋完畢後，隔一兩個月再按「從頭再搜」。", where: "側欄「Lead Inbox」的「從頭再搜」", example: "同樣條件再搜會接續上次的進度；找完會顯示已找完，按「從頭再搜」可撈新開的店。" },
  ] },
  { id: "s2", title: "審核名單", steps: [
    { do: "逐筆查看收件匣名單，決定核准或刪除。", where: "側欄「Lead Inbox」下方的「收件匣」清單", example: "資料可用就按「Approve → Leads」，不要就按「刪除」；已在名單或收件匣的資料會標為 suspected_dup（重複）。" },
  ] },
  { id: "s3", title: "補 email 與研究", steps: [
    { do: "按「研究這家」，讓 AI 讀對方的網站與社群。", where: "側欄「Leads」的「研究這家」", example: "系統最多讀對方網站 15 頁與 IG／FB，每條事實附來源網址與原文；研究時也會自動填入對方網域的 email，並先查網域收不收信。" },
    { do: "查看未自動核准的研究事實。", where: "側欄「Leads」", example: "數字、星期、否定內容與原文一致才會自動核准，其餘留給你查看。" },
    { do: "沒有官網時，填公司網域並按「找 email」。", where: "側欄「Lead Inbox」底部的「找 email」", example: "網域填 acme.com。寄信前會用免費額度驗證 email：Reoon 每天 20、ZeroBounce 每月 100、Hunter 每月 50；店家自己公開的地址免驗。" },
  ] },
  { id: "s4", title: "設定自動管線", steps: [
    { do: "選擇自動化程度。", where: "側欄「Outreach Settings」的服務檔頁，按「手動」、「半自動」或「全自動」", example: "選「半自動」，系統抽 10% 的信給你看；選「全自動」則抽 2%。" },
    { do: "不需操作，系統每 10 分鐘自動處理一輪。", where: "背景自動執行；被抽中的信到「Message Review」看", example: "依序：研究、寫信（每封有主旨、署名、A／B 兩版與追蹤信）、事實核對（判兩次，不一致再判第三次取多數）、依自動化程度抽查、建立 Gmail 草稿；到期的追蹤信也會建草稿。" },
  ] },
  { id: "s5", title: "審核信件", steps: [
    { do: "比較 A／B 兩版，核准其中一版。", where: "側欄「Message Review」", example: "核准 A 版後，B 版會自動跳過。" },
  ] },
  { id: "s6", title: "寄出信件", steps: [
    { do: "打開草稿並按寄出。", where: "Gmail 的草稿匣", example: "目前是草稿模式，系統只建立草稿，不會自己寄；由你在 Gmail 按「寄出」。" },
  ] },
  { id: "s7", title: "查看追蹤信", steps: [
    { do: "查看已到期的追蹤信。", where: "側欄「Follow-ups」", example: "追蹤信到期時，系統會建立 Gmail 草稿，同樣由你按寄出。" },
  ] },
  { id: "s8", title: "處理回信", steps: [
    { do: "查看系統收進並分類的回信。", where: "側欄「Replies」", example: "對方回信每 10 分鐘自動收進來並分類（例：想多了解），名單變成已回覆，後續追蹤信全部停止。" },
    { do: "對方要求不要再寄時，確認已停寄。", where: "側欄「Replies」", example: "對方回「請不要再寄」，系統會永久停止寄信給此人。" },
  ] },
  { id: "s9", title: "看成效", steps: [
    { do: "依服務、版本與切角查看成效。", where: "側欄「Outreach Dashboard」", example: "表中有寄出、退信、回覆、正向、會議、成交與回覆率，可下載 CSV；沒有開信率。" },
  ] },
  { id: "s10", title: "看花費", steps: [
    { do: "查看外聯花費與免費額度用量。", where: "側欄「AI MODELS & COSTS」→「AI Costs」", example: "AI 使用平台免費的 Gemini，每天上限 500 次，每封信約用 5 次，所以一天最多約 100 封。" },
  ] },
];

export const FAQ: Array<{ q: string; a: string }> = [
  { q: "為什麼一天寄不到 100 封？", a: "100 封是寄件信箱目前的每日上限。免費額度用完或可用名單不夠時，實際數量會更少。" },
  { q: "為什麼找不到 email？", a: "經濟部資料不提供 email、電話與網站；小公司若沒有官網，也可能查不到可用的 email。" },
  { q: "同樣條件再搜，會重複付費嗎？", a: "不會。系統會接續上次停下的位置；找完會顯示已找完，要重新開始再按「從頭再搜」。" },
  { q: "草稿模式是什麼？", a: "系統只在 Gmail 建立草稿，不會自己寄信。你要到 Gmail 草稿匣按「寄出」。" },
  { q: "怎麼停寄某人？", a: "到側欄「Outreach Settings」的 Suppression 拒收名單加入此人。對方回信要求不要再寄時，系統也會永久停寄。" },
];

export const PRIVACY = "個人資料及經濟部登記的負責人姓名都屬於個資。若 email 不是對方自己公開的，第一封信會自動附上資料來源與要求刪除的說明。";
