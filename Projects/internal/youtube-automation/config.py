#!/usr/bin/env python3
"""
config.py — 全自動影片發佈系統的單一設定來源（SSOT）

所有金鑰與設定一律從環境變數讀取，禁止硬編。
本機開發：複製 .env.example 為 .env 後填值，python-dotenv 會自動載入。
正式排程：用 systemd / cron 的 EnvironmentFile 或 export 注入。
"""

import os
from pathlib import Path

# 自動載入 .env（若有安裝 python-dotenv）
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


# ─────────────────────────────────────────
# AI — 腳本與圖片
# ─────────────────────────────────────────
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
CLAUDE_MODEL   = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")   # DALL-E 3 圖片生成
IMAGE_MODEL    = os.getenv("IMAGE_MODEL", "dall-e-3")
IMAGE_SIZE     = os.getenv("IMAGE_SIZE", "1792x1024")

# ─────────────────────────────────────────
# WordPress
# ─────────────────────────────────────────
WP_URL      = os.getenv("WP_URL", "")
WP_USERNAME = os.getenv("WP_USERNAME", "")
WP_PASSWORD = os.getenv("WP_PASSWORD", "")          # WordPress 應用程式密碼
WP_STATUS   = os.getenv("WP_STATUS", "publish")     # publish / draft
WP_ENABLE   = _bool("WP_ENABLE", "true")            # 設 false 可跳過 WP 發佈

# ─────────────────────────────────────────
# YouTube OAuth
# ─────────────────────────────────────────
YOUTUBE_CLIENT_SECRETS = os.getenv("YOUTUBE_CLIENT_SECRETS", "client_secrets.json")
YOUTUBE_TOKEN_FILE     = os.getenv("YOUTUBE_TOKEN_FILE", "youtube_token.json")
YOUTUBE_PRIVACY        = os.getenv("YOUTUBE_PRIVACY", "public")  # public / unlisted / private
YOUTUBE_ENABLE         = _bool("YOUTUBE_ENABLE", "true")

# ─────────────────────────────────────────
# 影片設定
# ─────────────────────────────────────────
BASE_WIDTH    = int(os.getenv("BASE_WIDTH", "1920"))
BASE_HEIGHT   = int(os.getenv("BASE_HEIGHT", "1080"))
FPS           = int(os.getenv("FPS", "24"))
TTS_VOICE     = os.getenv("TTS_VOICE", "zh-TW-HsiaoChenNeural")
CARTOON_STYLE = os.getenv(
    "CARTOON_STYLE",
    "flat design cartoon illustration, colorful, simple, clean, 2D animation style, no text, ",
)

# 輸出尺寸（多平台）
FORMATS = {
    "youtube_linkedin":       (1920, 1080),
    "tiktok_reels":           (1080, 1920),
    "instagram_facebook":     (1080, 1080),
    "twitter_reddit_bluesky": (1280, 720),
}

# 輸出 / 暫存目錄（可被 env 覆蓋，方便排程指定絕對路徑）
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", str(Path(__file__).parent / "output")))
TEMP_DIR   = Path(os.getenv("TEMP_DIR", str(Path(__file__).parent / "temp")))

# ─────────────────────────────────────────
# Supabase 主題佇列
# ─────────────────────────────────────────
SUPABASE_URL   = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "topics")
MAX_TOPICS_PER_RUN = int(os.getenv("MAX_TOPICS_PER_RUN", "3"))

# ─────────────────────────────────────────
# Telegram 通知
# ─────────────────────────────────────────
TELEGRAM_TOKEN   = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# ─────────────────────────────────────────
# 自動抓熱門議題（各來源獨立開關）
# ─────────────────────────────────────────
ENABLE_GOOGLE_TRENDS = _bool("ENABLE_GOOGLE_TRENDS", "false")
TRENDS_GEO           = os.getenv("TRENDS_GEO", "taiwan")  # pytrends pn 值

REDDIT_CLIENT_ID     = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT    = os.getenv("REDDIT_USER_AGENT", "autopublish/1.0")
REDDIT_SUBREDDITS    = [s.strip() for s in os.getenv("REDDIT_SUBREDDITS", "").split(",") if s.strip()]

YOUTUBE_API_KEY        = os.getenv("YOUTUBE_API_KEY", "")
YOUTUBE_SEARCH_QUERIES = [s.strip() for s in os.getenv("YOUTUBE_SEARCH_QUERIES", "").split(",") if s.strip()]

NEWS_API_KEY  = os.getenv("NEWS_API_KEY", "")
NEWS_QUERIES  = [s.strip() for s in os.getenv("NEWS_QUERIES", "").split(",") if s.strip()]
NEWS_LANGUAGE = os.getenv("NEWS_LANGUAGE", "zh")


def require(*names: str) -> None:
    """啟動前檢查必要設定，缺漏即丟出清楚的錯誤。"""
    missing = [n for n in names if not globals().get(n)]
    if missing:
        raise RuntimeError(
            f"缺少必要設定：{', '.join(missing)}。請在 .env 或環境變數填入後再執行。"
        )
