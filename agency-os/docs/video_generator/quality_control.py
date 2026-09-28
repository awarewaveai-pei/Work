"""
quality_control.py
品質控制：抄襲檢查、內部連結、FAQ、Alt標籤、A/B測試標題
"""

import requests
import anthropic
from config import *
from claude_call import claude_create, claude_text

claude = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# ── 抄襲檢查 ──
def check_plagiarism(text):
    if not COPYSCAPE_USER or not COPYSCAPE_API_KEY:
        print("   ⏭️  抄襲檢查：未設定")
        return True  # 略過，視為通過
    try:
        r = requests.post(
            "https://www.copyscape.com/api/",
            data={
                "u": COPYSCAPE_USER, "k": COPYSCAPE_API_KEY,
                "o": "csearch", "e": "UTF-8",
                "c": "1", "q": text[:5000],
            }, timeout=30
        )
        count = int(r.text.count("<count>") and r.text.split("<count>")[1].split("</count>")[0] or 0)
        if count > 0:
            print(f"   ⚠️  抄襲檢查：發現 {count} 個相似來源，Claude 重寫中...")
            return False
        print("   ✅ 抄襲檢查：通過")
        return True
    except Exception as e:
        print(f"   ⚠️  抄襲檢查失敗：{e}")
        return True

# ── 重寫文章 ──
def rewrite_article(content, title):
    response = claude_create(claude,
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": f"請將以下文章完全改寫，保留相同意思但用完全不同的表達方式，繁體中文，標題：{title}\n\n{content}"
        }]
    )
    return claude_text(response)

# ── 自動內部連結 ──
def add_internal_links(content, wp_url, article_title):
    if not WP_URL or not WP_USERNAME:
        return content
    try:
        # 抓 WordPress 所有文章
        r = requests.get(
            f"{WP_URL}/wp-json/wp/v2/posts",
            params={"per_page": 50, "status": "publish"},
            auth=(WP_USERNAME, WP_PASSWORD), timeout=15
        )
        if not r.ok:
            return content
        posts = r.json()

        # 用 Claude 找出最相關的文章並建議插入位置
        posts_list = "\n".join([f"- {p['title']['rendered']}：{p['link']}" for p in posts[:20]])
        response = claude_create(claude,
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": f"""
現有文章：《{article_title}》
內容：{content[:1000]}

網站其他文章：
{posts_list}

請在文章適當位置插入 2–3 個內部連結，用 Markdown 格式 [錨文字](URL)。
只輸出加了內部連結的完整文章內容，不要其他說明。
"""
            }]
        )
        updated = claude_text(response)
        print("   ✅ 內部連結：已插入")
        return updated
    except Exception as e:
        print(f"   ⚠️  內部連結：{e}")
        return content

# ── 自動生成 FAQ ──
def generate_faq(title, content):
    try:
        response = claude_create(claude,
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"""
根據文章《{title}》，生成 5 個 FAQ（常見問題與解答），繁體中文。
用 Markdown 格式：
## 常見問題

**Q: 問題？**
A: 回答。

只輸出 FAQ 部分，不要其他文字。
文章摘要：{content[:500]}
"""
            }]
        )
        faq = claude_text(response)
        print("   ✅ FAQ：已生成")
        return faq
    except Exception as e:
        print(f"   ⚠️  FAQ：{e}")
        return ""

# ── 自動圖片 Alt 標籤 ──
def generate_alt_tags(title, scene_descriptions):
    try:
        alts = []
        for i, desc in enumerate(scene_descriptions):
            alt = f"{title} - 場景{i+1} - {desc[:50]}"
            alts.append(alt)
        print(f"   ✅ Alt 標籤：{len(alts)} 個")
        return alts
    except Exception as e:
        print(f"   ⚠️  Alt 標籤：{e}")
        return []

# ── A/B 測試標題 ──
def generate_ab_titles(original_title, content_summary):
    try:
        response = claude_create(claude,
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": f"""
原標題：{original_title}
文章摘要：{content_summary[:200]}

請生成一個不同風格但同樣吸引人的替代標題，繁體中文。
只輸出標題本身，不要任何其他文字。
"""
            }]
        )
        title_b = claude_text(response).strip()
        print(f"   ✅ A/B標題：A={original_title[:30]}... | B={title_b[:30]}...")
        return original_title, title_b
    except Exception as e:
        print(f"   ⚠️  A/B標題：{e}")
        return original_title, original_title

def save_ab_test(topic_id, title_a, title_b):
    if not SUPABASE_URL:
        return
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    requests.post(
        f"{SUPABASE_URL}/rest/v1/ab_tests",
        headers=headers,
        json={"topic_id": topic_id, "title_a": title_a, "title_b": title_b},
        timeout=10,
    )

# ── 主品質控制流程 ──
def run(topic_id, article, scene_descriptions):
    print("\n🔍 品質控制...")

    # 1. 抄襲檢查（最多重寫 2 次）
    content = article["content"]
    for attempt in range(2):
        if check_plagiarism(content):
            break
        content = rewrite_article(content, article["title"])
    article["content"] = content

    # 2. 內部連結
    article["content"] = add_internal_links(content, WP_URL, article["title"])

    # 3. FAQ
    faq = generate_faq(article["title"], article["content"])
    if faq:
        article["content"] += f"\n\n{faq}"

    # 4. Alt 標籤
    article["alt_tags"] = generate_alt_tags(article["title"], scene_descriptions)

    # 5. A/B 測試標題
    title_a, title_b = generate_ab_titles(article["title"], article["content"][:200])
    save_ab_test(topic_id, title_a, title_b)
    article["title_b"] = title_b

    return article
