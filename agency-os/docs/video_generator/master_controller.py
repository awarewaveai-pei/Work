#!/usr/bin/env python3
"""
master_controller.py
全自動發佈主控腳本

排程：
  crontab -e
  0 9 * * * /usr/bin/python3 /你的路徑/master_controller.py >> /var/log/autopublish.log 2>&1
  0 8 * * 1 /usr/bin/python3 /你的路徑/master_controller.py --newsletter >> /var/log/autopublish.log 2>&1
"""

import sys
import json
import time
import traceback
import requests
from datetime import datetime, timezone
from pathlib import Path
from config import *
import topic_fetcher
import full_pipeline_v3 as pipeline
import publisher
import quality_control as qc
import growth

# ── Supabase ──
def sb(method, endpoint, data=None):
    headers = {
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=representation",
    }
    r = requests.request(method, f"{SUPABASE_URL}/rest/v1/{endpoint}", headers=headers, json=data, timeout=15)
    if r.status_code >= 400: raise Exception(f"Supabase {r.status_code}: {r.text[:200]}")
    return r.json() if r.text else {}

def get_pending():
    now = datetime.now(timezone.utc).isoformat()
    result = sb("GET",
        f"topics?status=eq.pending"
        f"&or=(scheduled_at.is.null,scheduled_at.lte.{now})"
        f"&order=priority.asc,scheduled_at.asc.nullsfirst,created_at.asc"
        f"&limit={MAX_TOPICS_PER_RUN}"
    )
    return result if isinstance(result, list) else []

def update_topic(tid, data):
    sb("PATCH", f"topics?id=eq.{tid}", data)

def log_cost(topic_id, service, amount, detail=""):
    try:
        sb("POST", "cost_log", {"topic_id": topic_id, "service": service, "amount_usd": amount, "detail": detail})
    except: pass

# ── Telegram ──
def tg(msg):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID: return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT_ID, "text": msg, "parse_mode": "HTML"},
            timeout=10,
        )
    except: pass

def notify_success(topic, results, cost):
    platforms = " | ".join([k for k,v in results.items() if v])
    tg(
        f"✅ <b>發佈成功！</b>\n\n"
        f"📝 {topic}\n"
        f"🎬 {results.get('youtube','')}\n"
        f"🌐 {results.get('wordpress','')}\n"
        f"📡 {platforms}\n"
        f"💰 ${cost:.2f}\n"
        f"🕐 {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )

def notify_failure(topic, error):
    tg(f"❌ <b>發佈失敗！</b>\n\n📝 {topic}\n⚠️ {str(error)[:300]}\n🕐 {datetime.now().strftime('%Y-%m-%d %H:%M')}")

def notify_summary(done, failed):
    tg(f"📊 <b>今日摘要</b>\n\n✅ 成功：{done}\n❌ 失敗：{failed}\n🕐 {datetime.now().strftime('%Y-%m-%d %H:%M')}")

# ── 主流程 ──
def process_topic(row):
    topic_id = row["id"]
    topic    = row["topic"]
    mode     = row.get("mode", "A").upper()

    # 執行 pipeline
    if mode == "B":
        result = pipeline.run(
            mode="B",
            article_title=row.get("article_input_title") or topic,
            article_content=row.get("article_content", ""),
        )
    else:
        result = pipeline.run(mode="A", topic=topic)

    article     = result["article"]
    video_meta  = result["video_meta"]
    output_files = result["output_files"]
    social_summary = result["social_summary"]
    cost = result["cost"]

    # 品質控制
    scene_desc = [s.get("image_prompt","") for s in video_meta["scenes"]]
    article = qc.run(topic_id, article, scene_desc)

    # 多平台發佈
    publish_results = publisher.publish_all(
        topic_id, article, output_files, video_meta, social_summary
    )

    # 備份
    growth.backup_all_outputs(result["out_dir"])

    # 記錄費用
    total_cost = cost["dalle"] + cost["claude"]
    log_cost(topic_id, "dalle3", cost["dalle"], f"{len(video_meta['scenes'])} 張")
    log_cost(topic_id, "claude", cost["claude"], f"模式{mode}")

    return publish_results, total_cost

def main():
    # 每週一跑電子報
    if "--newsletter" in sys.argv:
        print("📧 發送每週電子報...")
        growth.send_weekly_newsletter()
        return

    # 每月跑舊文更新
    if "--update-old" in sys.argv:
        print("♻️  更新舊文章...")
        growth.update_old_articles()
        return

    print("=" * 60)
    print(f"  全自動發佈主控系統")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    done = failed = 0

    # 1. 自動抓熱門議題
    try:
        topic_fetcher.run()
    except Exception as e:
        print(f"⚠️  自動抓題失敗：{e}")

    # 2. 抓待處理主題
    print("\n📋 抓取待處理主題...")
    try:
        topics = get_pending()
    except Exception as e:
        tg(f"❌ 主控腳本無法啟動：{e}")
        return

    if not topics:
        print("   今日無待處理主題。")
        tg("ℹ️ 今日沒有待處理主題，請到 Supabase 新增。")
        return

    print(f"   找到 {len(topics)} 個主題")

    # 3. 逐一執行
    for row in topics:
        tid   = row["id"]
        topic = row["topic"]
        mode  = row.get("mode", "A").upper()

        print(f"\n{'─'*50}")
        print(f"主題：{topic}（模式：{mode}）")

        update_topic(tid, {"status": "processing"})

        try:
            publish_results, total_cost = process_topic(row)

            update_topic(tid, {
                "status":        "done",
                "done_at":       datetime.now(timezone.utc).isoformat(),
                "youtube_url":   publish_results.get("youtube", ""),
                "wp_url":        publish_results.get("wordpress", ""),
                "article_title": row["topic"],
                "cost_usd":      total_cost,
            })

            notify_success(topic, publish_results, total_cost)
            done += 1
            print(f"✅ 完成：{topic}（${total_cost:.2f}）")

        except Exception as e:
            print(f"❌ 失敗：{e}")
            traceback.print_exc()
            update_topic(tid, {"status": "pending"})
            notify_failure(topic, e)
            failed += 1

        time.sleep(5)

    print(f"\n{'='*60}")
    print(f"完成｜成功：{done}｜失敗：{failed}")
    notify_summary(done, failed)

if __name__ == "__main__":
    main()
