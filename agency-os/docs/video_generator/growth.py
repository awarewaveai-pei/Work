"""
growth.py
成長功能：電子報、舊文更新、競爭對手監控、多語言翻譯、備份
"""

import os
import json
import requests
import anthropic
from datetime import datetime, timedelta
from pathlib import Path
from config import *
from claude_call import claude_create, claude_text

claude = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# ══════════════════════════════════════
# 電子報（Mailchimp）
# ══════════════════════════════════════
def send_weekly_newsletter():
    if not MAILCHIMP_API_KEY or not MAILCHIMP_LIST_ID:
        print("   ⏭️  電子報：未設定")
        return
    try:
        # 抓本週 WordPress 文章
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            f"{WP_URL}/wp-json/wp/v2/posts",
            params={"after": week_ago, "per_page": 5, "status": "publish", "orderby": "date"},
            auth=(WP_USERNAME, WP_PASSWORD), timeout=15
        )
        if not r.ok or not r.json():
            print("   ℹ️  電子報：本週沒有新文章")
            return
        posts = r.json()

        # Claude 生成電子報內容
        post_list = "\n".join([f"- {p['title']['rendered']}：{p['link']}" for p in posts])
        response = claude_create(claude,
            max_tokens=1000,
            messages=[{"role": "user", "content": f"根據以下本週文章列表，生成一封繁體中文電子報，吸引讀者點擊閱讀，約200字：\n{post_list}"}]
        )
        newsletter_content = claude_text(response)

        # 取得 Mailchimp server prefix
        dc = MAILCHIMP_API_KEY.split("-")[-1]
        headers = {"Authorization": f"apikey {MAILCHIMP_API_KEY}", "Content-Type": "application/json"}

        # 建立 campaign
        campaign_r = requests.post(
            f"https://{dc}.api.mailchimp.com/3.0/campaigns",
            headers=headers,
            json={
                "type": "regular",
                "recipients": {"list_id": MAILCHIMP_LIST_ID},
                "settings": {
                    "subject_line": f"本週精選文章 {datetime.now().strftime('%m/%d')}",
                    "from_name": MAILCHIMP_FROM_NAME,
                    "reply_to": MAILCHIMP_FROM_EMAIL,
                }
            }, timeout=15
        )
        if not campaign_r.ok:
            raise Exception(campaign_r.text)
        campaign_id = campaign_r.json()["id"]

        # 設定內容
        requests.put(
            f"https://{dc}.api.mailchimp.com/3.0/campaigns/{campaign_id}/content",
            headers=headers,
            json={"plain_text": newsletter_content}, timeout=15
        )

        # 發送
        requests.post(
            f"https://{dc}.api.mailchimp.com/3.0/campaigns/{campaign_id}/actions/send",
            headers=headers, timeout=15
        )
        print("   ✅ 電子報：已發送")
    except Exception as e:
        print(f"   ❌ 電子報：{e}")

# ══════════════════════════════════════
# 自動更新舊文章
# ══════════════════════════════════════
def update_old_articles():
    if not WP_URL or not WP_USERNAME:
        print("   ⏭️  舊文更新：未設定 WordPress")
        return
    try:
        # 抓 3 個月前的文章
        three_months_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S")
        r = requests.get(
            f"{WP_URL}/wp-json/wp/v2/posts",
            params={"before": three_months_ago, "per_page": 3, "status": "publish", "orderby": "date"},
            auth=(WP_USERNAME, WP_PASSWORD), timeout=15
        )
        if not r.ok:
            return
        old_posts = r.json()
        for post in old_posts:
            post_id = post["id"]
            old_content = post["content"]["rendered"]
            title = post["title"]["rendered"]

            # Claude 重新優化
            response = claude_create(claude,
                max_tokens=2000,
                messages=[{"role": "user", "content": f"請更新以下舊文章，加入最新資訊、優化 SEO、改善可讀性，繁體中文，保留原有結構：\n標題：{title}\n內容：{old_content[:2000]}"}]
            )
            new_content = claude_text(response)

            # 更新 WordPress
            requests.post(
                f"{WP_URL}/wp-json/wp/v2/posts/{post_id}",
                json={"content": new_content, "modified": datetime.now().isoformat()},
                auth=(WP_USERNAME, WP_PASSWORD), timeout=15
            )
            print(f"   ✅ 舊文更新：{title[:40]}")
    except Exception as e:
        print(f"   ❌ 舊文更新：{e}")

