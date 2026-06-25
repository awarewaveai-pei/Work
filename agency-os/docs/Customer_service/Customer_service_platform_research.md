# 統一聊天介面 — 平台 API 可行性研究報告

**研究日期**：2026-06-25
**範圍**：自架 Chatwoot 聚合 WhatsApp / Messenger / Instagram / X(Twitter) / LINE / Telegram / Email，含商業帳號（官方 API）與個人帳號（Beeper 式橋接）兩條路線。

---

## 1. Chatwoot 原生 Channel 支援（v4.15.1，2026-06-17）

自架 Chatwoot 支援以下 inbox channel：

| Channel | 狀態 | 備註 |
|---|---|---|
| Website 即時聊天 | 🟢 完整支援 | 內建 JS widget |
| Email | 🟢 完整支援 | SMTP/IMAP 收件匣 |
| WhatsApp（Cloud API） | 🟢 完整支援 | 首選路徑，直連 Meta，免 BSP |
| WhatsApp（Twilio） | 🟢 支援 | 次要選項 |
| WhatsApp（360dialog） | 🟢 支援 | 舊 BSP 選項，仍列 |
| Facebook Messenger | 🟢 完整支援 | 需 FB Page + Meta app |
| Instagram Direct | 🟢 完整支援 | 需 IG Business/Creator 連 FB Page |
| Telegram | 🟢 完整支援 | v4.3.0（2025-06）起 Business mode |
| LINE | 🟢 完整支援 | 需 LINE 官方帳號 + Messaging API |
| SMS | 🟢 支援 | 經 Twilio 等 |
| API Channel | 🟢 完整支援 | 通用 webhook 自訂整合 |
| **Twitter/X DMs** | 🔴 **已下架** | 2023-04 移除；行銷頁標「Coming Soon」但至 2025 末未恢復 |

### Twitter/X 確切狀態
> Chatwoot 因 Twitter API 重大改動（請求數限制 + 大幅漲價）被迫**暫時下架** Twitter 整合，無法連接 Twitter inbox 或在儀表板管理 DM 與推文。

GitHub discussion #6983 確認：維護者需要 Twitter 的 **Account Activity API**（即時 DM webhook），目前只在 Enterprise 方案（非 $100 Basic）。截至 2025 末無恢復時間表。

---

## 2. X(Twitter) API DM 現實（2026）

**現行模式（2026-02-06 起）**：X 對新開發者改以 **pay-per-use（按用量計費）** 為預設。

| 操作 | 費用（pay-per-use） |
|---|---|
| 讀貼文 | $0.005／次（上限 2M/月） |
| 發貼文 | $0.015／則（含連結 $0.20） |
| 發 DM | $0.015／則 |
| 讀用戶 | $0.010／次 |

**舊訂閱方案（已關閉新註冊）**：Basic $200/月、Pro $5,000/月、Enterprise ~$42,000/月（議價）。

**對 Chatwoot 的致命阻礙**：inbox app 需要的是 **Account Activity API**（即時收 DM 的 webhook），只在 **Enterprise（~$42K/月）**。pay-per-use 只能逐則呼叫 DM endpoint，**無法串接即時進站 DM**。這就是 Chatwoot 整合自 2023-04 至今熄燈的原因。

**可行性判定：🔴 RED。** 對任何合理 DM 量的客服收件匣，X DM 整合在無 $42K/月合約下實質不可行。

---

## 3. WhatsApp Business Cloud API — 前置需求

1. **Meta Business Account** — 經 Business Manager 驗證（稅號/公司登記/水電帳單），核准 2–10 工作天。
2. **WhatsApp Business Account (WABA)** — 於 Business Manager 內建立。
3. **電話號碼** — 不可已註冊在 WhatsApp/WhatsApp Business app（需先解除註冊）；需設 2FA PIN。
4. **Meta Developer App** — 具 `whatsapp_business_messaging` 權限。

**驗證上限**：未驗證 250 對話/24h；驗證後升至 1,000+，再依品質評分擴張。

**計費（2025-07-01 改動，對話制改為逐訊息）**：
- 24h 客服窗（CSW）內的自由回覆：**免費、無限**
- 每月前 1,000 則客戶主動發起的客服對話：**免費**
- CSW 內的 utility 範本：**免費**
- 範本訊息（行銷/驗證）：依國碼逐則收費

**經 Chatwoot**：Cloud API 直連 Meta，免 BSP 費；Twilio/360dialog 為備選。

---

## 4. Instagram + Messenger（Meta）— 前置需求

