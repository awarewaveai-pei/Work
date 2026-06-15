"""
publisher.py
10 個平台自動發佈
"""

import os
import time
import requests
import json
from pathlib import Path
from config import *

def log_publish(topic_id, platform, status, url="", error=""):
    if not SUPABASE_URL:
        return
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/publish_log",
            headers=headers,
            json={"topic_id": topic_id, "platform": platform, "status": status, "url": url, "error": str(error)[:500]},
            timeout=10,
        )
    except Exception as e:
        print(f"   ⚠️  log_publish：{e}")


# ══════════════════════════════════════
# 冪等：查已成功的平台，避免重傳（例如 YouTube 已上傳但 WP 失敗時重跑）
# ══════════════════════════════════════
def get_done_platforms(topic_id):
    """回傳 {platform: url} of 已 status=done 的紀錄。"""
    if not SUPABASE_URL:
        return {}
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/publish_log",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            params={"topic_id": f"eq.{topic_id}", "status": "eq.done", "select": "platform,url"},
            timeout=10,
        )
        if r.ok:
            return {row["platform"]: row.get("url", "") for row in r.json()}
    except Exception as e:
        print(f"   ⚠️  讀取發佈記錄：{e}")
    return {}


def _yt_embed(video_id):
    return (f'<div style="position:relative;padding-bottom:56.25%;height:0;">'
            f'<iframe src="https://www.youtube.com/embed/{video_id}" '
            f'style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" '
            f'allowfullscreen loading="lazy"></iframe></div>')


# ══════════════════════════════════════
# WordPress 媒體上傳 → 取得公開圖片 URL（IG / Pinterest 都強制需要公開 URL）
# ══════════════════════════════════════
def upload_wp_media(image_path):
    if not WP_URL or not image_path or not os.path.exists(image_path):
        return ""
    try:
        fn = os.path.basename(image_path)
        ext = os.path.splitext(fn)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        with open(image_path, "rb") as f:
            r = requests.post(
                f"{WP_URL}/wp-json/wp/v2/media",
                auth=(WP_USERNAME, WP_PASSWORD),
                headers={"Content-Disposition": f'attachment; filename="{fn}"', "Content-Type": mime},
                data=f.read(), timeout=60,
            )
        if r.ok:
            url = r.json().get("source_url", "")
            print(f"   ✅ WP 媒體：{url}")
            return url
        print(f"   ⚠️  WP 媒體上傳：{r.status_code} {r.text[:120]}")
    except Exception as e:
        print(f"   ⚠️  WP 媒體上傳：{e}")
    return ""

# ══════════════════════════════════════
# 1. YouTube
# ══════════════════════════════════════
def publish_youtube(video_path, meta):
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        scopes = ["https://www.googleapis.com/auth/youtube.upload"]
        creds = None
        if os.path.exists(YOUTUBE_TOKEN_FILE):
            creds = Credentials.from_authorized_user_file(YOUTUBE_TOKEN_FILE, scopes)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(YOUTUBE_CLIENT_SECRETS, scopes)
                creds = flow.run_local_server(port=0)
            with open(YOUTUBE_TOKEN_FILE, "w") as f:
                f.write(creds.to_json())

        youtube = build("youtube", "v3", credentials=creds)
        body = {
            "snippet": {
                "title": meta["title"], "description": meta["description"],
                "tags": meta.get("tags", []), "categoryId": "22", "defaultLanguage": "zh-TW",
            },
            "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False}
        }
        media = MediaFileUpload(video_path, chunksize=-1, resumable=True, mimetype="video/mp4")
        req = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            _, response = req.next_chunk()
        video_id = response["id"]
        url = f"https://www.youtube.com/watch?v={video_id}"
        embed = _yt_embed(video_id)
        print(f"   ✅ YouTube：{url}")
        return {"url": url, "embed": embed, "video_id": video_id}
    except Exception as e:
        print(f"   ❌ YouTube：{e}")
        return None

