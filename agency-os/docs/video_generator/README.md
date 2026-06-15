# 全自動內容發佈系統

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `config.py` | 所有設定集中在這裡 |
| `setup.sql` | Supabase 建表 SQL |
| `topic_fetcher.py` | 自動抓熱門議題 |
| `full_pipeline_v3.py` | 文章→影片主腳本 |
| `publisher.py` | 10 個平台發佈 |
| `quality_control.py` | 品質控制 |
| `growth.py` | 成長功能 |
| `master_controller.py` | 主控腳本 |

## 安裝

```bash
sudo apt install ffmpeg fonts-noto-cjk
pip install anthropic openai edge-tts requests moviepy pillow \
    google-auth google-auth-oauthlib google-api-python-client \
    pytrends praw
```

## 設定步驟

1. `setup.sql` → Supabase SQL Editor 執行
2. `config.py` → 填入所有 API Key
3. YouTube OAuth → 放 client_secrets.json 到同資料夾
4. Freepik 素材 → 下載後放到 assets/backgrounds/ 和 assets/characters/

## 執行

```bash
# 手動執行
python master_controller.py

# 設定每日排程（早上 9 點）
crontab -e
0 9 * * * /usr/bin/python3 /你的路徑/master_controller.py >> /var/log/autopublish.log 2>&1

# 每週一發電子報
0 8 * * 1 /usr/bin/python3 /你的路徑/master_controller.py --newsletter >> /var/log/autopublish.log 2>&1

# 每月更新舊文章
0 10 1 * * /usr/bin/python3 /你的路徑/master_controller.py --update-old >> /var/log/autopublish.log 2>&1
```

## 平台設定說明

### WordPress
後台 → 使用者 → 編輯個人資料 → 應用程式密碼 → 新增

### YouTube OAuth
1. Google Cloud Console → 建立專案
2. 啟用 YouTube Data API v3
3. 建立 OAuth 憑證（桌面應用程式）
4. 下載 JSON → 改名為 client_secrets.json

### Instagram / Facebook / Threads
需要 Meta Business 帳號 + Meta for Developers

### Bluesky
登入 bsky.social → 設定 → 應用程式密碼

### Reddit
reddit.com/prefs/apps → 建立 app（script 類型）

### TikTok
developers.tiktok.com → 申請 Content Posting API

### Pinterest
developers.pinterest.com → 建立 app → 取得 access token

### LinkedIn
linkedin.com/developers → 建立 app → 申請 w_member_social 權限

## 每月費用估算

| 項目 | 費用 |
|---|---|
| Claude API | ~$1.5–3 |
| DALL-E 3 | ~$3–6 |
| VPS 伺服器 | $5–10 |
| 其他 | $0 |
| **總計** | **$10–20** |

## 圖片來源優先順序

1. Pixabay API（免費，自動抓卡通插圖）
2. DALL-E 3 API（$0.04/張，找不到時用）
3. Freepik 素材庫（手動準備，放 assets/ 資料夾）
4. 純色背景（備用）
