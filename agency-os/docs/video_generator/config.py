"""
config.py
所有設定集中在這裡，其他腳本都從這裡 import
"""

# ═══════════════════════════════════════════
# AI API
# ═══════════════════════════════════════════
CLAUDE_API_KEY  = ""   # Anthropic API Key
OPENAI_API_KEY  = ""   # OpenAI API Key（DALL-E 3 用）

# ═══════════════════════════════════════════
# Supabase
# ═══════════════════════════════════════════
SUPABASE_URL    = ""   # https://xxx.supabase.co
SUPABASE_KEY    = ""   # anon key

# ═══════════════════════════════════════════
# WordPress
# ═══════════════════════════════════════════
WP_URL          = ""   # https://你的網站.com
WP_USERNAME     = ""   # WordPress 帳號
WP_PASSWORD     = ""   # 應用程式密碼（後台→使用者→應用程式密碼）

# ═══════════════════════════════════════════
# YouTube
# ═══════════════════════════════════════════
YOUTUBE_CLIENT_SECRETS = "client_secrets.json"
YOUTUBE_TOKEN_FILE     = "youtube_token.json"
YOUTUBE_API_KEY        = ""   # Data API Key（選題用）

# ═══════════════════════════════════════════
# 社群平台
# ═══════════════════════════════════════════

# Twitter/X（目前未使用，保留）
TWITTER_API_KEY         = ""
TWITTER_API_SECRET      = ""
TWITTER_ACCESS_TOKEN    = ""
TWITTER_ACCESS_SECRET   = ""

# Reddit
REDDIT_CLIENT_ID        = ""
REDDIT_CLIENT_SECRET    = ""
REDDIT_USERNAME         = ""
REDDIT_PASSWORD         = ""
REDDIT_USER_AGENT       = "autopublish/1.0"
REDDIT_SUBREDDITS       = []   # 例：["taiwan", "investing"]

# Bluesky
BLUESKY_HANDLE          = ""   # 例：yourname.bsky.social
BLUESKY_PASSWORD        = ""   # App Password（不是登入密碼）

# Instagram / Threads / Facebook（Meta Graph API）
META_ACCESS_TOKEN       = ""
META_INSTAGRAM_ID       = ""   # Instagram Business Account ID
META_FACEBOOK_PAGE_ID   = ""   # Facebook Page ID
META_THREADS_ID         = ""   # Threads User ID

# LinkedIn
LINKEDIN_ACCESS_TOKEN   = ""
LINKEDIN_PERSON_ID      = ""   # urn:li:person:xxx

# TikTok
TIKTOK_ACCESS_TOKEN     = ""
TIKTOK_OPEN_ID          = ""

# Pinterest
PINTEREST_ACCESS_TOKEN  = ""
PINTEREST_BOARD_ID      = ""

# ═══════════════════════════════════════════
# 選題來源
# ═══════════════════════════════════════════
TRENDS_GEO             = "TW"
TRENDS_KEYWORDS        = []    # 例：["AI", "科技", "投資"]
REDDIT_FETCH_SUBS      = []    # 例：["taiwan", "technology"]
YOUTUBE_SEARCH_QUERIES = []    # 例：["台灣科技新聞"]
NEWS_API_KEY           = ""
NEWS_QUERIES           = []    # 例：["人工智慧", "台灣股市"]
NEWS_LANGUAGE          = "zh"

# Google Search Console
GSC_SITE_URL           = ""    # 例：https://你的網站.com
GSC_CREDENTIALS_FILE   = "gsc_credentials.json"

# ═══════════════════════════════════════════
# 品質控制
# ═══════════════════════════════════════════
COPYSCAPE_USER         = ""
COPYSCAPE_API_KEY      = ""

# ═══════════════════════════════════════════
# 電子報
# ═══════════════════════════════════════════
MAILCHIMP_API_KEY      = ""
MAILCHIMP_LIST_ID      = ""
MAILCHIMP_FROM_NAME    = ""
MAILCHIMP_FROM_EMAIL   = ""

# ═══════════════════════════════════════════
# 備份
# ═══════════════════════════════════════════
GDRIVE_CREDENTIALS     = "gdrive_credentials.json"
GDRIVE_FOLDER_ID       = ""    # Google Drive 備份資料夾 ID

# ═══════════════════════════════════════════
# 通知
# ═══════════════════════════════════════════
TELEGRAM_TOKEN         = ""
TELEGRAM_CHAT_ID       = ""

# ═══════════════════════════════════════════
# 影片設定
# ═══════════════════════════════════════════
VIDEO_WIDTH            = 1920
VIDEO_HEIGHT           = 1080
FPS                    = 24
TTS_VOICE              = "zh-TW-HsiaoChenNeural"  # 台灣女聲
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
MAX_TOPICS_PER_RUN     = 3     # 每次最多執行幾個主題
PIPELINE_TIMEOUT       = 1800  # 單一主題最長執行時間（秒）

# 資料夾
from pathlib import Path
OUTPUT_DIR = Path("output")
TEMP_DIR   = Path("temp")
OUTPUT_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