# ══════════════════════════════════════
# 2. WordPress
# ══════════════════════════════════════
def publish_wordpress(article, embed_code, youtube_url):
    try:
        content = f"{embed_code}\n\n{article['content']}\n\n---\n🎬 [觀看完整影片]({youtube_url})"
        api = f"{WP_URL}/wp-json/wp/v2"
        auth = (WP_USERNAME, WP_PASSWORD)

        cat_id = 1
        r = requests.get(f"{api}/categories", params={"search": article.get("category","")}, auth=auth, timeout=10)
        if r.ok and r.json():
            cat_id = r.json()[0]["id"]
        elif article.get("category"):
            r2 = requests.post(f"{api}/categories", json={"name": article["category"]}, auth=auth, timeout=10)
            if r2.ok: cat_id = r2.json()["id"]

        tag_ids = []
        for tag in article.get("tags", []):
            r = requests.post(f"{api}/tags", json={"name": tag}, auth=auth, timeout=10)
            if r.ok:
                tag_ids.append(r.json()["id"])
            else:
                s = requests.get(f"{api}/tags", params={"search": tag}, auth=auth, timeout=10)
                if s.ok and s.json(): tag_ids.append(s.json()[0]["id"])

        post = {
            "title": article["title"], "content": content, "status": "publish",
            "slug": article.get("slug", ""), "categories": [cat_id], "tags": tag_ids,
            "meta": {
                "_yoast_wpseo_title": article.get("seo_title", ""),
                "_yoast_wpseo_metadesc": article.get("meta_description", ""),
            }
        }
        r = requests.post(f"{api}/posts", json=post, auth=auth, timeout=15)
        if r.ok:
            url = r.json().get("link", "")
            print(f"   ✅ WordPress：{url}")
            return url
        else:
            print(f"   ❌ WordPress：{r.status_code}")
            return None
    except Exception as e:
        print(f"   ❌ WordPress：{e}")
        return None

# ══════════════════════════════════════
# 3. Instagram
# ══════════════════════════════════════
def publish_instagram(image_url, caption):
    if not META_ACCESS_TOKEN or not META_INSTAGRAM_ID:
        print("   ⏭️  Instagram：未設定")
        return None
    if not image_url:
        print("   ⏭️  Instagram：無公開圖片 URL，略過")
        return None
    try:
        # 上傳圖片容器（image_url 必須是公開可存取的 URL）
        r = requests.post(
            f"https://graph.facebook.com/v18.0/{META_INSTAGRAM_ID}/media",
            params={
                "image_url": image_url,
                "caption": caption[:2200],
                "access_token": META_ACCESS_TOKEN,
            }, timeout=15
        )
        if not r.ok: raise Exception(r.text)
        container_id = r.json()["id"]
        time.sleep(5)  # 等 Meta 處理容器，否則 media_publish 可能回 not ready
        # 發佈
        r2 = requests.post(
            f"https://graph.facebook.com/v18.0/{META_INSTAGRAM_ID}/media_publish",
            params={"creation_id": container_id, "access_token": META_ACCESS_TOKEN},
            timeout=15
        )
        if r2.ok:
            print(f"   ✅ Instagram 發佈完成")
            return r2.json().get("id")
    except Exception as e:
        print(f"   ❌ Instagram：{e}")
    return None

# ══════════════════════════════════════
# 4. Facebook
# ══════════════════════════════════════
def publish_facebook(message, link=""):
    if not META_ACCESS_TOKEN or not META_FACEBOOK_PAGE_ID:
        print("   ⏭️  Facebook：未設定")
        return None
    try:
        r = requests.post(
            f"https://graph.facebook.com/v18.0/{META_FACEBOOK_PAGE_ID}/feed",
            params={
                "message": message[:63206],
                "link": link,
                "access_token": META_ACCESS_TOKEN,
            }, timeout=15
        )
        if r.ok:
            print(f"   ✅ Facebook 發佈完成")
            return r.json().get("id")
        else:
            print(f"   ❌ Facebook：{r.text[:100]}")
    except Exception as e:
        print(f"   ❌ Facebook：{e}")
    return None

