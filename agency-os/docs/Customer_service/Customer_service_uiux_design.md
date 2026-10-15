# 全自動客服 — 客戶體驗 UI/UX 設計文件（清新自然）

> **用途**：`Customer_service_automation_plan.md`（主計畫 SSOT）的**客戶體驗層設計規範**。涵蓋顧客聊天 widget 的視覺語言、互動功能、自建架構、動效、無障礙、行動裝置、坐席/管理面方向。
> **依據**：2026-06-25 兩線設計研究（① 清新自然設計語言 reference 全球最佳網站；② Chatwoot widget 客製天花板 + 自建可行性）。事實見本檔 §11 來源。
> **本次範圍：只出設計規範，不寫 production code。**（已附互動原型示意）

---

## §0 核心結論（先講重點）

1. **Chatwoot 預設 widget 是 iframe 鎖死** —— 外部 CSS 完全進不去，只能改顏色/左右/明暗/問候語。**要「絕佳 UI/UX + 清新自然」做不到。**
2. **→ 必走 headless 自建 widget**：用 Chatwoot **Client API + WebSocket（ActionCable / pubsub_token）**當後端，前端 100% 自己刻。官方 `client-api-demo` + Flutter SDK `ChatwootClient` 證實此模式可行、即時訊息可收。**這是頂規唯一路徑。**
3. **互動訊息類型 Chatwoot 原生支援**：`cards`（圖卡+按鈕）、`form`（多欄表單）、`input_select`（快速回覆）、`article`（知識文章列表）—— headless 端自己渲染（結構化 JSON，schema 已文件化）。
4. **設計語言 = 「晨間工作室」清新自然**：暖米白底、尤加利鼠尾草綠、暖土色點綴；General Sans + Fraunces + Noto Sans TC；spring 柔性動效；嚴守反 AI-slop 清單。
5. **坐席端用 Chatwoot 原生坐席台**（不重造）；**管理面（/ops/cs）自建**，同套設計語言。

---

## §1 設計原則（清新自然 / fresh-natural）

**Mood（用文字描述目標感）**：清晨走進採光良好的陶藝工作室。牆是暖灰泥，石瓶插一枝尤加利，光線柔散不刺眼。一切「在場但不喧嘩」。介面要承載這種感覺：沉穩、通透、手作感、不急躁。

**Reference（研究過的最佳產品）**：Linear（結構用感受不用看見）、Airbnb（單一字體+照片驅動+pill 輸入）、Notion（4px 網格+留白）、Vercel/Geist（極簡+shadow-as-border）、**Headspace/Calm/Aesop**（暖中性、wabi-sabi、留白即奢侈）、Fraunces（人文襯線帶溫度）。

**五大原則**：
1. **暖，不冷**：所有中性色拉暖（黃調），不用冷灰/藍灰。最大差異化點。
2. **留白即呼吸**：行高 1.55–1.65（CJK 1.7–1.8）、慷慨間距 = 沉穩感來源。
3. **柔，不硬**：圓角、柔陰影（暖調非純黑）、spring 動效；物件像植物迎光，不像開關。
4. **克制**：低飽和、≤2 色階、一個暖土點綴色；漸層全 UI ≤1–2 處。
5. **手作微紋**：大背景加極淡 grain（3–5% opacity）= 人味，反「臨床扁平」。

---

## §2 設計 Token（可直接實作）

### 2.1 顏色 — 「晨間工作室」淺色主題（建議用 OKLCH 建構，輸出 hex）
```css
--bg:#F7F4F0;        /* 暖米白底（非純白；純白臨床感）*/
--surface:#FDFCFA;   /* 面板/卡片 */
--overlay:#F0EDE8;   /* 側欄/標頭暖灰 */
--sage-50:#EBF0EB; --sage-200:#C0D4C3; --sage-400:#8BAF90;
--sage-600:#547C65;  /* 主色：主按鈕/active */  --sage-800:#2E5240;
--earth-100:#F5E8E0; --earth-300:#D5B295; --earth-500:#9D7A5A;  /* 暖土點綴 */
--text:#2C2926;      /* 近黑帶暖，非 #000 */  --text-2:#736B63; --text-mut:#A89F96;
--border:#E3DDD7; --link:#3D6B58; --success:#547C65; --error:#C06060;  /* 柔陶紅非刺眼紅 */
```
**暗色「夜間工作室」**：`--bg:#1A1915`（暖黑非純黑）、`--surface:#222118`、`--sage:#7AA888`（提亮以利暗底可讀）、`--text:#F0EDE8`。
**漸層（極省用）**：`linear-gradient(135deg,#F0EDE8,#EBF0EB)` 僅用於 widget 標頭。

