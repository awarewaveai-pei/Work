"""
config.py
所有設定集中在這裡，其他腳本都從這裡 import。

密鑰一律從「環境變數」讀取（禁止硬編進檔案 / git）。注入方式：
  - Windows 本機：mcp/user-env.ps1 + vault-sync 寫入 User 環境變數
  - VPS cron：systemd EnvironmentFile 或 /etc/default/autopublish
  - 臨時測試：執行前 export / $env: 設定
某個 env 未設定時，對應功能會自動略過（各 publisher / fetcher 已有 guard）。
"""

import os
from pathlib import Path


def _env(name, default=""):
    return os.getenv(name, default)


def _env_list(name):
    """逗號分隔字串 → list，空值回空 list。例：REDDIT_SUBREDDITS=taiwan,investing"""
    return [s.strip() for s in _env(name).split(",") if s.strip()]


# ═══════════════════════════════════════════
# AI API
# ═══════════════════════════════════════════
CLAUDE_API_KEY  = _env("CLAUDE_API_KEY") or _env("ANTHROPIC_API_KEY")
OPENAI_API_KEY  = _env("OPENAI_API_KEY")
CLAUDE_MODEL    = _env("CLAUDE_MODEL", "claude-opus-5-5")
# Claude 計價（USD / 1M tokens）→ 用於實際成本計算。預設為 claude-opus-5-5 定價，可用 env 覆寫。
CLAUDE_INPUT_PRICE  = float(_env("CLAUDE_INPUT_PRICE_PER_MTOK", "4"))
CLAUDE_OUTPUT_PRICE = float(_env("CLAUDE_OUTPUT_PRICE_PER_MTOK", "20"))

# ═══════════════════════════════════════════
# Supabase
# ═══════════════════════════════════════════
SUPABASE_URL    = _env("SUPABASE_URL")   # https://xxx.supabase.co
SUPABASE_KEY    = _env("SUPABASE_KEY")   # service_role 或 anon key

# ═══════════════════════════════════════════
# WordPress
# ═══════════════════════════════════════════
WP_URL          = _env("WP_URL").rstrip("/")
WP_USERNAME     = _env("WP_USERNAME")
WP_PASSWORD     = _env("WP_PASSWORD")    # 應用程式密碼（後台→使用者→應用程式密碼）

# ═══════════════════════════════════════════
# YouTube
# ═══════════════════════════════════════════
YOUTUBE_CLIENT_SECRETS = _env("YOUTUBE_CLIENT_SECRETS", "client_secrets.json")
YOUTUBE_TOKEN_FILE     = _env("YOUTUBE_TOKEN_FILE", "youtube_token.json")
YOUTUBE_API_KEY        = _env("YOUTUBE_API_KEY")   # Data API Key（選題用）

# ═══════════════════════════════════════════
# 圖片來源
# ═══════════════════════════════════════════
PIXABAY_API_KEY        = _env("PIXABAY_API_KEY")   # 免費申請 pixabay.com/api

# ═══════════════════════════════════════════
# 社群平台
# ═══════════════════════════════════════════

# Twitter/X（目前未使用，保留）
TWITTER_API_KEY         = _env("TWITTER_API_KEY")
TWITTER_API_SECRET      = _env("TWITTER_API_SECRET")
TWITTER_ACCESS_TOKEN    = _env("TWITTER_ACCESS_TOKEN")
TWITTER_ACCESS_SECRET   = _env("TWITTER_ACCESS_SECRET")

