#!/usr/bin/env python3
"""
controller.py — 全自動內容發佈主控腳本

功能：
  - Supabase 主題佇列（支援模式 A / B）
  - 自動從 Google Trends / Reddit / YouTube / News API 抓熱門議題
  - 直接呼叫 pipeline.run() 執行全流程（不再 subprocess + 解析 stdout）
  - Telegram 成功/失敗/每日摘要通知

排程：見 cron_setup.sh（建議用 venv 的 python）。
"""

import time
import traceback
import requests
from datetime import datetime, timezone

import config
import pipeline


# ═══════════════════════════════════════════
# Supabase 操作
# ═══════════════════════════════════════════
def supabase_request(method, endpoint, data=None):
    config.require("SUPABASE_URL", "SUPABASE_KEY")
    url = f"{config.SUPABASE_URL}/rest/v1/{endpoint}"
    headers = {
        "apikey": config.SUPABASE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    r = requests.request(method, url, headers=headers, json=data, timeout=15)
    if r.status_code >= 400:
        raise Exception(f"Supabase {r.status_code}: {r.text[:200]}")
    return r.json() if r.text else {}


def get_pending_topics():
    now = datetime.now(timezone.utc).isoformat()
    result = supabase_request(
        "GET",
        f"{config.SUPABASE_TABLE}"
        f"?status=eq.pending"
        f"&or=(scheduled_at.is.null,scheduled_at.lte.{now})"
        f"&order=priority.asc,scheduled_at.asc.nullsfirst,created_at.asc"
        f"&limit={config.MAX_TOPICS_PER_RUN}"
    )
    return result if isinstance(result, list) else []


def update_topic(topic_id, data):
    supabase_request("PATCH", f"{config.SUPABASE_TABLE}?id=eq.{topic_id}", data)


def insert_topics(topics, source):
    if not topics:
        return
    existing = supabase_request("GET", f"{config.SUPABASE_TABLE}?status=eq.pending&select=topic")
    existing_set = {r["topic"] for r in existing} if isinstance(existing, list) else set()
    rows = [
        {"topic": t, "source": source, "priority": 7, "status": "pending", "mode": "A"}
        for t in topics if t not in existing_set
    ]
    if rows:
        supabase_request("POST", config.SUPABASE_TABLE, rows)
        print(f"   +{len(rows)} 個主題（{source}）")
    else:
        print(f"   {source} 主題已存在，略過")


# ═══════════════════════════════════════════
# 自動抓熱門議題
# ═══════════════════════════════════════════
def fetch_google_trends():
    if not config.ENABLE_GOOGLE_TRENDS:
        return []
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="zh-TW", tz=480)
        trending = pytrends.trending_searches(pn=config.TRENDS_GEO)
        topics = trending[0].tolist()[:10]
        print(f"   Google Trends: {len(topics)}")
        return topics
    except Exception as e:
        print(f"   [warn] Google Trends: {e}")
        return []


def fetch_reddit_topics():
    if not config.REDDIT_CLIENT_ID or not config.REDDIT_SUBREDDITS:
        return []
    try:
        import praw
        reddit = praw.Reddit(
            client_id=config.REDDIT_CLIENT_ID,
            client_secret=config.REDDIT_CLIENT_SECRET,
            user_agent=config.REDDIT_USER_AGENT,
        )
        topics = []
        for sub in config.REDDIT_SUBREDDITS[:3]:
            for post in reddit.subreddit(sub).hot(limit=5):
                if not post.stickied:
                    topics.append(post.title)
        print(f"   Reddit: {len(topics)}")
        return topics[:10]
    except Exception as e:
        print(f"   [warn] Reddit: {e}")
        return []


def fetch_youtube_topics():
    if not config.YOUTUBE_API_KEY or not config.YOUTUBE_SEARCH_QUERIES:
        return []
    try:
        topics = []
        for query in config.YOUTUBE_SEARCH_QUERIES[:2]:
            r = requests.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet", "q": query, "type": "video",
                    "order": "viewCount", "maxResults": 5,
                    "key": config.YOUTUBE_API_KEY, "relevanceLanguage": "zh-TW",
                },
                timeout=10,
            )
            if r.ok:
                for item in r.json().get("items", []):
                    topics.append(item["snippet"]["title"])
        print(f"   YouTube: {len(topics)}")
        return topics[:10]
    except Exception as e:
        print(f"   [warn] YouTube: {e}")
        return []


