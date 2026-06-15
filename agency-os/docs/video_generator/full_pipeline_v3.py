#!/usr/bin/env python3
"""
full_pipeline_v3.py
文章 → 卡通影片 → 多尺寸輸出

支援：
  - 模式 A：全新生成文章 + 影片
  - 模式 B：已有文章 → 只生成影片腳本
  - Pixabay 自動抓卡通圖（主要）
  - DALL-E 3 生成場景圖（備用）
  - Freepik 素材庫（手動準備，找不到時用）
  - Edge TTS 配音
  - FFmpeg 合成 + 4 種尺寸輸出
"""

import os
import re
import json
import asyncio
import requests
import textwrap
import subprocess
import anthropic
from openai import OpenAI
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import edge_tts
from moviepy.editor import ImageClip, AudioFileClip, CompositeVideoClip, concatenate_videoclips
from config import *

claude_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# ── Step 1A: 全新生成文章 + 腳本 ──
def generate_from_topic(topic):
    print("\n🤖 [1/5] Claude 全新生成文章 + 影片腳本...")
    prompt = f"""
你是專業的繁體中文 SEO 文章寫手與 YouTube 腳本師。
根據主題「{topic}」同時生成文章和影片腳本。
只輸出 JSON：
{{
  "article": {{
    "title": "文章標題",
    "content": "文章正文（Markdown，約800字）",
    "seo_title": "SEO標題（60字內）",
    "meta_description": "Meta描述（150字內）",
    "tags": ["標籤1","標籤2","標籤3"],
    "category": "分類",
    "slug": "url-slug-english"
  }},
  "video": {{
    "title": "YouTube影片標題",
    "description": "YouTube影片描述（200字）",
    "tags": ["tag1","tag2","tag3"],
    "scenes": [
      {{
        "id": 1,
        "narration": "口語化旁白（約35字）",
        "image_prompt": "DALL-E 卡通場景描述（英文）",
        "pixabay_keyword": "pixabay search keyword english",
        "duration": 8
      }}
    ]
  }},
  "social_summary": "社群發文摘要（100字內，吸引點擊）"
}}
scenes 需要 6–8 個。不要其他文字。
"""
    r = claude_client.messages.create(
        model="claude-sonnet-4-6", max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = r.content[0].text.replace("```json","").replace("```","").strip()
    data = json.loads(raw)
    print(f"   ✅ 文章：{data['article']['title']}，場景：{len(data['video']['scenes'])} 個")
    return data

# ── Step 1B: 已有文章 → 只生成影片腳本 ──
def generate_from_existing(title, content):
    print("\n🤖 [1/5] Claude 根據已有文章生成影片腳本...")
    prompt = f"""
根據以下文章生成影片腳本和 SEO 資訊，不要重寫文章。
標題：{title}
內容：{content[:3000]}

只輸出 JSON：
{{
  "article": {{
    "title": "{title}",
    "content": {json.dumps(content, ensure_ascii=False)},
    "seo_title": "SEO標題（60字內）",
    "meta_description": "Meta描述（150字內）",
    "tags": ["標籤1","標籤2","標籤3"],
    "category": "分類",
    "slug": "url-slug-english"
  }},
  "video": {{
    "title": "YouTube影片標題",
    "description": "YouTube影片描述（200字）",
    "tags": ["tag1","tag2"],
    "scenes": [
      {{
        "id": 1,
        "narration": "根據文章改寫的口語旁白（約35字）",
        "image_prompt": "DALL-E 卡通場景描述（英文）",
        "pixabay_keyword": "pixabay search keyword english",
        "duration": 8
      }}
    ]
  }},
  "social_summary": "社群發文摘要（100字內）"
}}
scenes 需要 6–8 個。不要其他文字。
"""
    r = claude_client.messages.create(
        model="claude-sonnet-4-6", max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = r.content[0].text.replace("```json","").replace("```","").strip()
    data = json.loads(raw)
    print(f"   ✅ 沿用文章：{title}，場景：{len(data['video']['scenes'])} 個")
    return data

# ── Step 2: 抓圖片（Pixabay → DALL-E → Freepik素材庫）──
def fetch_pixabay_image(keyword, scene_id):
    try:
        r = requests.get(
            "https://pixabay.com/api/",
            params={
                "key": "",   # Pixabay API Key（免費申請 pixabay.com/api）
                "q": keyword, "image_type": "illustration",
                "category": "backgrounds", "per_page": 5,
                "safesearch": "true",
            }, timeout=10
        )
        hits = r.json().get("hits", [])
        if hits:
            img_url = hits[0]["webformatURL"]
            out = str(TEMP_DIR / f"scene_{scene_id}.jpg")
            with requests.get(img_url, stream=True, timeout=15) as resp:
                with open(out, "wb") as f:
                    for chunk in resp.iter_content(8192): f.write(chunk)
            return out
    except Exception as e:
        print(f"   ⚠️  Pixabay：{e}")
    return None

def fetch_dalle_image(prompt, scene_id):
    try:
        response = openai_client.images.generate(
            model="dall-e-3",
            prompt=CARTOON_STYLE + prompt,
            size="1792x1024", quality="standard", n=1,
        )
        img_data = requests.get(response.data[0].url, timeout=30).content
        out = str(TEMP_DIR / f"scene_{scene_id}.png")
        with open(out, "wb") as f: f.write(img_data)
        return out
    except Exception as e:
        print(f"   ⚠️  DALL-E：{e}")
        return None

def fetch_freepik_fallback(scene_id):
    # 從本地 Freepik 素材庫隨機抓一張背景
    bg_dir = Path("assets/backgrounds")
    if bg_dir.exists():
        files = list(bg_dir.glob("*.jpg")) + list(bg_dir.glob("*.png"))
        if files:
            import random
            return str(random.choice(files))
    return None

def get_scene_image(scene, scene_id):
    # 優先順序：Pixabay → DALL-E → Freepik素材庫 → 純色背景
    img = fetch_pixabay_image(scene.get("pixabay_keyword", "cartoon"), scene_id)
    if img: return img, "pixabay"
    img = fetch_dalle_image(scene.get("image_prompt", ""), scene_id)
    if img: return img, "dalle"
    img = fetch_freepik_fallback(scene_id)
    if img: return img, "freepik"
    # 純色備用
    bg = Image.new("RGB", (1792, 1024), (20, 30, 60))
    out = str(TEMP_DIR / f"scene_{scene_id}_bg.png")
    bg.save(out)
    return out, "fallback"

def generate_all_images(scenes):
    print("\n🎨 [2/5] 生成場景圖片...")
    image_files = []
    total_dalle_cost = 0
    for scene in scenes:
        img_path, source = get_scene_image(scene, scene["id"])
        image_files.append(img_path)
        if source == "dalle": total_dalle_cost += 0.04
        print(f"   ✅ Scene {scene['id']} ({source})")
    print(f"   💰 DALL-E 費用：${total_dalle_cost:.2f}")
    return image_files, total_dalle_cost

# ── Step 3: Edge TTS 配音 ──
async def _tts(text, path):
    await edge_tts.Communicate(text, TTS_VOICE).save(path)

def generate_audio(scenes):
    print("\n🎤 [3/5] Edge TTS 配音...")
    audio_files = []
    for scene in scenes:
        path = str(TEMP_DIR / f"audio_{scene['id']}.mp3")
        asyncio.run(_tts(scene["narration"], path))
        audio_files.append(path)
        print(f"   ✅ Scene {scene['id']}")
    return audio_files

# ── Step 4: 合成影片 ──
def make_subtitle(text, duration, w, h):
    img = Image.new("RGBA", (w, h), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    font = None
    for fp in [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "C:/Windows/Fonts/msjh.ttc",
    ]:
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, max(28, h//24))
            break
    if font is None: font = ImageFont.load_default()
    lines = textwrap.wrap(text, width=26)
    line_h = max(36, h//20)
    y = h - len(lines)*line_h - int(h*0.07)
    for line in lines:
        bbox = draw.textbbox((0,0), line, font=font)
        x = (w - (bbox[2]-bbox[0])) // 2
        draw.rectangle([x-8, y-4, x+(bbox[2]-bbox[0])+8, y+line_h], fill=(0,0,0,160))
        draw.text((x+2,y+2), line, font=font, fill=(0,0,0,200))
        draw.text((x,y), line, font=font, fill=(255,255,255,255))
        y += line_h
    path = str(TEMP_DIR / f"sub_{abs(hash(text+str(w)))}.png")
    img.save(path)
    return ImageClip(path).set_duration(duration)

def ken_burns(img_path, duration, w, h):
    clip = ImageClip(img_path).set_duration(duration)
    clip = clip.resize(height=int(h*1.15))
    if clip.w < w: clip = clip.resize(width=int(w*1.15))
    clip = clip.resize(lambda t: 1 + 0.04*t/duration)
    clip = clip.crop(x_center=clip.w/2, y_center=clip.h/2, width=w, height=h)
    return clip

def compose_base_video(scenes, image_files, audio_files, out_name):
    print("\n🎞️  [4/5] 合成基礎影片...")
    clips = []
    for scene, img_path, audio_path in zip(scenes, image_files, audio_files):
        audio = AudioFileClip(audio_path)
        duration = audio.duration + 0.5
        bg = ken_burns(img_path, duration, VIDEO_WIDTH, VIDEO_HEIGHT)
        subtitle = make_subtitle(scene["narration"], duration, VIDEO_WIDTH, VIDEO_HEIGHT)
        clips.append(CompositeVideoClip([bg, subtitle]).set_audio(audio))
        print(f"   ✅ Scene {scene['id']} ({duration:.1f}s)")
    base_path = str(TEMP_DIR / f"{out_name}_base.mp4")
    concatenate_videoclips(clips, method="compose").write_videofile(
        base_path, fps=FPS, codec="libx264", audio_codec="aac",
        temp_audiofile=str(TEMP_DIR/"tmp_audio.m4a"), remove_temp=True, logger="bar"
    )
    return base_path

def export_formats(base_video, out_dir):
    print("\n📐 [5/5] 輸出多平台尺寸...")
    output_files = {}
    for name, (w, h) in VIDEO_FORMATS.items():
        out_path = str(out_dir / f"{name}.mp4")
        cmd = [
            "ffmpeg", "-y", "-i", base_video,
            "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k", out_path
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0:
            output_files[name] = out_path
            print(f"   ✅ {name} ({w}×{h})")
        else:
            print(f"   ❌ {name} 失敗")
    return output_files

def cleanup():
    import shutil
    shutil.rmtree(TEMP_DIR, ignore_errors=True)
    TEMP_DIR.mkdir(exist_ok=True)

# ── 主流程 ──
def run(mode="A", topic="", article_title="", article_content=""):
    safe_name = re.sub(r'[^\w\u4e00-\u9fff]', '_', topic or article_title)[:40]
    out_dir = OUTPUT_DIR / safe_name
    out_dir.mkdir(exist_ok=True)

    # 1. 生成內容
    if mode == "A":
        data = generate_from_topic(topic)
    else:
        data = generate_from_existing(article_title, article_content)

    article = data["article"]
    video_meta = data["video"]
    social_summary = data.get("social_summary", article["title"])

    # 2. 圖片
    image_files, dalle_cost = generate_all_images(video_meta["scenes"])

    # 3. 配音
    audio_files = generate_audio(video_meta["scenes"])

    # 4. 合成
    base_video = compose_base_video(video_meta["scenes"], image_files, audio_files, safe_name)

    # 5. 多尺寸
    output_files = export_formats(base_video, out_dir)

    # 儲存結果
    result = {
        "mode": mode,
        "article": article,
        "video_meta": video_meta,
        "social_summary": social_summary,
        "output_files": {k: str(v) for k, v in output_files.items()},
        "cost": {"dalle": dalle_cost, "claude": 0.05 if mode=="A" else 0.02},
        "out_dir": str(out_dir),
    }
    with open(out_dir / "pipeline_result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    cleanup()
    return result

if __name__ == "__main__":
    print("請選擇模式：A（全新生成）或 B（已有文章）")
    mode = input("> ").strip().upper()
    if mode == "A":
        topic = input("請輸入主題：").strip()
        result = run(mode="A", topic=topic)
    else:
        title = input("請輸入文章標題：").strip()
        print("請貼入文章內容（Enter 兩次結束）：")
        lines = []
        while True:
            line = input()
            if line == "" and lines and lines[-1] == "": break
            lines.append(line)
        result = run(mode="B", article_title=title, article_content="\n".join(lines))
    print(f"\n✅ 完成！輸出：{result['out_dir']}")