# ══════════════════════════════════════
# 5. LinkedIn
# ══════════════════════════════════════
def publish_linkedin(text, url=""):
    if not LINKEDIN_ACCESS_TOKEN or not LINKEDIN_PERSON_ID:
        print("   ⏭️  LinkedIn：未設定")
        return None
    try:
        post_data = {
            "author": f"urn:li:person:{LINKEDIN_PERSON_ID}",
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": text[:3000]},
                    "shareMediaCategory": "ARTICLE" if url else "NONE",
                    "media": [{"status": "READY", "originalUrl": url}] if url else [],
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }
        r = requests.post(
            "https://api.linkedin.com/v2/ugcPosts",
            headers={"Authorization": f"Bearer {LINKEDIN_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json=post_data, timeout=15
        )
        if r.ok:
            print(f"   ✅ LinkedIn 發佈完成")
            return r.json().get("id")
        else:
            print(f"   ❌ LinkedIn：{r.text[:100]}")
    except Exception as e:
        print(f"   ❌ LinkedIn：{e}")
    return None

# ══════════════════════════════════════
# 6. TikTok
# ══════════════════════════════════════
def publish_tiktok(video_path, title):
    if not TIKTOK_ACCESS_TOKEN or not TIKTOK_OPEN_ID:
        print("   ⏭️  TikTok：未設定")
        return None
    try:
        # TikTok Content Posting API
        r = requests.post(
            "https://open.tiktokapis.com/v2/post/publish/video/init/",
            headers={
                "Authorization": f"Bearer {TIKTOK_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "post_info": {
                    "title": title[:150],
                    "privacy_level": TIKTOK_PRIVACY,  # 未審核 app 須為 SELF_ONLY，否則 init 會被拒
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": os.path.getsize(video_path),
                    "chunk_size": os.path.getsize(video_path),
                    "total_chunk_count": 1,
                }
            }, timeout=15
        )
        if r.ok:
            data = r.json().get("data", {})
            upload_url = data.get("upload_url")
            publish_id = data.get("publish_id")
            # 上傳影片
            with open(video_path, "rb") as f:
                requests.put(
                    upload_url,
                    headers={"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{os.path.getsize(video_path)-1}/{os.path.getsize(video_path)}"},
                    data=f, timeout=300
                )
            print(f"   ✅ TikTok 上傳完成（publish_id: {publish_id}）")
            return publish_id
        else:
            print(f"   ❌ TikTok：{r.text[:100]}")
    except Exception as e:
        print(f"   ❌ TikTok：{e}")
    return None

# ══════════════════════════════════════
# 7. Threads
# ══════════════════════════════════════
def publish_threads(text):
    if not META_ACCESS_TOKEN or not META_THREADS_ID:
        print("   ⏭️  Threads：未設定")
        return None
    try:
        # 建立容器
        r = requests.post(
            f"https://graph.threads.net/v1.0/{META_THREADS_ID}/threads",
            params={"text": text[:500], "media_type": "TEXT", "access_token": META_ACCESS_TOKEN},
            timeout=15
        )
        if not r.ok: raise Exception(r.text)
        container_id = r.json()["id"]
        # 發佈
        r2 = requests.post(
            f"https://graph.threads.net/v1.0/{META_THREADS_ID}/threads_publish",
            params={"creation_id": container_id, "access_token": META_ACCESS_TOKEN},
            timeout=15
        )
        if r2.ok:
            print(f"   ✅ Threads 發佈完成")
            return r2.json().get("id")
    except Exception as e:
        print(f"   ❌ Threads：{e}")
    return None