def fetch_news_topics():
    if not config.NEWS_API_KEY or not config.NEWS_QUERIES:
        return []
    try:
        topics = []
        for query in config.NEWS_QUERIES[:2]:
            r = requests.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": query, "language": config.NEWS_LANGUAGE,
                    "sortBy": "publishedAt", "pageSize": 5,
                    "apiKey": config.NEWS_API_KEY,
                },
                timeout=10,
            )
            if r.ok:
                for article in r.json().get("articles", []):
                    topics.append(article["title"])
        print(f"   News API: {len(topics)}")
        return topics[:10]
    except Exception as e:
        print(f"   [warn] News API: {e}")
        return []


def auto_fetch_topics():
    print("\n抓取熱門議題...")
    insert_topics(fetch_google_trends(), "google_trends")
    insert_topics(fetch_reddit_topics(), "reddit")
    insert_topics(fetch_youtube_topics(), "youtube")
    insert_topics(fetch_news_topics(), "news")


# ═══════════════════════════════════════════
# Telegram 通知
# ═══════════════════════════════════════════
def telegram(message):
    if not config.TELEGRAM_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{config.TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": config.TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"},
            timeout=10,
        )
    except Exception as e:
        print(f"   [warn] Telegram: {e}")


def notify_success(topic, youtube_url, wp_url, cost):
    telegram(
        f"<b>發佈成功！</b>\n\n"
        f"{topic}\n"
        f"YouTube: {youtube_url}\n"
        f"WP: {wp_url}\n"
        f"花費: {cost}\n"
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )


def notify_failure(topic, error):
    telegram(
        f"<b>發佈失敗！</b>\n\n"
        f"{topic}\n"
        f"{str(error)[:300]}\n"
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )


def notify_summary(done, failed):
    telegram(
        f"<b>今日摘要</b>\n\n"
        f"成功: {done} 篇\n"
        f"失敗: {failed} 篇\n"
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )


# ═══════════════════════════════════════════
# 執行 Pipeline（模式 A / B）
# ═══════════════════════════════════════════
def run_pipeline(row):
    topic = row["topic"]
    mode = row.get("mode", "A").upper()
    print(f"   模式 {mode} | {topic}")

    if mode == "B":
        title = row.get("article_input_title") or topic
        content = row.get("article_content", "")
        if not content:
            raise Exception("模式 B 需要 article_content，但欄位是空的")
        return pipeline.run("B", article_title=title, article_content=content)

    return pipeline.run("A", topic=topic)


# ═══════════════════════════════════════════
# 主程式
# ═══════════════════════════════════════════
def main():
    print("=" * 60)
    print("  全自動發佈主控系統")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    done_count = failed_count = 0

    try:
        auto_fetch_topics()
    except Exception as e:
        print(f"[warn] 自動抓題失敗（不影響主流程）: {e}")

    print("\n抓取待處理主題...")
    try:
        topics = get_pending_topics()
    except Exception as e:
        msg = f"無法連接 Supabase: {e}"
        print(f"[err] {msg}")
        telegram(f"主控腳本無法啟動：{msg}")
        return

    if not topics:
        print("   今日沒有待處理主題。")
        telegram("今日沒有待處理主題，請到 Supabase 新增。")
        return

    print(f"   找到 {len(topics)} 個主題")

    for row in topics:
        topic_id = row["id"]
        topic = row["topic"]
        mode = row.get("mode", "A").upper()
        print(f"\n{'-' * 50}\n主題：{topic}（模式 {mode}）")

        update_topic(topic_id, {"status": "processing"})
        try:
            result = run_pipeline(row)
            update_topic(topic_id, {
                "status": "done",
                "done_at": datetime.now(timezone.utc).isoformat(),
                "youtube_url": result.get("youtube_url", ""),
                "wp_url": result.get("wp_url", ""),
                "article_title": result.get("article_title", topic),
            })
            notify_success(
                topic,
                result.get("youtube_url", ""),
                result.get("wp_url", ""),
                result.get("cost_estimate", {}).get("total", ""),
            )
            done_count += 1
            print(f"完成：{topic}")
        except Exception as e:
            print(f"[err] 失敗：{e}")
            traceback.print_exc()
            update_topic(topic_id, {"status": "pending"})
            notify_failure(topic, e)
            failed_count += 1
        time.sleep(5)

    print(f"\n{'=' * 60}\n完成｜成功 {done_count}｜失敗 {failed_count}")
    notify_summary(done_count, failed_count)


if __name__ == "__main__":
    main()