**Facebook Messenger**：
- Facebook Page（商業或公開）
- Meta Developer App 具 `pages_messaging` 權限（production 需 Advanced Access）
- 於 Chatwoot Settings → Inboxes 連接

**Instagram Direct**：
- Instagram Professional 帳號（Business 或 Creator）— 個人檔案**不支援**
- IG 帳號須**連結至 FB 商業 Page**
- Meta Developer App 具 `instagram_business_manage_messages` 權限（production 需 advanced access，超過 25 測試用戶）
- production 需 Meta App Review

**24 小時訊息窗（兩平台）**：用戶來訊後 24h 內可回；逾時僅能送核准範本。Human Agent 標籤可延長窗口。

**App Review**：開發模式可用 ≤25 測試用戶免審；production 需送審。

---

## 5. LINE 官方帳號 / Messaging API — 前置需求

1. **LINE Business ID** — manager.line.biz 免費註冊
2. **LINE 官方帳號** — 經 LINE Official Account Manager 建立（2024-09-04 起不能再直接從 LINE Developers Console 建 Messaging API channel，須先建官方帳號）
3. **啟用 Messaging API** — 於官方帳號設定啟用
4. **LINE Developers Console** — 建 Provider，官方帳號成為 Messaging API channel
5. **填入 Chatwoot 的憑證**：Channel ID、Channel Secret、Channel Access Token（長效）
6. **Webhook** — 於 Chatwoot 建 inbox 後，把 Chatwoot 給的 webhook URL 填回 LINE Developers Console

**計費**：有免費額度（依方案每月回覆訊息數有限），高量需付費方案。
**Chatwoot 設定指南**：developers.chatwoot.com/contributing-guide/line-channel-setup

---

## 6. 個人帳號聚合（Beeper 式）

### mautrix bridges（個人帳號 puppeting）

| Bridge | 平台 | 狀態（2026-06） | 方法 |
|---|---|---|---|
| mautrix-whatsapp | WhatsApp 個人 | 🟢 活躍，v26.06（2026-06） | WhatsApp Web multi-device（whatsmeow） |
| mautrix-meta | IG DM + Messenger | 🟢 活躍，v26.06（2026-06） | Meta 私有 API puppeting |
| mautrix-twitter | X/Twitter DM | 🟡 活躍，v0.5.0（2025-08） | X 私有 API / 爬蟲 |

三者皆 puppeting：以你的真實帳號登入（非 bot），你在原生 app 送的訊息也會出現在 Matrix。

### ToS 與封號風險（誠實評估）
- **WhatsApp**：使用 bridge 本身通常不致封號，但與其他可疑行為（模擬器、VoIP 號、新帳號、主動私訊非聯絡人）疊加時封號機率升高。**雲端 VPS IP 是風險放大因子**。
- **IG/Messenger（mautrix-meta）**：用 Meta 私有行動 API，違反 ToS，Meta 主動偵測第三方 client，伺服器 IP 異常登入有停權風險。
- **X（mautrix-twitter）**：用 X 非官方/私有 API（爬蟲層），X 自 2023 積極打擊爬蟲並提告；雲端 VPS IP 偵測/封號風險高，X 常改 API 弄壞此 bridge。

**個人軌風險總結**：三者皆違反 ToS；封號可能但非必然，風險與「使用看起來多正常」成反比；雲端 VPS IP 顯著放大風險；mautrix-twitter 最脆弱。

### Matrix ↔ Chatwoot 橋
**beeper/chatwoot**（github.com/beeper/chatwoot）：以 Matrix「help user」登入，將 Matrix 房間訊息鏡射進 Chatwoot 為對話，坐席回覆回送 Matrix。
- 架構鏈：`個人 WA/IG/Messenger → mautrix bridges → Matrix homeserver → beeper/chatwoot 橋 → Chatwoot inbox`
- repo 233 commits / 25 stars，未封存、輕度維護，無近期 release tag。

**此 stack 判定**：技術可行但脆弱。需自架 Matrix homeserver（Synapse/Dendrite）+ mautrix bridges + beeper/chatwoot bot + Chatwoot。任一 mautrix bridge 會在 Meta/X 改私有 API 時壞掉，屬進階設定 + 持續維運負擔。

---

## 7. Chatwoot 自架 — 系統需求

| 元件 | 最低 | 建議 |
|---|---|---|
| RAM | 4 GB | 8 GB |
| CPU | 2 vCPU | 4 vCPU |
| 儲存 | 40 GB SSD | 60 GB SSD |
| PostgreSQL | 14+ | 最新穩定版 |
| Redis | 7.0+ | 最新穩定版 |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