# ══════════════════════════════════════
# 8. Pinterest
# ══════════════════════════════════════
def publish_pinterest(image_url, title, description, link):
    if not PINTEREST_ACCESS_TOKEN or not PINTEREST_BOARD_ID:
        print("   ⏭️  Pinterest：未設定")
        return None
    try:
        r = requests.post(
            "https://api.pinterest.com/v5/pins",
            headers={"Authorization": f"Bearer {PINTEREST_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json={
                "board_id": PINTEREST_BOARD_ID,
                "title": title[:100],
                "description": description[:500],
                "link": link,
                "media_source": {"source_type": "image_url", "url": image_url},
            }, timeout=15
        )
        if r.ok:
            pin_id = r.json().get("id")
            print(f"   ✅ Pinterest 發佈完成（pin: {pin_id}）")
            return pin_id
        else:
            print(f"   ❌ Pinterest：{r.text[:100]}")
    except Exception as e:
        print(f"   ❌ Pinterest：{e}")
    return None

# ══════════════════════════════════════
# 9. Reddit
# ══════════════════════════════════════
def publish_reddit(title, text, subreddit, url=""):
    if not REDDIT_CLIENT_ID or not subreddit:
        print("   ⏭️  Reddit：未設定")
        return None
    try:
        import praw
        reddit = praw.Reddit(
            client_id=REDDIT_CLIENT_ID, client_secret=REDDIT_CLIENT_SECRET,
            username=REDDIT_USERNAME, password=REDDIT_PASSWORD,
            user_agent=REDDIT_USER_AGENT,
        )
        sub = reddit.subreddit(subreddit)
        if url:
            post = sub.submit(title=title[:300], url=url)
        else:
            post = sub.submit(title=title[:300], selftext=text[:40000])
        print(f"   ✅ Reddit 發佈完成：{post.url}")
        return post.url
    except Exception as e:
        print(f"   ❌ Reddit：{e}")
    return None

# ══════════════════════════════════════
# 10. Bluesky
# ══════════════════════════════════════
def publish_bluesky(text, url=""):
    if not BLUESKY_HANDLE or not BLUESKY_PASSWORD:
        print("   ⏭️  Bluesky：未設定")
        return None
    try:
        # 取得 session
        r = requests.post(
            "https://bsky.social/xrpc/com.atproto.server.createSession",
            json={"identifier": BLUESKY_HANDLE, "password": BLUESKY_PASSWORD},
            timeout=10
        )
        if not r.ok: raise Exception(r.text)
        session = r.json()
        access_token = session["accessJwt"]
        did = session["did"]

        # 組合文字（加連結）
        full_text = f"{text[:280]}\n{url}" if url else text[:300]

        # 發佈
        from datetime import datetime, timezone
        r2 = requests.post(
            "https://bsky.social/xrpc/com.atproto.repo.createRecord",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "repo": did,
                "collection": "app.bsky.feed.post",
                "record": {
                    "$type": "app.bsky.feed.post",
                    "text": full_text,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
            }, timeout=10
        )
        if r2.ok:
            print(f"   ✅ Bluesky 發佈完成")
            return r2.json().get("uri")
        else:
            print(f"   ❌ Bluesky：{r2.text[:100]}")
    except Exception as e:
        print(f"   ❌ Bluesky：{e}")
    return None


