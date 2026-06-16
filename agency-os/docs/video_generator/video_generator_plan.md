# 全自動內容發佈系統 — 完整計畫（原型設計記錄 · 發佈/排程層已退役）

> 一個全自動內容發佈系統，輸入主題或已有文章，自動生成文章＋卡通影片，發佈到 10 個平台，完全不需要人工干預。

> **⚠️ P6 退役公告（2026-06-16）**：本文件保留為**原型設計記錄 + P7 影片生成參考**。下列直連發佈/排程層已移除，文中相關流程僅供歷史對照，**請勿據以執行**：
> - 🗑️ `publisher.py`（10 平台直連）→ 違反 R1（與 Postiz 雙套社群）+ R4（繞 wp-bridge 簽章）。社群走 **Postiz**；WordPress 走 **wp-bridge 簽章發佈**。
> - 🗑️ `master_controller.py` + `cron_setup.sh`（cron 主控/安裝器）→ 編排收斂進 next-admin `lib/content/pipeline.ts`（P4，draft-first）。
> - ✅ 保留：`full_pipeline_v3.py`（文章→影片）作 P7 影片微服務移植參考。
> SSOT：`agency-os/docs/operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md` §10 P6。

---

## 你已有的工具 & API

| 工具 | 用途 | 費用 |
|---|---|---|
| Claude API | 文章生成、腳本、品質控制 | 按用量 |
| OpenAI API | DALL-E 3 生成卡通場景圖 | $0.04/張 |
| Google Trends API | 自動抓熱門議題 | 免費 |
| Reddit API | 自動抓熱門話題 | 免費 |
| YouTube Data API | 自動抓熱門影片主題 | 免費 |
| News API | 自動抓最新新聞 | 免費 |
| Supabase | 主題佇列、發佈記錄、費用追蹤 | 免費 |
| Pixabay API | 自動抓免費卡通插圖 | 免費 |
| Freepik Premium | 手動素材庫（備用） | 已有 |
| Canva Pro | 手動設計（無 API，備用） | 已有 |

---

## 9 個檔案架構

```
config.py              ← 所有設定集中這裡
setup.sql              ← Supabase 建表
topic_fetcher.py       ← 自動選題
full_pipeline_v3.py    ← 文章 → 影片
publisher.py           ← 10 個平台發佈
quality_control.py     ← 品質控制
growth.py              ← 成長功能
master_controller.py   ← 主控腳本
README.md              ← 安裝說明
```

---

## 完整流程

```
每天早上 9:00 cron 自動觸發
        ↓
topic_fetcher.py
├── Google Trends 抓熱門議題
├── Reddit 抓熱門話題
├── YouTube 抓熱門影片主題
├── News API 抓最新新聞
├── Google Search Console（第4-15名關鍵字）
└── 全部存入 Supabase topics 表
        ↓
Supabase 主題佇列
├── 手動填表單（你自己加的主題）優先
├── 自動抓的主題排後面
└── 支援預訂發佈時間
        ↓
master_controller.py 抓待處理主題
        ↓
    ┌─────────────────────────────┐
    │ 模式 A：全新生成             │
    │ 輸入主題                     │
    │ → Claude 生成文章 + 腳本     │
    ├─────────────────────────────┤
    │ 模式 B：已有文章             │
    │ 貼入文章內容                 │
    │ → Claude 只生成影片腳本      │
    └─────────────────────────────┘
        ↓
full_pipeline_v3.py
├── 圖片生成（優先順序）
│   ├── 1. Pixabay API（免費卡通圖，主要）
│   ├── 2. DALL-E 3（$0.04/張，備用）
│   └── 3. Freepik 素材庫（手動準備，最後備用）
├── Edge TTS 配音（免費）
├── FFmpeg 合成影片
└── 輸出 4 種尺寸
    ├── youtube_linkedin.mp4               1920×1080
    ├── tiktok.mp4                         1080×1920
    ├── instagram_facebook_threads.mp4     1080×1080
    └── pinterest_reddit_bluesky.mp4       1000×1500
        ↓
quality_control.py
├── 抄襲檢查（Copyscape）
├── 不合格 → Claude 重寫
├── 自動插入內部連結
├── 自動生成 FAQ（搶 Google 精選摘要）
├── 自動圖片 Alt 標籤
└── A/B 測試標題生成
        ↓
publisher.py（10 個平台）
├──  1. YouTube（影片上傳）
├──  2. WordPress（文章 + 嵌入影片 + SEO）
├──  3. Facebook（文章摘要 + 連結）
├──  4. Instagram（圖片 + 摘要）
├──  5. LinkedIn（文章 + 連結）
├──  6. TikTok（短影片）
├──  7. Threads（文字摘要）
├──  8. Pinterest（圖片 + 連結）
├──  9. Reddit（文章討論）
└── 10. Bluesky（文字摘要）
        ↓
growth.py（後續自動化）
├── Google Drive 備份（影片 + JSON）
└── Supabase 記錄發佈結果 + 費用
        ↓
Telegram 通知
├── 每篇成功：YouTube 連結 + WP 連結 + 費用
├── 每篇失敗：錯誤訊息
└── 每日摘要：成功 / 失敗數量
```

---

## 定期自動執行任務

```bash
# 每天早上 9 點：主流程
0 9 * * * python master_controller.py

# 每週一早上 8 點：發電子報
0 8 * * 1 python master_controller.py --newsletter

# 每月 1 號：更新舊文章
0 10 1 * * python master_controller.py --update-old
```

