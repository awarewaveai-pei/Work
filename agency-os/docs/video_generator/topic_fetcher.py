"""
topic_fetcher.py
自動從多來源抓取熱門議題並存入 Supabase
"""

import requests
from config import *

def supabase_get(endpoint):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=headers, timeout=15)
    return r.json() if r.ok else []

def supabase_post(endpoint, data):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=headers, json=data, timeout=15)
    return r.ok

def get_existing_topics():
    result = supabase_get("topics?status=eq.pending&select=topic")
    return {r["topic"] for r in result} if isinstance(result, list) else set()

def insert_new_topics(topics, source):
    if not topics:
        return
    existing = get_existing_topics()
    rows = [
        {"topic": t, "source": source, "priority": 7, "status": "pending", "mode": "A"}
        for t in topics if t not in existing
    ]
    if rows:
        supabase_post("topics", rows)
        print(f"   ✅ 新增 {len(rows)} 個主題（{source}）")
    else:
        print(f"   ⏭️  {source} 無新主題")

# ── Google Trends ──
def fetch_google_trends():
    if not TRENDS_KEYWORDS:
        return []
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="zh-TW", tz=480)
        trending = pytrends.trending_searches(pn="taiwan")
        topics = trending[0].tolist()[:10]
        print(f"   Google Trends：{len(topics)} 個")
        return topics
    except Exception as e:
        print(f"   ⚠️  Google Trends：{e}")
        return []

# ── Reddit ──
def fetch_reddit():
    if not REDDIT_CLIENT_ID or not REDDIT_FETCH_SUBS:
        return []
    try:
        import praw
        reddit = praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT,
        )
        topics = []
        for sub in REDDIT_FETCH_SUBS[:3]:
            for post in reddit.subreddit(sub).hot(limit=5):
                if not post.stickied:
                    topics.append(post.title)
        print(f"   Reddit：{len(topics)} 個")
        return topics[:10]
    except Exception as e:
        print(f"   ⚠️  Reddit：{e}")
        return []

# ── YouTube ──
def fetch_youtube():
    if not YOUTUBE_API_KEY or not YOUTUBE_SEARCH_QUERIES:
        return []
    try:
        topics = []
        for query in YOUTUBE_SEARCH_QUERIES[:2]:
            r = requests.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet", "q": query, "type": "video",
                    "order": "viewCount", "maxResults": 5,
                    "key": YOUTUBE_API_KEY, "relevanceLanguage": "zh-TW",
                },
                timeout=10,
            )
            if r.ok:
                for item in r.json().get("items", []):
                    topics.append(item["snippet"]["title"])
        print(f"   YouTube：{len(topics)} 個")
        return topics[:10]
    except Exception as e:
        print(f"   ⚠️  YouTube：{e}")
        return []

# ── News API ──
def fetch_news():
    if not NEWS_API_KEY or not NEWS_QUERIES:
        return []
    try:
        topics = []
        for query in NEWS_QUERIES[:2]:
            r = requests.get(
                "https://newsapi.org/v2/everything",
                params={"q": query, "language": NEWS_LANGUAGE, "sortBy": "publishedAt", "pageSize": 5, "apiKey": NEWS_API_KEY},
                timeout=10,
            )
            if r.ok:
                for a in r.json().get("articles", []):
                    topics.append(a["title"])
        print(f"   News API：{len(topics)} 個")
        return topics[:10]
    except Exception as e:
        print(f"   ⚠️  News API：{e}")
        return []

# ── Google Search Console（第4-15名關鍵字）──
def fetch_gsc_opportunities():
    if not GSC_SITE_URL or not GSC_CREDENTIALS_FILE:
        return []
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        import os
        if not os.path.exists(GSC_CREDENTIALS_FILE):
            return []
        creds = Credentials.from_service_account_file(
            GSC_CREDENTIALS_FILE,
            scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
        )
        service = build("searchconsole", "v1", credentials=creds)
        from datetime import datetime, timedelta
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=28)).strftime("%Y-%m-%d")
        response = service.searchanalytics().query(
            siteUrl=GSC_SITE_URL,
            body={
                "startDate": start_date, "endDate": end_date,
                "dimensions": ["query"],
                "rowLimit": 100,
            }
        ).execute()
        # 找第4-15名的關鍵字（最有機會衝上第一頁）
        opportunities = []
        for row in response.get("rows", []):
            pos = row.get("position", 0)
            if 4 <= pos <= 15:
                opportunities.append(row["keys"][0])
        print(f"   GSC 機會關鍵字：{len(opportunities)} 個")
        return opportunities[:10]
    except Exception as e:
        print(f"   ⚠️  GSC：{e}")
        return []

def run():
    print("\n🔍 自動抓取熱門議題...")
    insert_new_topics(fetch_google_trends(), "google_trends")
    insert_new_topics(fetch_reddit(), "reddit")
    insert_new_topics(fetch_youtube(), "youtube")
    insert_new_topics(fetch_news(), "news")
    insert_new_topics(fetch_gsc_opportunities(), "gsc")

if __name__ == "__main__":
    run()