# Reddit
REDDIT_CLIENT_ID        = _env("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET    = _env("REDDIT_CLIENT_SECRET")
REDDIT_USERNAME         = _env("REDDIT_USERNAME")
REDDIT_PASSWORD         = _env("REDDIT_PASSWORD")
REDDIT_USER_AGENT       = _env("REDDIT_USER_AGENT", "autopublish/1.0")
REDDIT_SUBREDDITS       = _env_list("REDDIT_SUBREDDITS")   # 發佈目標，例：taiwan,investing
# 自動發文到 subreddit 極易被當 spam ban → 預設關閉，確認各 sub 規則允許後才開 true
REDDIT_ENABLE           = _env("REDDIT_ENABLE", "false").lower() == "true"

# Bluesky
BLUESKY_HANDLE          = _env("BLUESKY_HANDLE")     # 例：yourname.bsky.social
BLUESKY_PASSWORD        = _env("BLUESKY_PASSWORD")   # App Password（不是登入密碼）

# Instagram / Threads / Facebook（Meta Graph API）
META_ACCESS_TOKEN       = _env("META_ACCESS_TOKEN")
META_INSTAGRAM_ID       = _env("META_INSTAGRAM_ID")     # Instagram Business Account ID
META_FACEBOOK_PAGE_ID   = _env("META_FACEBOOK_PAGE_ID")  # Facebook Page ID
META_THREADS_ID         = _env("META_THREADS_ID")       # Threads User ID

# LinkedIn
LINKEDIN_ACCESS_TOKEN   = _env("LINKEDIN_ACCESS_TOKEN")
LINKEDIN_PERSON_ID      = _env("LINKEDIN_PERSON_ID")    # urn:li:person:xxx

# TikTok
TIKTOK_ACCESS_TOKEN     = _env("TIKTOK_ACCESS_TOKEN")
TIKTOK_OPEN_ID          = _env("TIKTOK_OPEN_ID")
# 未審核（unaudited）的 app 只能發 SELF_ONLY。app 通過 audit 後才可改 PUBLIC_TO_EVERYONE。
TIKTOK_PRIVACY          = _env("TIKTOK_PRIVACY", "SELF_ONLY")

# Pinterest
PINTEREST_ACCESS_TOKEN  = _env("PINTEREST_ACCESS_TOKEN")
PINTEREST_BOARD_ID      = _env("PINTEREST_BOARD_ID")

# ═══════════════════════════════════════════
# 選題來源
# ═══════════════════════════════════════════
TRENDS_GEO             = _env("TRENDS_GEO", "TW")
TRENDS_KEYWORDS        = _env_list("TRENDS_KEYWORDS")        # 例：AI,科技,投資
REDDIT_FETCH_SUBS      = _env_list("REDDIT_FETCH_SUBS")      # 例：taiwan,technology
YOUTUBE_SEARCH_QUERIES = _env_list("YOUTUBE_SEARCH_QUERIES")  # 例：台灣科技新聞
NEWS_API_KEY           = _env("NEWS_API_KEY")
NEWS_QUERIES           = _env_list("NEWS_QUERIES")           # 例：人工智慧,台灣股市
NEWS_LANGUAGE          = _env("NEWS_LANGUAGE", "zh")

# Google Search Console
GSC_SITE_URL           = _env("GSC_SITE_URL")               # 例：https://你的網站.com
GSC_CREDENTIALS_FILE   = _env("GSC_CREDENTIALS_FILE", "gsc_credentials.json")

# ═══════════════════════════════════════════
# 品質控制
# ═══════════════════════════════════════════
COPYSCAPE_USER         = _env("COPYSCAPE_USER")
COPYSCAPE_API_KEY      = _env("COPYSCAPE_API_KEY")

# ═══════════════════════════════════════════
# 電子報
# ═══════════════════════════════════════════
MAILCHIMP_API_KEY      = _env("MAILCHIMP_API_KEY")
MAILCHIMP_LIST_ID      = _env("MAILCHIMP_LIST_ID")
MAILCHIMP_FROM_NAME    = _env("MAILCHIMP_FROM_NAME")
MAILCHIMP_FROM_EMAIL   = _env("MAILCHIMP_FROM_EMAIL")

# ═══════════════════════════════════════════
# 備份
# ═══════════════════════════════════════════
GDRIVE_CREDENTIALS     = _env("GDRIVE_CREDENTIALS", "gdrive_credentials.json")
GDRIVE_FOLDER_ID       = _env("GDRIVE_FOLDER_ID")           # Google Drive 備份資料夾 ID

# ═══════════════════════════════════════════
# 通知
# ═══════════════════════════════════════════
TELEGRAM_TOKEN         = _env("TELEGRAM_TOKEN")
TELEGRAM_CHAT_ID       = _env("TELEGRAM_CHAT_ID")

# ═══════════════════════════════════════════
# 影片設定
# ═══════════════════════════════════════════
VIDEO_WIDTH            = int(_env("VIDEO_WIDTH", "1920"))
VIDEO_HEIGHT           = int(_env("VIDEO_HEIGHT", "1080"))
FPS                    = int(_env("FPS", "24"))
TTS_VOICE              = _env("TTS_VOICE", "zh-TW-HsiaoChenNeural")  # 台灣女聲
CARTOON_STYLE          = "flat design cartoon illustration, colorful, simple, clean, 2D animation style, no text, "

# 輸出尺寸（平台對應）
VIDEO_FORMATS = {
    "youtube_linkedin":          (1920, 1080),
    "tiktok":                    (1080, 1920),
    "instagram_facebook_threads": (1080, 1080),
    "pinterest_reddit_bluesky":  (1000, 1500),
}

# ═══════════════════════════════════════════
# 執行設定
# ═══════════════════════════════════════════
MAX_TOPICS_PER_RUN     = int(_env("MAX_TOPICS_PER_RUN", "3"))   # 每次最多執行幾個主題
PIPELINE_TIMEOUT       = int(_env("PIPELINE_TIMEOUT", "1800"))  # 單一 ffmpeg 步驟最長執行時間（秒）

# 資料夾
OUTPUT_DIR = Path(_env("OUTPUT_DIR", "output"))
TEMP_DIR   = Path(_env("TEMP_DIR", "temp"))
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