# ══════════════════════════════════════
# 主發佈函式（一次發佈全部平台）
# ══════════════════════════════════════
def publish_all(topic_id, article, video_files, meta, summary_text, hero_image=""):
    """
    video_files: dict，例 {"youtube_linkedin": "/path/youtube.mp4", ...}
    summary_text: 社群發文的摘要文字
    hero_image:   第一張場景圖的本地路徑（會上傳 WP 媒體庫供 IG/Pinterest 使用）

    冪等：已 status=done 的平台會跳過，避免重跑時重傳 YouTube 等造成重複內容。
    """
    print("\n📡 開始多平台發佈...")
    results = {}
    done = get_done_platforms(topic_id)
    if done:
        print(f"   ↩️  偵測到已發佈平台，將略過：{', '.join(done.keys())}")

    # 先把 hero 圖上傳到 WP 媒體庫，取得公開 URL（IG / Pinterest 需要）
    hero_url = upload_wp_media(hero_image) if hero_image else ""

    # 1. YouTube
    if "youtube" in done:
        yt_url = done["youtube"]
        vid = yt_url.split("v=")[-1] if "v=" in yt_url else ""
        yt = {"url": yt_url, "embed": _yt_embed(vid), "video_id": vid} if yt_url else None
        results["youtube"] = yt_url
        print("   ↩️  YouTube：已發佈，略過")
    else:
        yt = publish_youtube(video_files.get("youtube_linkedin", ""), meta)
        if yt:
            results["youtube"] = yt["url"]
            log_publish(topic_id, "youtube", "done", yt["url"])
        else:
            log_publish(topic_id, "youtube", "failed")

    # 2. WordPress（需要 YouTube embed code）
    if "wordpress" in done:
        results["wordpress"] = done["wordpress"]
        print("   ↩️  WordPress：已發佈，略過")
    else:
        embed_code = yt["embed"] if yt else ""
        wp_url = publish_wordpress(article, embed_code, results.get("youtube", ""))
        if wp_url:
            results["wordpress"] = wp_url
            log_publish(topic_id, "wordpress", "done", wp_url)
        else:
            log_publish(topic_id, "wordpress", "failed")

    # 社群摘要（加上 WP 連結）
    wp_link = results.get("wordpress", "")
    social_text = f"{summary_text}\n\n🔗 {wp_link}" if wp_link else summary_text

    # 3. Facebook
    if "facebook" not in done:
        fb = publish_facebook(social_text, wp_link)
        if fb:
            results["facebook"] = fb
            log_publish(topic_id, "facebook", "done", str(fb))
        else:
            log_publish(topic_id, "facebook", "failed")

    # 4. Instagram（用 hero 圖的公開 URL）
    if "instagram" not in done:
        ig = publish_instagram(hero_url, social_text[:2200])
        if ig:
            results["instagram"] = ig
            log_publish(topic_id, "instagram", "done", str(ig))
        else:
            log_publish(topic_id, "instagram", "skipped")

    # 5. LinkedIn
    if "linkedin" not in done:
        li = publish_linkedin(social_text[:3000], wp_link)
        if li:
            results["linkedin"] = li
            log_publish(topic_id, "linkedin", "done", str(li))
        else:
            log_publish(topic_id, "linkedin", "failed")

    # 6. TikTok
    if "tiktok" not in done:
        tt = publish_tiktok(video_files.get("tiktok", ""), meta["title"])
        if tt:
            results["tiktok"] = tt
            log_publish(topic_id, "tiktok", "done", str(tt))
        else:
            log_publish(topic_id, "tiktok", "failed")

    # 7. Threads
    if "threads" not in done:
        th = publish_threads(social_text[:500])
        if th:
            results["threads"] = th
            log_publish(topic_id, "threads", "done", str(th))
        else:
            log_publish(topic_id, "threads", "failed")

    # 8. Pinterest（用 hero 圖的公開 URL）
    if "pinterest" not in done:
        pi = publish_pinterest(hero_url, article["title"], article.get("meta_description", ""), wp_link)
        if pi:
            results["pinterest"] = pi
            log_publish(topic_id, "pinterest", "done", str(pi))
        else:
            log_publish(topic_id, "pinterest", "skipped" if not hero_url else "failed")

    # 9. Reddit（預設關閉；REDDIT_ENABLE=true 且有目標 sub 才發，避免 spam ban）
    if "reddit" not in done and REDDIT_ENABLE and REDDIT_SUBREDDITS:
        rd = publish_reddit(article["title"], summary_text, REDDIT_SUBREDDITS[0], wp_link)
        if rd:
            results["reddit"] = rd
            log_publish(topic_id, "reddit", "done", str(rd))
        else:
            log_publish(topic_id, "reddit", "failed")

    # 10. Bluesky
    if "bluesky" not in done:
        bsky = publish_bluesky(social_text[:300], wp_link)
        if bsky:
            results["bluesky"] = bsky
            log_publish(topic_id, "bluesky", "done", str(bsky))
        else:
            log_publish(topic_id, "bluesky", "failed")

    success = sum(1 for v in results.values() if v)
    print(f"\n   📊 發佈完成：{success} 個平台成功（含略過 {len(done)} 個）")
    return results