### 2.2 字體
```css
--font-ui:'General Sans','Noto Sans TC','PingFang TC',system-ui;  /* 人文 grotesque，有個性不像 Inter 通用 */
--font-display:'Fraunces',serif;  /* 軟襯線，僅 h1/h2/空狀態大字 */
--font-mono:'Geist Mono',monospace;  /* 訂單號/ID */
```
- **CJK 必顯式載 `Noto Sans TC`**（與 Latin Noto 同設計哲學、跨字種協調；系統 fallback 各機差異大）。Latin 在前、CJK 在後，瀏覽器自動分流。
- 字級：display 36/300（Fraunces）、h1 28/500、body 15/400 lh1.6、label 13/500、caption 12/400。**body 不用 700 粗體**（粗=企業急迫感）。

### 2.3 形 / 空 / 深
- **圓角**：sm 8 / md 12（卡片/泡泡）/ lg 16（widget 面板）/ xl 24（launcher）/ pill 9999。
- **對話泡泡不對稱尾角**（讀作對話而非方塊）：顧客 `16px 16px 4px 16px`；AI `4px 16px 16px 16px`。
- **間距**：4px 基底（4/8/12/16/24/32/40/48/64）。
- **陰影暖調非純黑**：float `0 8px 24px rgba(44,41,38,.10)`；launcher 加 sage 染 `0 12px 32px rgba(84,124,101,.20)`。
- **玻璃擬態極省**：僅 widget 標頭 `backdrop-filter:blur(12px) saturate(1.2)`；主面板實底（glassmorphism 過度用+無障礙差）。
- **grain**：大背景疊 ≥150px 高頻噪點 PNG @3–5% opacity（OLED 低 opacity 防 moire）。

### 2.4 動效（「緩慢呼吸，非快速手勢」）
```css
--ease:cubic-bezier(.25,.1,.25,1);      /* 預設 */
--ease-enter:cubic-bezier(0,0,.2,1);    /* 進場 */
--dur-fast:150ms; --dur-normal:220ms; --dur-slow:350ms;
/* 互動用 spring：stiffness 180 / damping 20（柔），280/24（按壓 snappy）*/
```
| 事件 | 配方 |
|---|---|
| widget 開啟 | scale .8→1 + opacity 0→1，350ms，spring 180/20 |
| 新訊息進場 | translateY 8px↑ + fade，220ms，--ease |
| 打字指示 | 3 點交錯 bob，offset 80ms，輕微 overshoot `cubic-bezier(.34,1.56,.64,1)`（=活著）|
| 送出按壓 | scale 1→.92→1，150ms |
| 錯誤 | translateX ±4px×3，400ms（輕，不暴力）|
**禁**：`transition:all`、>600ms 的使用者觸發動畫、純 opacity fade 當唯一動畫、結構 UI overshoot>10%。

### 2.5 圖示 / 插畫
- 圖示 stroke 1.5px@24 / 1.25px@16，圓端圓角接（Lucide / Phosphor / Heroicons）。**避免**填滿厚圖示、純幾何冷圖示。
- 插畫：柔手繪線、sage/earth 2–3 色、略不完美。Reference Headspace/Mailchimp Freddie，**非** Midjourney 光滑 3D。藝術/塔羅脈絡可用植物意象（葉/莖）做空狀態裝飾。

### 2.6 企業識別系統（CIS）配置 — 重用既有 brandColors + BrandVoiceProfile，不重造

> **CIS = MI 理念 / BI 行為 / VI 視覺三層，不是「一個品牌色」。** 客服 widget 視覺（VI）+ 客服 AI 語氣（BI/MI）都必須遵循該客戶的 CIS，且與**內容引擎/Banner Studio 同一份真相源** → 跨觸點一致（CIS 的本義）。

