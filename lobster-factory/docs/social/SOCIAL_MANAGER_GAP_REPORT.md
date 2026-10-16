# 社群管理平台 — 缺失與遺漏盤點（對照 Postiz v2.25 / Metricool）

> 建立 2026-10-16。操作者：「可以發文了，但功能不齊全，UI/UX 非常醜，去看 Postiz 和 Metricool 自己缺什麼」。
> 本檔 = 現況 vs. 兩個參考品的**畫面層**差距，是下一批卡的 SSOT。功能總表仍是 [`SOCIAL_MANAGER_FEATURE_MATRIX.md`](SOCIAL_MANAGER_FEATURE_MATRIX.md)（本檔只引列名，不重抄）；執行計畫仍是 [`SOCIAL_MANAGER_PLAN.md`](SOCIAL_MANAGER_PLAN.md)。
> 路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/social/`，除非另寫。
> 參考品事實來源：Postiz 原始碼 `github.com/gitroomhq/postiz-app/apps/frontend/src/components/`（`PZ/`）＋ `docs.postiz.com`；Metricool `help.metricool.com`（`MH/`）＋ `metricool.com`（`MW/`）。Metricool 無原始碼，畫面細節多為 help 文字推得。

## 0. 結論（三行）

1. **建版 = 樣稿 1:1**（`mockups/social-manager-mock.html` 第 13 版 vs. 實際 render，見 §1）。所以「醜」在**設計本身**，不是實作走樣：chip 堆疊、沒有縮圖、沒有頭像、卡片 40px、所有控制同一粗細——改 CSS 不會好，要**重做版面規格**（§2 U1–U6）。
2. 功能缺口集中在**編輯器**（影片、串文、平台設定、hashtag／emoji／mention、圖片裁切）和**行事曆卡片**（縮圖、頭像、hover 動作、顯示密度）；審核、輪播、紀錄、成員這些「後台」反而比 Postiz 完整（§3）。
3. **手機版壞掉**（390px：週格擠成 7 欄各 ~28px、側欄佔 2/3、頁高 2543px；render `12-mobile-week.png`）。ADR 016 §5 說「手機 RWD」，`social.css:128` 只有 1100px 一個斷點。

## 1. 證據：怎麼看的

| 證據 | 做法 | 位置 |
|---|---|---|
| 每個檢視的真實 render（1280×660 ＋ 390 寬，12 張） | `node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs <outDir>`，對 `next-admin-social-ui`（port 3902，無 Supabase）跑 Playwright，API 由腳本內假資料回答（8 則各狀態貼文、3 帳號含一個失效、1 清單、3 媒體、紀錄 3 筆） | 腳本進 repo；輸出不進 git（`$env:TEMP`） |
| 樣稿 render | 同腳本 `--mock`，對 `social-mocks`（port 8766）同尺寸截圖 | 同上 |
| 程式碼 | 整檔讀：`SocialManager.tsx`、`Editor.tsx`、`Calendar.tsx`、`Settings.tsx`、`MediaView.tsx`、`Lists.tsx`、`Review.tsx`、`ArticleSource.tsx`、`social.css`、`model.ts`、`api.ts`；`lib/social/compose.ts`、`limits.ts`；`packages/db/migrations/0096_social_manager.sql` | — |
| 參考品（文字） | web-researcher 一輪（Postiz 讀原始碼檔案路徑；Metricool 讀 help），UNVERIFIED 項已剔除或標註（§5） | 本檔各列 |
| 參考品（**親眼看**，2026-10-16 補） | 內建瀏覽器設 1440×900：操作者登入的自架 Postiz v2.25.1（`postiz.aware-wave.com/launches`）與操作者的 Metricool 帳號（`app.metricool.com/planner`）；打開「建立貼文」、選頻道、打字看預覽，未存檔即關閉（Postiz「Yes, close it!」丟棄；Metricool Close）。另截 Metricool 官網／help 的產品圖（帳號內無貼文，卡片樣子用官網圖） | §1.1 |

### 1.1 親眼看到的（取代 §2 裡只靠文字推的部分）

| 畫面 | Postiz（自架，暗色） | Metricool（亮色） | 我們 |
|---|---|---|---|
| 外框 | 左邊細欄 icon（Calendar／Agent／Analytics／Media／Settings），左第二欄「Channels」頻道頭像清單＋Add Channel＋紫色 Create Post | 頂部深色橫列（Analytics／Reporting／Inbox／Planning／SmartLinks／Ads），下一列分頁（Calendar／List／Posts library／Autolists／Deleted posts） | 員工側欄＋頁首一排 chip |
| 行事曆工具列 | 一列：日期區間＋Today、右邊 Filter icon、Day／Week／Month 分段、日曆／清單 icon | 一列：Search、This week、日期區間、Filter icon、⋮、Best times、頻道選擇、Create view、「＋ Create post」 | 三列：日期＋7 個檢視鈕、平台 chip、7 個狀態 chip＋搜尋（U2） |
| 行事曆本體 | 週格斜紋＝過去；已發佈卡片＝綠框＋頂部紫色條＋頻道頭像 | 格子以深淺藍標「最佳發文時段」；官網卡片＝大圖＋標題＋兩行文字＋平台 icon＋時間 | 卡片 40px，三個字（U3） |
| 寫貼文 | 全螢幕彈窗：左邊編輯、**右邊整欄預覽一直在**；上方頻道頭像（點了才選）、下一列「地球＝共用」＋每頻道小頭像分頁；切到頻道分頁時文字框**鎖住**，按「Edit content」才另寫 | 彈窗：上方平台 icon＋格式下拉（POST／REEL）＋「＋」；**一個大文字框**，框內底部一排小 icon（圖、檔案、表情、留言、連結、AI、常用文字）＋右下字數；預覽按「Show preview」**換掉**編輯區，有手機／電腦切換 | 文字框 72px，四周約 15 個 chip（U5） |
| 平台設定 | 文字框下方紫色「Settings」橫條，展開是該頻道專屬（Bluesky＝串文結尾開關） | 文字框下方摺疊列「Global presets」「LinkedIn presets」… | 「格式」chip 只有 IG／FB（F3） |
| 預覽 | 名稱＋handle＋藍勾＋頭像，共用模式顯示「Global Edit」 | 真頭像、名稱、追蹤數、時間、**讚／留言／分享／傳送列**（LinkedIn） | 190px 通用卡、空頭像（U4） |
| 底部 | 左：Add New Tag、Repeat Post Every…；右：日期、Save as draft、主按鈕「Add to Calendar ▾」（沒選頻道時寫「Check the circles above」） | 左：Cancel；右：日期、「Schedule ▾」（下拉：存草稿／送審／排程／立即發佈） | 原生日期＋時間＋四顆並排鈕（U6） |
| 共同點 | **一個大文字框＋框內一排小 icon；其餘選項收進摺疊列或下拉**；主動作只有一顆鈕，其他收進它的下拉 | 同左 | 所有選項攤開成 chip |

結論不變（U1–U6 成立），但修正兩處：U5 的「三層」改為「頻道列＋大文字框（icon 在框內）＋摺疊的平台設定」；預覽兩種做法都可（Postiz 並排、Metricool 切換），我們一屏 1280 寬應走 Postiz 的並排。

正式站 `social.aware-wave.com` 要登入，本次沒有登入；render 走 `/tools/social`（含員工側欄），`/social` 門是同一個 `SocialApp`（`app/social/page.tsx:2`），差別只有外殼。

## 2. UI/UX 缺陷（U）——「醜」拆成可改的項目

每列：現況（file:line）→ 參考品怎麼做（來源）→ 修法方向。U1–U6 是版面規格層，要一起重做；U7 起可單獨修。

| # | 現況 | 參考品 | 修法方向 |
|---|---|---|---|
| U1 | **所有控制都是 chip**：品牌、檢視、平台篩選、狀態篩選、帳號、預覽切換、裝置、折疊區、格式、清單、時間模式全是同一種圓角按鈕（`social.css:7–13`、`:33–36`）；一屏約 60 個 chip，沒有層級 | Postiz：頻道是**頭像圓圈**（灰階→彩色邊框，`PZ/new-launch/picks.socials.component.tsx`）；篩選收在一個 FilterIcon 按鈕＋面板（`PZ/launches/filters.tsx`）。Metricool：篩選鈕顯示已啟用數，選完按 Apply（`MH/…how-to-manage-your-calendar…qnhwu5`） | 區分三種控制：主要動作（實心）／切換（分段控制）／篩選（收進一個按鈕＋面板）。chip 只留「值」不留「動作」 |
| U2 | **篩選列佔 3 行 ≈ 90px**（平台 chip ＋ 7 個狀態 chip ＋ 搜尋，`SocialManager.tsx:244–262`），660px 高的一屏裡行事曆只剩 ~400px | Postiz／Metricool 篩選都是一個按鈕；Metricool 另有 Condensed／Normal／Expanded 縮放 | 篩選收成一顆按鈕＋計數；狀態色改成卡片本身的色條（已有），不需每次顯示圖例 |
| U3 | **週格卡片 40px、每小時 28px**（`social.css:41`、`:51`；`Calendar.tsx:13`），卡片只剩「10:00 B 本週…」三個字；00:00–23:00 全列，初始捲到 08:00（`Calendar.tsx:57`） | Postiz：卡片上有 24px tag 色條、20px 頭像、平台 icon、去 HTML 內文，hover 出 Preview／Duplicate／Delete／Statistics（`PZ/launches/calendar.tsx`）。Metricool：卡片有網路 icon＋貼文類型 icon（Post／Reel／Story），hover 顯示類型＋狀態＋時間 | 週檢視改「每日一欄、卡片依序堆疊」（不按分鐘定位），卡片含**縮圖**、頭像、兩行文字、時間；深夜時段折疊 |
| U4 | **預覽不像平台**：一張通用卡 190px 寬（`social.css:111`），空圓頭像（`Editor.tsx:366`；`social_accounts` 沒有 `picture` 欄，`0096:57` 只有 `label`），圖固定 3:2／16:9（`:115–116`），文字夾 4 行（`:117`），只顯示第一張圖（`Editor.tsx:367`），沒有讚／留言列、沒有時間戳、沒有手機外框 | Postiz：Instagram／YouTube／LinkedIn 各有專屬預覽（平台底色、icon 列、互動列；數字寫死），general 預覽是 X 風格 40px 頭像＋名稱＋handle＋媒體格＋串文連線（`PZ/launches/general.preview.component.tsx`、`providers/*/…preview.tsx`）；超限文字包紅底 `mark`。Metricool：FB feed／Reel／Story、IG Post／Story／Reel／carousel、LinkedIn 文件輪播、YT 可播放（`MW/social-media-preview-metricool/`） | 每平台一個預覽元件（先 Bluesky／FB／IG／Threads／LinkedIn），吃 Postiz integration 的 `picture`（`lib/content/postiz.ts:81` 已有 → 存進 `social_accounts`），多圖輪播點點、超限紅底 |
| U5 | **編輯區擠**：textarea 最小 72px（`social.css:103`），下面是計數、4 個折疊 chip、格式、另寫、媒體、備註全部堆在同一欄（`Editor.tsx:281–353`）；標籤用「發到」「媒體」等 2 字 inline label | Postiz：編輯器卡 `rounded-[12px]`，工具列在文字框底（Bold／Underline／連結／emoji／附件／簽名），頻道分頁在上（Global icon ＋ 每頻道頭像 tab），設定在右欄（`PZ/new-launch/editor.tsx`、`select.current.tsx`）。Metricool：文字框下一排 icon（AI／saved texts／備註／第一則留言／連結／媒體），「Edit by network」分頁列 Template ＋ 每網路一頁（`MH/multiposting-edit-per-social-network-85out`） | 編輯器改三層：① 頻道 tab 列（Global ＋ 每帳號頭像；已另寫的 tab 有點）② 大文字框＋底部 icon 工具列 ③ 平台設定面板（依 tab 切換）。附加欄位（第一則留言、連結、alt、備註）從 chip 折疊改為 icon 開啟的區塊 |
| U6 | **原生 `<input type=date/time>`**（`Editor.tsx:386–387`、`Review.tsx:63–64`、`Lists.tsx:142`）：Windows Chrome 畫成「2026/10/17 📅」「下午 12:00 🕒」，和其餘控制不同風格；時間列和四顆動作鈕擠在同一 footer（`social.css:118–121`） | Postiz：`DatePicker` 元件在底部列，主按鈕依狀態換字（Add to calendar／Schedule／Update），hover 展開 Post Now（`PZ/new-launch/manage.modal.tsx`） | 自製日期時間選擇（主題 token），主按鈕依狀態換字；「立即發佈」收進主按鈕的次選單 |
| U7 | **月檢視**每格只有「10:00 …」＋截斷文字，無平台 icon、無縮圖、無每日計數，空格沒有「＋」（`Calendar.tsx:112`） | Postiz：每格最多 3 張卡＋「+ Show more (N)」，未來格 hover 出「+」，過去格斜紋不可點（`PZ/launches/calendar.tsx`） | 月格顯示頭像列＋計數，hover「＋」，過去格斜紋 |
| U8 | **媒體庫**只有縮圖＋檔名＋用過次數（`MediaView.tsx:44–52`）；無搜尋、無刪除、無多選、無影片、無尺寸 | Postiz：全螢幕 Media Library，搜尋 debounce、方格多選帶序號、hover 刪除／放大、分頁、骨架、空狀態圖（`PZ/media/media.component.tsx`）。Metricool：媒體來源下拉（本機／Drive／Canva／Pexels／Giphy），附件三點選單（編輯／標記人／封面／AI alt） | 媒體庫改 modal 多選＋搜尋＋刪除；附件三點選單 |
| U9 | **設定頁**：加帳號是 6 顆文字 chip（`Settings.tsx:16`、`:75`），無平台 logo；失效帳號只有紅 pill，沒說「為什麼、按哪裡」 | Postiz：Add Channel 是 5 欄 icon 方格（`PZ/launches/add.provider.component.tsx`）；需重連的頻道頭像蓋紅 `!`＋遮罩，tooltip「click to reconnect」；首次用有三步 onboarding（`PZ/onboarding/*`） | 平台方格＋logo；失效帳號整列可點直接重連；首次進站（0 帳號）走一頁式引導 |
| U10 | **手機**：`social.css:128` 唯一斷點 1100px 只把兩欄變一欄；週格 7 欄在 390px 裡每欄 ~28px，字疊字；sidebar 不收；頁高 2543（render `12-mobile-week.png`） | Postiz：sidebar 變抽屜、頻道選擇變 bottom sheet、工具列 `fixed bottom-0` 跟鍵盤、預覽與編輯切換（`PZ/launches/launches.component.tsx`、`new-launch/manage.modal.tsx`）。Metricool：獨立 app | 手機：週→日檢視（一天一欄），編輯器全螢幕 sheet，預覽切換鈕 |
| U11 | **訊息位置**：全頁 `say()` 顯示在頁首右側（`SocialManager.tsx:218`），離動作最遠（成員區塊已個案修過，WORKLOG 2026-10-16 續6） | Postiz：toast | 統一 toast（右下）＋就地錯誤；刪掉頁首 note |
| U12 | **右欄永遠是編輯器**：看「設定」「紀錄」「媒體」時右邊仍是上一則貼文的編輯器（render `10-settings.png`） | Postiz：設定是獨立頁；媒體是 modal | 側檢視（設定／紀錄／輪播）改全寬；編輯器只在行事曆／清單檢視出現 |
| U13 | **空狀態**只有一句灰字（`Editor.tsx:273`、`MediaView.tsx:54`、`Lists.tsx:40`） | Postiz：插圖＋標題＋副文＋主動作（`/no-channels.svg`、`NoMediaIcon`） | 每個檢視一個空狀態：圖＋一句＋一顆按鈕 |

## 3. 功能缺口（F）——矩陣標 V1 但沒做，或兩個參考品都有而矩陣沒列

| # | 功能 | 矩陣列 | 現況（file:line） | 參考品 | 版 |
|---|---|---|---|---|---|
| F1 | **影片**上傳／附件／封面 | B「圖片／影片附件」V1、「影片封面」V1 | `accept="image/*"`（`Editor.tsx:351`、`MediaView.tsx:41`）、10 MB（`Editor.tsx:15`）；`social_media.kind` 已允許 `video`（`0096:154`） | Postiz：`image/*,video/mp4` 1 GB，Uppy；Metricool：封面從時間軸選畫格、500 MB | V1 |
| F2 | **多圖輪播**（預覽、排序） | B V1 | 可附多張但預覽只第一張（`Editor.tsx:367`），順序不能拖 | Postiz：縮圖 `ReactSortable` 拖排；IG 預覽 slider | V1 |
| F3 | **平台專屬設定** | B V1 | `compose.ts:35–46` 只有 IG／FB story；Pinterest／YouTube／Reddit／TikTok 不能送（`:84` 丟 ComposeError）；`FORMATS` 無 Reel（`model.ts:32–36`） | Postiz 每 provider 一個設定面板：IG Post／Reel／Story＋collaborators＋trial reel；YT title／privacy／kids／tags／thumbnail；Pinterest title／link／board；LinkedIn carousel；TikTok 8 個選項；Threads finisher（`PZ/new-launch/providers/*`） | V1（審核過一個做一個） |
| F4 | **串文**（thread：多則接續、延遲留言） | 矩陣只有「第一則留言」 | 只有 `first_comment` 一欄（`Editor.tsx:299`） | Postiz：AddPostButton 插入下一則、上下箭頭排序、每則可設 1m–2h 延遲（`PZ/new-launch/delay.component.tsx`）；Bluesky／Threads／X 皆靠此 | V1（Bluesky／Threads 已連） |
| F5 | **@mention 自動完成、emoji、hashtag** | B「hashtag 建議、mention 搜尋、表情」V2 | 純 textarea（`Editor.tsx:281`） | Postiz：Mention extension 打 `POST /integrations/mentions`、emoji picker；Metricool：FB／Bluesky／X／LinkedIn 自動完成 | 提前到 V1（emoji＋mention），hashtag V2 |
| F6 | **連結縮短** | B「連結縮短＋UTM」V1 | 只有 UTM（`compose.ts:50–57`）；Postiz client 寫死 `shortLink:false`（`lib/content/postiz.ts:251`、`:400`） | Postiz：ASK／always／never 偏好；Metricool：全域開關 | V1（接 Postiz `shortLink`） |
| F7 | **跨品牌複製** | C「複製貼文、跨品牌複製」V1 | 只同品牌（`SocialManager.tsx:171`） | Metricool：Duplicate to another brand，缺網路時可跳過 | V1 |
| F8 | **圖片裁切／編輯、每平台比例** | 矩陣未列 | 無 | Metricool：Crop／Finetune／Filter／Sticker／Resize，1:1／1.91:1／16:9／4:3 預設；Postiz：Polonto 編輯器 | V1 裁切；其餘 V2 |
| F9 | **AI alt text、AI 文字** | B「AI 改寫」V1 | 只有文章 → AI 改寫（`ArticleSource.tsx`）；貼文本身無 AI 鈕；alt 手打 | Metricool：alt AI 生成＋評分；機器人 icon 生成文字；Postiz：Copilot 助理 | V1：編輯器加「AI 幫我寫」（標費用，`lib/ai/cost-model.ts`）、alt AI |
| F10 | **tag／campaign 標籤＋顏色** | 矩陣未列 | 無 | Postiz：tags 帶顏色，卡片頂部色條；Metricool：Campaign Dashboards 篩選 | V2 |
| F11 | **重複貼文** | C V2 | 無 | Postiz：Repeat Day…Month；Metricool：autolist repeat | V2（輪播已覆蓋大半） |
| F12 | **最佳時段** | C V2 | 無 | Metricool：熱力圖＋格子深淺；Postiz：每頻道 time slots＋find-slot | V2 |
| F13 | **貼文層留言／審核留言** | 矩陣「貼文備註」V1 | 單一 `notes` 欄（`Editor.tsx:353`）；退回理由寫進 notes | Postiz：公開預覽頁可反白留言、Resolve／Reopen；Metricool：審核者可留言不拒絕，富文字＋@mention | V2 |
| F14 | **外部審核連結**（客戶不用帳號） | C「審核流程」V1 | 審核人要有帳號＋成員列（`Review.tsx`） | Metricool：email → reviewer portal，72h token；Postiz：`/p/{id}?share=true` | V2（ADR 015 一鍵登入前先用連結） |
| F15 | **CSV 匯入／匯出** | C V2 | 無 | Metricool 兩者皆有 | V2 |
| F16 | **媒體來源**（Drive／Canva／圖庫） | D V2 | 無 | Metricool：Drive／Canva／Adobe Express／Pexels／Giphy | V2 |
| F17 | **頻道頭像／名稱** | A V1 隱含 | `social_accounts` 無 `picture`（`0096:57`） | 兩者所有畫面都用頭像辨識頻道 | V1（U4 前置） |
| F18 | **分析** | E V2 | 無 | Postiz analytics API 已在 v2.25 | V2 |
| F19 | 連接進行中只有一行灰字＋取消（`Settings.tsx:80`），無進度、授權分頁完成後不回跳 | — | 已有鎖，缺回饋 | Postiz：連接完成直接回 launches | 小修 |

**順手抓到並修掉的 bug（B）**

| # | 症狀 | 根因 | 修 |
|---|---|---|---|
| B1 | 開 A 再開 B（版本號相同）→ 編輯器留著 A 的文字、狀態列卻是 B（render `04-edit-review.png` 第一版）；按存檔會把 A 的文字寫進 B | `SocialManager.tsx` 讀下一則前沒清掉上一則，Editor 以 `${id}:${version}` 重掛，版本相同就不重掛 | render 時只在 `selectedPost.id === selection.id` 才把載入的貼文交給 Editor（不變量在 render 層，不靠 effect 順序；同 id 重讀不閃）；`.catch` 尊重 `live`；測試 `__tests__/SocialManager.switch-post.render.test.tsx`（時鐘釘在週三，拔修正 → 紅）。critic Quick 0c/1M/3m，全修 |

**已比參考品完整、不用動**：輪播清單（Metricool autolist 等價，Postiz 沒有）、審核開關＋角色矩陣、紀錄＋「需處理」、成員管理、WordPress 文章→貼文、UTM、樂觀鎖 version、刪除可還原。

## 4. 建議批次（下一批卡，照 PLAN.md 六項格式另開 C13–C18）

| 卡 | 內容 | 依賴 | 建議模型 |
|---|---|---|---|
| **C13 版面規格 v2**（U1–U6、U12、U13） | 先出樣稿 v14：頭像頻道列、篩選按鈕、週檢視堆疊卡＋縮圖、三層編輯器、每平台預覽殼、日期選擇、側檢視全寬、空狀態；`check-social-mocks.py` 加「一屏 chip ≤ 20」「卡片含縮圖」規則；操作者看圖同意後才動程式 | F17（頭像欄） | Fable 5.1（設計）→ Opus 5.5（實作） |
| **C14 媒體與影片**（F1、F2、F8、U8） | video 上傳（Postiz `upload` 已收影片）、封面、多圖排序、裁切、媒體庫 modal | — | Opus 5.5 |
| **C15 編輯器完整化**（F3、F4、F5、F6、F9） | 平台設定面板（先 IG Reel／Threads finisher／LinkedIn），串文＋延遲，mention／emoji，shortLink 偏好，AI 鈕 | C13 | Opus 5.5 |
| **C16 手機**（U10） | 日檢視、全螢幕 sheet 編輯器、`render-views.mjs` 加 390 寬斷言（頁寬 = 視窗寬） | C13 | Opus 5.5 |
| **C17 小修**（U7、U9、U11、F7、F19） | 月格、設定頁平台方格、toast、跨品牌複製、連接回跳 | — | Sonnet 5.5 |
| **C18 V2 預備**（F10–F16、F18） | 只開卡不做 | — | — |

**不做**（維持 ADR 016 §6）：手機 app、X、廣告。**不抄**：Postiz 預覽裡寫死的互動數字（121 讚）——我們的預覽不顯示假數字。

## 5. 驗證

- 本檔每個 file:line 由 grep 取得（2026-10-16）；render 用 `render-views.mjs` 可重現。
- 參考品 UNVERIFIED 項未採用：hashtag UI、手機外框、shuffle、跨品牌首頁、深色模式。Metricool 卡片縮圖已在官網產品圖親眼確認（§1.1）。