# ══════════════════════════════════════
# 競爭對手監控
# ══════════════════════════════════════
def monitor_competitors(competitor_urls):
    if not competitor_urls:
        print("   ⏭️  競爭對手監控：未設定")
        return []
    topics = []
    try:
        for url in competitor_urls[:3]:
            r = requests.get(
                f"{url}/wp-json/wp/v2/posts",
                params={"per_page": 5, "status": "publish", "orderby": "date"},
                timeout=10
            )
            if r.ok:
                for post in r.json():
                    topics.append(post["title"]["rendered"])
        print(f"   ✅ 競爭對手監控：發現 {len(topics)} 個主題")
        return topics
    except Exception as e:
        print(f"   ⚠️  競爭對手監控：{e}")
        return []

# ══════════════════════════════════════
# 多語言翻譯
# ══════════════════════════════════════
def translate_article(article, target_lang):
    lang_map = {"en": "英文", "ja": "日文", "zh-CN": "簡體中文"}
    lang_name = lang_map.get(target_lang, target_lang)
    try:
        response = claude_create(claude,
            max_tokens=2000,
            messages=[{"role": "user", "content": f"請將以下繁體中文文章翻譯成{lang_name}，保留 Markdown 格式：\n\n標題：{article['title']}\n\n{article['content'][:2000]}"}]
        )
        translated_content = claude_text(response)
        print(f"   ✅ 翻譯：{lang_name} 完成")
        return {**article, "content": translated_content, "lang": target_lang}
    except Exception as e:
        print(f"   ❌ 翻譯（{lang_name}）：{e}")
        return None

# ══════════════════════════════════════
# Google Drive 備份
# ══════════════════════════════════════
def backup_to_gdrive(file_path, folder_id=None):
    if not os.path.exists(GDRIVE_CREDENTIALS):
        print("   ⏭️  備份：未設定 Google Drive 憑證")
        return
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        creds = Credentials.from_service_account_file(
            GDRIVE_CREDENTIALS,
            scopes=["https://www.googleapis.com/auth/drive.file"]
        )
        service = build("drive", "v3", credentials=creds)
        file_metadata = {
            "name": Path(file_path).name,
            "parents": [folder_id or GDRIVE_FOLDER_ID] if (folder_id or GDRIVE_FOLDER_ID) else [],
        }
        media = MediaFileUpload(file_path, resumable=True)
        service.files().create(body=file_metadata, media_body=media, fields="id").execute()
        print(f"   ✅ 備份：{Path(file_path).name}")
    except Exception as e:
        print(f"   ❌ 備份：{e}")

def backup_all_outputs(output_dir):
    print("\n☁️  備份到 Google Drive...")
    for f in Path(output_dir).rglob("*.mp4"):
        backup_to_gdrive(str(f))
    for f in Path(output_dir).rglob("*.json"):
        backup_to_gdrive(str(f))

# ══════════════════════════════════════
# 自動生成電子書（PDF）
# ══════════════════════════════════════
def generate_ebook(category, output_path="ebook.pdf"):
    if not WP_URL:
        return
    try:
        r = requests.get(
            f"{WP_URL}/wp-json/wp/v2/posts",
            params={"per_page": 10, "status": "publish", "categories": category},
            auth=(WP_USERNAME, WP_PASSWORD), timeout=15
        )
        if not r.ok or not r.json():
            return
        posts = r.json()
        # 合併文章內容
        combined = "\n\n".join([
            f"# {p['title']['rendered']}\n{p['content']['rendered']}"
            for p in posts
        ])
        # 用 Claude 整理成電子書格式
        response = claude_create(claude,
            max_tokens=4000,
            messages=[{"role": "user", "content": f"請將以下文章整理成一本完整的電子書，加上目錄、前言、各章節標題，繁體中文：\n\n{combined[:5000]}"}]
        )
        ebook_content = claude_text(response)
        # 存成 txt（之後可轉 PDF）
        with open(output_path.replace(".pdf", ".txt"), "w", encoding="utf-8") as f:
            f.write(ebook_content)
        print(f"   ✅ 電子書：已生成 {output_path}")
    except Exception as e:
        print(f"   ❌ 電子書：{e}")