**🔴 既有設施（VBC 已驗證，重用不重造）**：
- **VI 標準色**：`organizations.metadata.client_config.brandColors {primary, secondary, accent}` —— 每客戶**明定三色**，已有 `PATCH /api/ops/clients/[slug]/brand-colors`（`brand-colors/route.ts:33`），Banner Studio 在用。**客服 widget 直接讀這三色當錨點。**
- **BI/MI 語氣**：`BrandVoiceProfile {name, tone, vocabulary, sentenceStyle, personality[], preferWords[], avoidWords[], promptInjection}` —— Claude 從文章/URL 抽取，**內建 `promptInjection` 專餵 AI**（`brand-voice/route.ts:9`）。**客服 AI system prompt 直接吃這個 → 客服講話 = 內容引擎同一品牌聲音。**

**VI 視覺套用（錨點用真實三色，推導只填周邊）**：
- 錨點 = 既有 `brandColors.{primary,secondary,accent}`（客戶明定，**不發明**）。
- 演算法只長**周邊**：圍繞三色錨點生成色階 tint/shade + 中性（清新自然暖灰）+ 語意狀態色（success/error/warn）+ 暗色變體，並**鎖亮度保 WCAG AA**（主色上文字恆達標）。
- **單色推導引擎降為 fallback**：客戶只給 primary（無 secondary/accent）或完全沒設時，才用 OKLCH 單色推導 quickstart（先前 demo 那套）。有完整三色就以三色為準。
- **補缺**（目前 repo 無，CIS 應擴充）：logo（主標/反白/icon 變體 + 安全空間 + 最小尺寸）、標準字（品牌 webfont）、輔助圖形/影像風格/icon 風格、do/don't。建議擴 `client_config.brandKit`（沿用既有 JSONB 慣例，免 migration）。

**BI/MI → 客服 AI persona（語氣一致）**：
- system prompt 組裝：既有 `BrandVoiceProfile.promptInjection` + `preferWords`/`avoidWords` + `tone`/`personality` 注入（與內容引擎同源）。
- **客服專屬 BI 補充**（widget/persona config）：招呼語、結尾/簽名、稱謂與敬語、emoji 用不用、道歉與**拒絕用語**、轉真人語氣、支援語言、服務準則（能否開玩笑）。
- **MI**：mission / slogan / values → persona context + 罐頭回覆基調。

**主題/明暗管理（仍保留）**：明暗 light/dark/auto（`prefers-color-scheme`）；多預設主題庫與「回到預設」用於**無品牌客戶或自家 Account#0**；有 CIS 的客戶 = 鎖定其品牌，不給隨意換色。runtime 切換 = 重設 CSS 變數（headless 可控）。

**唯一真相源 + 持久化**：一份 client CIS 同時驅動 內容引擎(已用)+Banner Studio(已用)+客服 widget 視覺+客服 AI 語氣。存既有 `organizations.metadata.client_config`（`brandColors` 已在；擴 `brandKit` + `csVoice`），不另開孤立表。**已附互動原型**：先前「配色引擎」demo = VI 周邊色階推導器（fallback/quickstart），非 CIS 本身。

### 2.7 brandKit + csVoice schema 草案（沿用 client_config JSONB，免 migration）

> 位置：`organizations.metadata.client_config.{brandKit, csVoice}`，與既有 `brandColors` **同層 sibling**（`brand-colors/route.ts` 同模式）。**標準色唯一真相源仍是 `brandColors`**，brandKit 不重存色值（避免雙真相源）。

**VI — `brandKit`（補 logo/標準字/輔助圖形，目前 repo 無）**
```ts
interface BrandKit {
  logo: {
    primary?:    string;   // 主標 URL
    inverse?:    string;   // 反白/深底版 URL
    icon?:       string;   // 純圖示/favicon URL（widget launcher/標頭用）
    clearSpace?: string;   // 安全空間，如 "0.5× logo 高"
    minWidthPx?: number;   // 最小顯示寬
    preferOn?:   'light' | 'dark' | 'any';
  };
  typography?: {
    headingFont?: { name: string; src?: string };  // 標準字（標題）
    bodyFont?:    { name: string; src?: string };   // 內文
    cjkFont?:     { name: string; src?: string };   // CJK 標準字（如 Noto Sans TC）
  };
  graphics?: {
    pattern?:           string;                      // 輔助圖形/底紋 URL
    illustrationStyle?: string;                      // 插畫風格描述（餵生圖/選素材）
    iconStyle?:         'lucide' | 'phosphor' | 'custom';
    imageryTreatment?:  string;                      // 影像調性（暖光/低飽和…）
  };
  motionPersonality?: 'calm' | 'balanced' | 'energetic';
  doDont?: string[];     // 使用規範（logo 不可變形/不可換色…）
  // 標準色 → 讀 client_config.brandColors，不在此重存
}
```