---

## Supabase 資料表

| 資料表 | 用途 |
|---|---|
| `topics` | 主題佇列（含模式 A/B、優先順序、排程時間） |
| `publish_log` | 每個平台發佈記錄 |
| `cost_log` | API 費用追蹤 |
| `ab_tests` | A/B 標題測試記錄 |

---

## 每月費用估算（每天 1 篇 × 30 天）

| 項目 | 單價 | 月費 |
|---|---|---|
| Claude API | $0.05 / 篇 | $1.5 |
| DALL-E 3 | $0.04 / 張 × 7 張 | $8.4 |
| VPS 伺服器 | — | $5–10 |
| Copyscape | — | ~$1 |
| 其他全部 | — | $0 |
| **總計** | | **$16–21 美元** |

---

## 影片輸出尺寸對應平台

| 檔案名稱 | 尺寸 | 平台 |
|---|---|---|
| `youtube_linkedin.mp4` | 1920×1080 | YouTube、LinkedIn |
| `tiktok.mp4` | 1080×1920 | TikTok |
| `instagram_facebook_threads.mp4` | 1080×1080 | Instagram、Facebook、Threads |
| `pinterest_reddit_bluesky.mp4` | 1000×1500 | Pinterest、Reddit、Bluesky |

---

## 啟動步驟

### 第一步：環境安裝

```bash
sudo apt install ffmpeg fonts-noto-cjk

pip install anthropic openai edge-tts requests moviepy \
    pillow google-auth google-auth-oauthlib \
    google-api-python-client pytrends praw
```

### 第二步：建 Supabase 資料表

打開 `setup.sql` → 複製全部 → Supabase SQL Editor 貼上執行

### 第三步：填入 API Key

打開 `config.py`，逐一填入所有空白欄位

### 第四步：YouTube OAuth 授權

1. Google Cloud Console → 建立專案
2. 啟用 YouTube Data API v3
3. 建立 OAuth 憑證（桌面應用程式）
4. 下載 JSON → 改名 `client_secrets.json` → 放同資料夾
5. 第一次執行會開瀏覽器授權，之後自動記住

### 第五步：準備 Freepik 素材（可選）

從 Freepik 下載素材，整理成以下結構：

```
assets/
  backgrounds/    ← 卡通背景圖（JPG/PNG）
  characters/     ← 卡通人物（透明背景 PNG）
  objects/        ← 物件圖示（透明背景 PNG）
```

### 第六步：測試執行

```bash
python master_controller.py
```

### 第七步：設定 cron 排程

```bash
bash cron_setup.sh
```

---

## 各平台 API 設定說明

### WordPress
後台 → 使用者 → 編輯個人資料 → 應用程式密碼 → 新增

### YouTube OAuth
Google Cloud Console → YouTube Data API v3 → OAuth 憑證 → 桌面應用程式

### Instagram / Facebook / Threads
Meta for Developers → 建立 App → Meta Graph API → 需要 Business 帳號

### Bluesky
bsky.social → 設定 → 隱私和安全 → 應用程式密碼

### Reddit
reddit.com/prefs/apps → 建立 app（選 script 類型）

### TikTok
developers.tiktok.com → 申請 Content Posting API 權限

### Pinterest
developers.pinterest.com → 建立 app → 取得 access token

### LinkedIn
linkedin.com/developers → 建立 app → 申請 `w_member_social` 權限

### Telegram Bot
1. 搜尋 @BotFather → `/newbot` → 取得 Token
2. 搜尋 @userinfobot → 取得 Chat ID

---

## 品質控制流程

```
新文章生成完成
        ↓
Copyscape 抄襲檢查
├── 通過 → 繼續
└── 不通過 → Claude 重寫（最多 2 次）
        ↓
自動插入內部連結（掃描已有文章，插入 2–3 個相關連結）
        ↓
自動生成 FAQ（5 個問答，加在文末，搶 Google 精選摘要）
        ↓
自動生成圖片 Alt 標籤（每張圖片自動命名，SEO 用）
        ↓
A/B 測試標題（生成備用標題 B，存入 Supabase 追蹤）
        ↓
發佈
```

---

## 成長功能（定期執行）

| 功能 | 執行頻率 | 說明 |
|---|---|---|
| 電子報 | 每週一 | 把本週最佳文章整理成電子報，Mailchimp 自動寄出 |
| 舊文更新 | 每月 1 號 | 抓 3 個月前的文章，Claude 重新優化後更新 |
| 競爭對手監控 | 每天（選配）| 爬取競爭對手新文章，加入選題佇列 |
| Google Drive 備份 | 每篇完成後 | 自動備份影片 + JSON 到雲端 |
| 電子書生成 | 手動觸發 | 把同類文章合併成 PDF 電子書 |

---

## 未來可加功能（第三階段）

- 成本追蹤儀表板（網頁版，Supabase + React）
- 多語言翻譯（英文、日文、簡中）自動發佈
- 自動插入聯盟行銷連結（Amazon / 蝦皮）
- Hotjar 熱圖分析整合
- 自動發佈時間優化（分析最佳發文時段）
- 季節性內容預測（提前 4–6 週排入節慶主題）
- 贊助商配對（Claude 草擬合作提案信）

---

*最後更新：2025 · 台灣繁體中文優化版*