**容量**：4GB RAM ≈ 10,000 對話/日；8GB ≈ 20,000 對話/日；建議加 ≥1GB swap 防升級 OOM。
**Docker**：官方 Compose 綁 Chatwoot + Postgres + Redis；Sidekiq（背景工）最吃 RAM，2 vCPU 為硬建議。
**共存**：可用 Docker Compose 與其他服務共機（共用或隔離 Postgres/Redis）；web 預設 port 3000，前面放 Nginx/Caddy。與 n8n/DB 等重服務共機建議 8GB。

---

## 各平台可行性總判定

| 平台 | 判定 | 阻礙/備註 |
|---|---|---|
| WhatsApp Business（Cloud API） | 🟢 GREEN | Chatwoot 完整支援，直連 Meta 免 BSP；2025-07 計費改動有利 |
| Facebook Messenger | 🟢 GREEN | 原生 channel；production 需 FB Page + Meta app review |
| Instagram Direct | 🟢 GREEN | 原生 channel；需 IG Business/Creator + 連 FB Page + app review |
| Twitter/X DMs | 🔴 RED | Chatwoot 整合自 2023-04 熄燈；即時 DM webhook 需 ~$42K/月 Enterprise，不可行 |
| LINE | 🟢 GREEN | 原生 channel；需 LINE 官方帳號 + Messaging API（流程 2024-09 改） |
| Telegram | 🟢 GREEN | 原生 channel（v4.3.0 起 Business mode） |
| 個人 WA/IG/Messenger（mautrix） | 🟡 YELLOW | 可用但違反 ToS；VPS IP 封號風險真實；需 Matrix + 橋，重運維 |
| 個人 X DM（mautrix-twitter） | 🔴 RED | 可用但極脆弱；X 積極打擊；雲端 IP 封號風險高 |
| Chatwoot 自架 | 🟢 GREEN | Docker Compose 文件完整；4GB 最低、8GB 建議；可共機 |

---

## 版本與時效註記
- Chatwoot 最新：v4.15.1（2026-06-17）。Telegram Business mode v4.3.0（2025-06）。語音通話 v4.15.0 起 beta。
- WhatsApp Cloud API 計費 2025-07-01 由對話制改為範本逐則。
- X API 2026-02-06 起 pay-per-use 為新開發者預設；Basic($200/月)、Pro($5K/月) 關閉新註冊。
- LINE Messaging API 建立流程 2024-09-04 改為須先經官方帳號管理後台。
- mautrix bridges（whatsapp/meta/twitter）2025–2026 均有 release，活躍維護。

## 信心度
- Chatwoot channel 狀態、X/Twitter 下架、系統需求：**高**（多來源含官方 GitHub discussion 一致）。
- X API 計費：**高**（多專業來源一致引用 2026-02 pay-per-use 改動）。
- WhatsApp 計費細節：**中**（2025-07 改動多來源確認，惟 Meta 官方頁回 403 無法逐字引用）。
- mautrix bridge ToS 風險描述：**中**（官方 mautrix docs 引文經搜尋片段確認，惟 docs.mau.fi 全頁回 403）。

---

## 主要來源
- Chatwoot GitHub (v4.15.1) — github.com/chatwoot/chatwoot
- Twitter API 下架討論 — github.com/orgs/chatwoot/discussions/6983
- Chatwoot 各 channel 支援 — developers.chatwoot.com/self-hosted/supported-features
- Chatwoot 系統需求 — developers.chatwoot.com/self-hosted/deployment/requirements
- LINE channel 設定 — developers.chatwoot.com/contributing-guide/line-channel-setup
- WhatsApp channel 設定 — chatwoot.com/hc/user-guide/articles/1677832735
- mautrix bridges — github.com/mautrix/whatsapp、/meta、/twitter
- beeper/chatwoot 橋 — github.com/beeper/chatwoot
- X API pricing — docs.x.com/x-api/getting-started/pricing
- WhatsApp 計費更新 2025-07 — ycloud.com/blog/whatsapp-api-pricing-update
- Instagram Messaging API — developers.facebook.com/docs/instagram-messaging
- LINE Messaging API 2026 指南 — ai-chain.tw/en/blog/line-messaging-api/
- Chatwoot 自架指南 — betalab.in/blog/how-to-self-host-chatwoot

（全部來源於 2026-06-25 存取）