**BI/MI — `csVoice`（客服專屬，補 `BrandVoiceProfile` 增量，不重存語氣本體）**
```ts
interface CsVoice {
  personaName?: string;        // 客服化身名，如「小幫手」
  avatarUrl?:   string;
  brandVoiceRef: 'content';    // 語氣本體重用內容引擎 BrandVoiceProfile（同源，不複製）
  languages:    string[];      // ['zh-Hant','en']
  formality?:   'casual' | 'polite' | 'formal';
  honorifics?:  '您' | '你';    // 稱謂
  emojiPolicy?: 'none' | 'sparing' | 'friendly';
  greeting?:    Record<string,string>;  // 各語言招呼語 { 'zh-Hant': '嗨，我是…' }
  signoff?:     Record<string,string>;  // 結尾/簽名
  apologyStyle?:   string;     // 道歉用語基調
  refusalStyle?:   string;     // 做不到/拒絕時的用語
  escalationTone?: string;     // 轉真人時直接送給客人的確認句（不進 prompt；lib/cs/handoff-ack.ts）
  askName?:        string;     // 讀不到客人名字時接在確認句後的問句；回答寫進 Chatwoot 聯絡人
  servicePrinciples?: string[];// 服務準則（能否開玩笑/同理優先/不過度承諾…）
  // MI 脈絡（選填，給 persona + 罐頭回覆基調）
  mission?: string; slogan?: string; values?: string[];
}
```

**System prompt 組裝（BI/MI 怎麼進 AI，§3 step6）**
```
system = [ 客服護欄與安全(§5)
         + BrandVoiceProfile.promptInjection (內容引擎同源)
         + preferWords / avoidWords
         + csVoice: personaName / formality / honorifics / emojiPolicy
                    / greeting / signoff / refusalStyle
         + MI: mission / values (脈絡)
         + RAG 檢索塊 + 客戶記憶 ]
```

**治理（沿用既有慣例）**：
- RBAC：brandKit / csVoice 與 brandColors **同 client-config tier** → `canWriteTenantConfig`（owner/admin）。
- logo / avatar 檔走既有資產儲存（Supabase storage / 既有圖庫），欄位**只存 URL**；hex 沿用既有 `HEX` 驗證。
- 寫入記 `ops_audit_events`（`event_type: brand_kit_updated` / `cs_voice_updated`），同 brand-colors:78 模式。
- 管理面：next-admin `/ops/cs` 或既有 `ClientHubTabs` 加「品牌識別」分頁（同清新自然設計語言）。

**Fallback 階梯**：brandKit 缺 → 清新自然 default + brandColors 單色推導（§2.6）；csVoice 缺 brandVoice → 用內容引擎 profile；全無 → 中性禮貌預設。**有 CIS 就鎖定品牌，不給隨意換色/換語氣。**

---

## §3 自建 Widget 架構（headless on Chatwoot Client API）

### 3.1 為何 headless（不用預設 widget）
預設 widget 在 **iframe** 內、樣式隔離，外部 CSS（含 `!important`）零觸及；只能改顏色/左右/明暗/問候/表單。要頂規 UI 必繞過。

### 3.2 架構（已驗證可行）
```
自建 widget(Next embed script / React) ──REST──> Chatwoot Client API
  POST /api/v1/inboxes/{inbox_identifier}/contacts
  POST .../contacts/{contact_identifier}/conversations
  POST .../conversations/{id}/messages
  └─ WebSocket wss://<host>/cable (ActionCable, pubsub_token)
     即時收 message.created / typing_on/off / status_changed
```
- **Auth**：`inbox_identifier`（API inbox 設定）+ `contact_identifier`（建 contact 時回傳，**須 localStorage 快取否則重複建 contact**）+ 選用 HMAC `identifier_hash` 防冒充。
- **即時**：contact 的 `pubsub_token`（建 contact 回傳，**可能輪替須處理重連**）訂閱 RoomChannel → 收即時進站訊息。**已確認 headless 可收即時訊息**。
- **後端全給 Chatwoot**：對話管理、坐席台、automation、bot、CRM。我方只刻前端 + 接 cs-engine AI。
- **行動**：Flutter `ChatwootClient`（完整 headless）；React Native 官方包是 WebView（要原生 headless 走 Client API 直連）。

### 3.3 互動訊息類型（Chatwoot 原生，headless 自渲染）
| type | 用途 | 通道支援 |
|---|---|---|
| `input_select` | 快速回覆選項（顧客點選）| Web + WhatsApp（映射回覆鈕，≤3）|
| `cards` | 圖卡（圖+標題+描述+link/postback 按鈕）| Web only |
| `form` | 多欄互動表單（email/text/select）| Web only |
| `article` | 知識文章列表連結 | Web |
postback 按鈕點擊 → headless 經 WebSocket 收事件 → 觸發 cs-engine 對應動作。

---

## §4 互動功能目錄（非常棒的互動）

| 功能 | 說明 | 對應 |
|---|---|---|
| **快速回覆 chips** | 進站給 3–4 個常見意圖按鈕，降摩擦 | `input_select` |
| **AI 打字指示** | 3 點 spring，AI 思考時顯示「正在輸入」| 動效 §2.4 |
| **即時資料卡** | 訂單狀態/物流/預約 用圖卡即時呈現 + 行動按鈕 | `cards` + A1 tool |
| **inline 表單** | 需收 email/退換資訊時內嵌表單，不跳頁 | `form` |
| **inline 知識搜尋** | 顧客打字時即時建議 help 文章（先自助）| `article` + RAG |
| **AI 已回標記** | AI 回覆標「AI 即時回覆 · 已比對知識庫」透明可信 | §1 透明 |
| **一鍵轉真人** | 任何時刻「想找真人」→ 顯示「已轉真人 · 預計 N 分鐘」狀態 | §6 handoff |
| **滿意度即時評分** | 結案輕量星評 + 柔性致謝動畫 | CSAT |
| **檔案/圖片上傳** | 顧客傳截圖（退貨憑證等）| Chatwoot 原生 |
| **語音輸入**（後期）| 行動端語音轉文字進聊天 | Phase 進階 |
| **多語句級切換**（後期）| 偵測語言自動切，無「選語言」選單 | Phase 進階 |
| **主動訊息**（後期）| 行為訊號觸發（停留某頁/購物車）主動招呼 | Chatwoot campaign |
| **對話歷史續接** | 回訪認得上次對話（contact_identifier + Memories）| §7 主計畫 |
| **離線留言** | 非服務時間留 email，AI 先答 + 真人補 | 營業時間 |

---

## §5 Widget Anatomy + 狀態

**結構**（見已附互動原型）：
```
標頭(blur+sage 漸層): 🌿品牌 + 線上狀態 + 收合
對話區(自動增高,捲動): AI 泡泡(左,#F0EDE8,4-16-16-16) / 顧客泡泡(右,sage,16-16-4-16)
快速回覆 chips 列
輸入區(實底): pill textarea + sage 圓送出鈕(按壓 scale)
launcher: sage 圓 58px + 訊息圖示 + sage 染陰影(spring hover)
```
寬：桌機 360–384px / 行動全寬。
**必設計的狀態**：greeting（首訊+chips）、typing（3 點）、handoff（已轉真人膠囊）、offline（留言表單）、rating（星評→致謝）、error（柔 shake + 「稍後再試 / 轉真人」）、knowledge-gap（檢索無果 → 不硬答，直接轉真人）。

---

## §6 人類交接的客戶端體驗
- 觸發護欄/客戶要真人 → 對話顯示柔性膠囊「已轉真人 · 〈專員名〉預計 N 分鐘內回覆」，AI 噤聲。
- 坐席接手後客戶**不需重述**（主計畫 §6：帶歷史+診斷+情緒+KB 給坐席）。
- 視覺上 AI 與真人訊息可微區分（AI 標 sparkles 小字、真人標頭像），但同一對話流不斷裂。

---

## §7 無障礙（WCAG，頂規必備）
- 對比 ≥ AA（4.5:1 文字）；sage-600 on cream 達標，淺 chips 文字用 sage-600 不用淺色。
- 全鍵盤可操作（Tab 序、Enter 送出、Esc 收合）；focus ring sage `0 0 0 2px`。
- ARIA：`role="log" aria-live="polite"` 對話區（新訊息播報）、按鈕 aria-label、圖示 aria-hidden。
- `prefers-reduced-motion` → 關 spring/位移，僅留 opacity。
- 螢幕閱讀器：泡泡標明說話者（「客服說：」/「你說：」）。
- 字級 ≥14px body（行動 ≥16 防 iOS 縮放）；CJK 行高足。

---

## §8 行動裝置
- **行動 Web**：自建 widget 響應式全寬 + 安全區（notch）；輸入聚焦不被鍵盤遮。
- **原生 App**（若需）：Flutter `ChatwootClient`（headless，回呼 onMessageReceived/Sent/Typing）最完整；RN 用 Client API 直連自刻 UI。

---

## §9 坐席台 + 管理面（/ops/cs）
- **坐席端**：用 **Chatwoot 原生坐席台**（含 AI 已回標記、一鍵接管、私有草稿、巨集、SLA）。**不重造聊天 UI。** 可微 brand（顏色）。
- **管理面（next-admin /ops/cs，自建，同設計語言）**：知識庫管理、eval/模擬儀表板、意圖開關+autonomy 級別、行動 allowlist、resolution/deflection/成本儀表板、kill-switch 三層開關。卡片式、sage/cream、清新自然。

---

## §10 實作分階（接主計畫 Roadmap）
| 階 | 內容 |
|---|---|
| Widget P1 | 自建 headless widget MVP：Client API 建 contact/conversation/message + WebSocket 即時 + greeting/泡泡/輸入/launcher（清新自然 token）|
| Widget P2 | 互動類型渲染器：`input_select`/`cards`/`form`/`article` + 打字指示 + 滿意度 + 檔案上傳 |
| Widget P3 | inline 知識搜尋 + AI 已回標記 + 交接狀態 UI + 離線留言 + a11y 全過 |
| Widget P4（後期）| 語音輸入 + 多語切換 + 主動訊息 + 行動原生 |
**技術棧**：Next.js（embed script 形式，`<script src>` 嵌任意客戶網站）+ 自建 widget（React/vanilla）+ 設計 token（CSS vars）+ Framer Motion（spring）+ 自架字體（General Sans 自 Fontshare、Fraunces/Noto Sans TC 自 Google）。

---

## §11 反模式（殺死清新自然）+ 來源
**反 AI-slop（研究實證）**：❌ 紫藍漸層 ❌ Inter 零客製 ❌ 純白 `#FFFFFF` 底 ❌ 純黑文字/陰影 ❌ 全 UI 一致 16px 圓角 ❌ 通用 fade-in ❌ 按鈕無 easing snap ❌ 玻璃擬態濫用 ❌ 3D 光滑幾何 ❌ 全同飽和度 ❌ CJK 只靠系統 fallback ❌ iframe 預設 widget 充頂規。

**來源（2026-06-25 存取）**：設計語言 — linear.app/now、standards.site/headspace、925studios.co（anti-slop）、superdesign.dev/airbnb、vercel.com/geist、untitledui.com（fonts）、pimpmytype.com/fraunces、fonts.google.com/Noto+Sans+TC、blog.logrocket.com（OKLCH）、motion.dev、m3.material.io（spring）、wix/framer（2026 trends）。Chatwoot 自建 — developers.chatwoot.com（Client API/introduction）、chatwoot.com/hc（WebSocket setup / interactive-messages / SDK）、github.com/chatwoot/client-api-demo、github.com/chatwoot/chatwoot-flutter-sdk、GitHub Discussion #13027（iframe CSS 牆）。詳見對話研究紀錄。
