#!/usr/bin/env python3
"""
pipeline.py — 文章 → 卡通影片 → 多尺寸輸出 → YouTube + WordPress 全自動

安裝依賴：
  pip install -r requirements.txt
系統依賴：
  Ubuntu/Debian: sudo apt install ffmpeg fonts-noto-cjk
  Windows: 下載 ffmpeg 加入 PATH

設定：複製 .env.example 為 .env 後填值（見 README）。

輸出平台尺寸：
  youtube_linkedin.mp4        1920x1080
  tiktok_reels.mp4            1080x1920
  instagram_facebook.mp4      1080x1080
  twitter_reddit_bluesky.mp4  1280x720
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
from PIL import Image, ImageDraw, ImageFont

# Pillow>=10 移除了 Image.ANTIALIAS，但 moviepy 1.x 的 resize fx 仍引用它（resize→crash）。
# requirements 同時鎖 pillow>=10 + moviepy<2，故必須在 import moviepy 前補回相容別名。
# 守 hasattr 保證冪等，未來換 Pillow<10 時自動無作用。
if not hasattr(Image, "ANTIALIAS"):
    # getattr 守 Resampling：未來若放寬 pin 到 Pillow<9.1（無 Resampling）也優雅降級不二次崩
    Image.ANTIALIAS = getattr(Image, "Resampling", Image).LANCZOS

import edge_tts
# 合成走純 ffmpeg（per-scene + concat，比 moviepy 逐幀嚼影片快 10-50x）；
# moviepy 僅用 AudioFileClip 取配音長度（即開即關）。
from moviepy.editor import AudioFileClip

# 影片片段（Pexels B-roll）與靜圖（Flux）的副檔名判別 — 混合 render 用
_VIDEO_EXTS = (".mp4", ".mov", ".webm", ".m4v", ".mkv")
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")

# Google / YouTube
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

import config

config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
config.TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _claude() -> anthropic.Anthropic:
    config.require("CLAUDE_API_KEY")
    return anthropic.Anthropic(api_key=config.CLAUDE_API_KEY)


def _openai() -> OpenAI:
    config.require("OPENAI_API_KEY")
    return OpenAI(api_key=config.OPENAI_API_KEY)


# ═══════════════════════════════════════════
# STEP 1A：模式 A — 全新生成文章 + 影片腳本
# ═══════════════════════════════════════════
def generate_from_topic(topic: str) -> dict:
    print("\n[1/6] Claude 全新生成文章 + 影片腳本...")
    prompt = f"""
你是專業的繁體中文 SEO 文章寫手與 YouTube 腳本師。

根據主題「{topic}」同時生成文章和影片腳本。

只輸出 JSON，格式如下：
{{
  "article": {{
    "title": "文章標題",
    "content": "文章正文（Markdown，約800字，含小標）",
    "seo_title": "SEO標題（60字內）",
    "meta_description": "Meta描述（150字內）",
    "tags": ["標籤1","標籤2","標籤3"],
    "category": "分類",
    "slug": "url-slug-english"
  }},
  "video": {{
    "title": "YouTube影片標題",
    "description": "YouTube影片描述（200字，含關鍵字）",
    "tags": ["tag1","tag2","tag3"],
    "scenes": [
      {{
        "id": 1,
        "narration": "口語化旁白（約35字）",
        "image_prompt": "詳細的英文圖片描述，用於 DALL-E 生成卡通場景圖",
        "duration": 8
      }}
    ]
  }}
}}
scenes 需要 6-8 個，每個 image_prompt 要描述具體的卡通場景畫面。
不要輸出任何其他文字。
"""
    response = _claude().messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    data = _parse_json(response.content[0].text)
    print(f"   article: {data['article']['title']}")
    print(f"   scenes : {len(data['video']['scenes'])}")
    return data


# ═══════════════════════════════════════════
# STEP 1B：模式 B — 沿用已有文章，只生成影片腳本
# ═══════════════════════════════════════════
def generate_from_existing(article_title: str, article_content: str) -> dict:
    print("\n[1/6] Claude 根據現有文章生成影片腳本...")
    prompt = f"""
你是專業的 YouTube 腳本師。

根據以下已有文章，生成影片腳本和 SEO 補充資訊。
不要重新寫文章，直接沿用原文。

文章標題：{article_title}
文章內容：
{article_content}

只輸出 JSON，格式如下：
{{
  "article": {{
    "title": "{article_title}",
    "content": {json.dumps(article_content, ensure_ascii=False)},
    "seo_title": "SEO標題（60字內，根據文章內容）",
    "meta_description": "Meta描述（150字內）",
    "tags": ["標籤1","標籤2","標籤3"],
    "category": "分類",
    "slug": "url-slug-english"
  }},
  "video": {{
    "title": "YouTube影片標題（根據文章）",
    "description": "YouTube影片描述（200字，含關鍵字）",
    "tags": ["tag1","tag2","tag3"],
    "scenes": [
      {{
        "id": 1,
        "narration": "根據文章改寫的口語化旁白（約35字）",
        "image_prompt": "詳細的英文圖片描述，用於 DALL-E 生成卡通場景圖",
        "duration": 8
      }}
    ]
  }}
}}
scenes 需要 6-8 個，內容要忠實反映文章重點。
不要輸出任何其他文字。
"""
    response = _claude().messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}],
    )
    data = _parse_json(response.content[0].text)
    print(f"   reuse article: {data['article']['title']}")
    print(f"   scenes       : {len(data['video']['scenes'])}")
    return data


def _parse_json(raw: str) -> dict:
    """穩健解析 LLM 回傳的 JSON（去 code-fence，必要時抓第一個 {...}）。"""
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            raise
        return json.loads(m.group())


# ═══════════════════════════════════════════
# STEP 2：DALL-E 3 生成卡通場景圖
# ═══════════════════════════════════════════
def generate_scene_image(prompt: str, scene_id: int) -> str:
    full_prompt = config.CARTOON_STYLE + prompt
    path = str(config.TEMP_DIR / f"scene_{scene_id}.png")
    try:
        response = _openai().images.generate(
            model=config.IMAGE_MODEL,
            prompt=full_prompt,
            size=config.IMAGE_SIZE,
            quality="standard",
            n=1,
        )
        image_url = response.data[0].url
        img_data = requests.get(image_url, timeout=30).content
        with open(path, "wb") as f:
            f.write(img_data)
        return path
    except Exception as e:
        print(f"   [warn] DALL-E 失敗 scene {scene_id}: {e}，改用純色背景")
        Image.new("RGB", (1792, 1024), (30, 40, 80)).save(path)
        return path


def generate_all_images(scenes: list) -> list:
    print("\n[2/6] DALL-E 3 生成卡通場景圖...")
    image_files = []
    for scene in scenes:
        print(f"   scene {scene['id']}: {scene['image_prompt'][:50]}...")
        image_files.append(generate_scene_image(scene["image_prompt"], scene["id"]))
    return image_files


# ═══════════════════════════════════════════
# STEP 3：Edge TTS 配音
# ═══════════════════════════════════════════
async def _tts(text: str, path: str):
    await edge_tts.Communicate(text, config.TTS_VOICE).save(path)


def generate_audio(scenes: list) -> list:
    print("\n[3/6] Edge TTS 生成配音...")
    audio_files = []
    for scene in scenes:
        path = str(config.TEMP_DIR / f"audio_{scene['id']}.mp3")
        asyncio.run(_tts(scene["narration"], path))
        audio_files.append(path)
        print(f"   scene {scene['id']} done")
    return audio_files


# ═══════════════════════════════════════════
# STEP 4：合成基礎影片（BASE_WIDTH x BASE_HEIGHT）
# ═══════════════════════════════════════════
def _split_narration(text: str) -> list:
    """Split narration into short display segments (one sentence / ~20 chars each)."""
    import re as _re
    # Split at sentence endings
    parts = _re.split(r'(?<=[。！？\.!?])\s*', text.strip())
    parts = [p.strip() for p in parts if p.strip()]
    result = []
    for part in parts:
        if len(part) <= 25:
            result.append(part)
        else:
            # Split at clause boundaries
            subs = _re.split(r'(?<=[，,、；;])\s*', part)
            buf, buf_len = '', 0
            for s in subs:
                s = s.strip()
                if not s:
                    continue
                if buf_len + len(s) <= 22:
                    buf = buf + s if buf else s
                    buf_len += len(s)
                else:
                    if buf:
                        result.append(buf)
                    buf, buf_len = s, len(s)
            if buf:
                result.append(buf)
    return result or [text[:25]]


def _write_subtitle_textfiles(segments: list, scene_id) -> list:
    """Write each segment to a temp textfile, return list of paths."""
    paths = []
    for i, seg in enumerate(segments):
        p = str(config.TEMP_DIR / f"sub_{scene_id}_{i}.txt")
        with open(p, 'w', encoding='utf-8') as f:
            f.write(seg)
        paths.append(p)
    return paths


def _audio_duration(audio_path: str) -> float:
    """配音長度 + 0.5s 收尾。用 moviepy AudioFileClip 即開即關（不留 reader），避免依賴 ffprobe。"""
    a = AudioFileClip(audio_path)
    try:
        return a.duration + 0.5
    finally:
        a.close()


def _render_scene_ffmpeg(asset_path, narration, audio_path, duration, out_path, w, h, fps, scene_id=0):
    """單場景 → 統一參數 mp4。字幕改用 drawtext+textfile（timed per segment，取代 PIL PNG overlay）。"""
    # Find CJK-capable font
    font_path = ""
    for fp in [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    ]:
        if os.path.exists(fp):
            font_path = fp
            break

    # Split narration into timed segments
    segments = _split_narration(narration)
    n = len(segments)
    # Distribute time proportionally by char count
    char_counts = [max(len(s), 1) for s in segments]
    total_chars = sum(char_counts)
    seg_files = _write_subtitle_textfiles(segments, scene_id)

    # Calculate timing: leave 0.1s gap before first, 0.2s at end
    usable = max(duration - 0.3, duration * 0.9)
    times = []  # list of (start, end)
    t = 0.1
    for c in char_counts:
        seg_dur = (c / total_chars) * usable
        times.append((t, t + seg_dur))
        t += seg_dur

    is_video = os.path.splitext(asset_path)[1].lower() in _VIDEO_EXTS
    if is_video:
        inputs = ["-stream_loop", "-1", "-i", asset_path, "-i", audio_path]
        vchain = (f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
                  f"crop={w}:{h},fps={fps},setsar=1[bg0]")
    else:
        frames = max(1, int(round(duration * fps)))
        inputs = ["-loop", "1", "-i", asset_path, "-i", audio_path]
        vchain = (f"[0:v]scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                  f"zoompan=z='min(1+0.0009*on,1.12)':d={frames}:"
                  f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={fps}[bg0]")

    # Build chained drawtext filters
    font_size = max(22, h // 54)
    margin_v = max(28, h // 40)
    box_border = max(4, h // 270)
    dt_filters = []
    for i, (seg_file, (start, end)) in enumerate(zip(seg_files, times)):
        in_tag = f"[bg{i}]"
        out_tag = f"[bg{i+1}]"
        # Escape path for FFmpeg (replace backslash, colon)
        safe_path = seg_file.replace("\\", "/").replace(":", "\\:")
        font_arg = f"fontfile={font_path.replace(':', '\\:')}:" if font_path else ""
        dt = (
            f"{in_tag}drawtext="
            f"{font_arg}"
            f"textfile={safe_path}:"
            f"fontsize={font_size}:"
            f"fontcolor=white:"
            f"borderw=2:"
            f"bordercolor=black:"
            f"box=1:"
            f"boxcolor=black@0.45:"
            f"boxborderw={box_border}:"
            f"x=(w-text_w)/2:"
            f"y=h-text_h-{margin_v}:"
            f"enable='between(t,{start:.3f},{end:.3f})'"
            f"{out_tag}"
        )
        dt_filters.append(dt)

    final_v_tag = f"[bg{n}]"
    subtitle_chain = ";".join(dt_filters)
    filter_complex = f"{vchain};{subtitle_chain};[1:a]apad[aud]"

    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", final_v_tag, "-map", "[aud]",
        "-t", f"{duration:.3f}", "-r", str(fps),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "21",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        out_path,
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"scene render failed ({os.path.basename(asset_path)}): "
                           f"{res.stderr.decode('utf-8', 'ignore')[-500:]}")


def compose_base_video(scenes: list, visual_files: list, audio_files: list, out_name: str) -> str:
    """純 ffmpeg 合成：每場景獨立 render 成統一參數 mp4，再 concat demuxer (-c copy) 秒級合併。
    靜圖走 zoompan Ken Burns、實拍走 cover-fit；混合由 _render_scene_ffmpeg 依副檔名派發。"""
    print(f"\n[4/6] 合成基礎影片（{config.BASE_WIDTH}x{config.BASE_HEIGHT}，ffmpeg per-scene + concat）...")
    w, h, fps = config.BASE_WIDTH, config.BASE_HEIGHT, config.FPS
    scene_paths = []
    for i, (scene, asset_path, audio_path) in enumerate(zip(scenes, visual_files, audio_files)):
        duration = _audio_duration(audio_path)
        sp = str(config.TEMP_DIR / f"scene_{i:03d}.mp4")
        _render_scene_ffmpeg(asset_path, scene["narration"], audio_path, duration, sp, w, h, fps, scene_id=i)
        scene_paths.append(sp)
        print(f"   scene {scene.get('id', i)} ({duration:.1f}s)")

    # 所有場景同編碼參數 → concat demuxer -c copy（無重新編碼，秒級）
    list_path = config.TEMP_DIR / "concat.txt"
    with open(list_path, "w", encoding="utf-8") as f:
        for sp in scene_paths:
            # concat demuxer 單引號跳脫：path 內的 ' → '\'' （TEMP_DIR 為 env 可控，硬化防斷）
            safe = sp.replace("\\", "/").replace("'", "'\\''")
            f.write("file '%s'\n" % safe)
    base_path = str(config.TEMP_DIR / f"{out_name}_base.mp4")
    res = subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_path), "-c", "copy", base_path],
        capture_output=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f"concat failed: {res.stderr.decode('utf-8', 'ignore')[-400:]}")
    return base_path


# ═══════════════════════════════════════════
# STEP 5：FFmpeg 輸出多平台尺寸
# ═══════════════════════════════════════════
def export_all_formats(base_video: str, out_dir) -> dict:
    """Export base video (16:9 1920x1080) to all platform formats.
    Uses scale+pad (letterbox) instead of scale+crop — no content is cut."""
    print("\n[5/6] 輸出多平台尺寸...")
    # vf filter per format: scale to fit content, pad to exact target size with black bars
    FORMAT_FILTERS = {
        "youtube_linkedin":       f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
        "tiktok_reels":           f"scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:black,setsar=1",
        "instagram_facebook":     f"scale=1080:-2,pad=1080:1080:0:(oh-ih)/2:black,setsar=1",
        "twitter_reddit_bluesky": f"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
    }
    output_files = {}
    for name, vf in FORMAT_FILTERS.items():
        w, h = config.FORMATS[name]
        out_path = str(out_dir / f"{name}.mp4")
        cmd = [
            "ffmpeg", "-y",
            "-i", base_video,
            "-vf", vf,
            "-c:v", "libx264", "-crf", "23", "-preset", "fast",
            "-c:a", "aac", "-b:a", "128k",
            out_path,
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0:
            print(f"   {name} ({w}x{h})")
            output_files[name] = out_path
        else:
            print(f"   [fail] {name}: {result.stderr.decode()[:120]}")
    return output_files


# ═══════════════════════════════════════════
# STEP 6a：上傳 YouTube
# ═══════════════════════════════════════════
def get_youtube_service():
    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    creds = None
    if os.path.exists(config.YOUTUBE_TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(config.YOUTUBE_TOKEN_FILE, scopes)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(config.YOUTUBE_CLIENT_SECRETS, scopes)
            creds = flow.run_local_server(port=0)
        with open(config.YOUTUBE_TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("youtube", "v3", credentials=creds)


def upload_youtube(video_path: str, video_meta: dict) -> tuple:
    print("\n[6/6] 上傳 YouTube...")
    youtube = get_youtube_service()
    body = {
        "snippet": {
            "title": video_meta["title"],
            "description": video_meta["description"],
            "tags": video_meta.get("tags", []),
            "categoryId": "22",
            "defaultLanguage": "zh-TW",
        },
        "status": {
            "privacyStatus": config.YOUTUBE_PRIVACY,
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(video_path, chunksize=-1, resumable=True, mimetype="video/mp4")
    request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"   進度 {int(status.progress() * 100)}%")
    video_id = response["id"]
    url = f"https://www.youtube.com/watch?v={video_id}"
    embed = (
        '<div style="position:relative;padding-bottom:56.25%;height:0;">'
        f'<iframe src="https://www.youtube.com/embed/{video_id}" '
        'style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" '
        'allowfullscreen loading="lazy"></iframe></div>'
    )
    print(f"   YouTube: {url}")
    return url, embed


# ═══════════════════════════════════════════
# STEP 6b：發佈 WordPress
# ═══════════════════════════════════════════
def publish_wordpress(article: dict, embed_code: str, youtube_url: str) -> str:
    print("\n發佈 WordPress...")
    config.require("WP_URL", "WP_USERNAME", "WP_PASSWORD")
    content = f"""{embed_code}

{article['content']}

---
[觀看完整影片]({youtube_url})
"""
    api = f"{config.WP_URL}/wp-json/wp/v2"
    auth = (config.WP_USERNAME, config.WP_PASSWORD)

    cat_id = 1
    r = requests.get(f"{api}/categories", params={"search": article.get("category", "")}, auth=auth)
    if r.ok and r.json():
        cat_id = r.json()[0]["id"]
    elif article.get("category"):
        r2 = requests.post(f"{api}/categories", json={"name": article["category"]}, auth=auth)
        if r2.ok:
            cat_id = r2.json()["id"]

    tag_ids = []
    for tag in article.get("tags", []):
        r = requests.post(f"{api}/tags", json={"name": tag}, auth=auth)
        if r.ok:
            tag_ids.append(r.json()["id"])
        else:
            s = requests.get(f"{api}/tags", params={"search": tag}, auth=auth)
            if s.ok and s.json():
                tag_ids.append(s.json()[0]["id"])

    post = {
        "title": article["title"],
        "content": content,
        "status": config.WP_STATUS,
        "slug": article.get("slug", ""),
        "categories": [cat_id],
        "tags": tag_ids,
        "meta": {
            "_yoast_wpseo_title": article.get("seo_title", ""),
            "_yoast_wpseo_metadesc": article.get("meta_description", ""),
        },
    }
    r = requests.post(f"{api}/posts", json=post, auth=auth)
    if r.ok:
        url = r.json().get("link", "")
        print(f"   WordPress: {url}")
        return url
    print(f"   [fail] WordPress {r.status_code}: {r.text[:120]}")
    return ""


# ═══════════════════════════════════════════
# 清理暫存
# ═══════════════════════════════════════════
def cleanup():
    import shutil
    shutil.rmtree(config.TEMP_DIR, ignore_errors=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════
# Render-only 入口（給 next-admin video/pipeline 積木呼叫）
# ═══════════════════════════════════════════
def render_video(scenes: list, visual_files: list, out_name: str):
    """只做合成：scenes(含 narration) + 已備妥的視覺素材 → 配音 → 合成 → 多尺寸輸出。

    visual_files 每項可為「靜圖（Flux）」或「實拍影片片段（Pexels B-roll）」，
    由 _render_scene_ffmpeg 依副檔名自動派發（ffmpeg 混合 render：靜圖 zoompan / 實拍 cover-fit）。
    刻意「不」生腳本、不生圖/抓素材、不發佈 —— 那些由 next-admin 既有能力負責
    （article core / image-gen / Pexels fetch / wp-bridge），本服務只保留影片合成價值。
    回傳 (output_files: dict, base_video: str, out_dir: Path)。呼叫端負責 cleanup()。
    """
    if len(scenes) != len(visual_files):
        raise ValueError(f"scenes({len(scenes)}) 與 visual_files({len(visual_files)}) 數量不一致")
    safe_name = re.sub(r"[^\w一-鿿]", "_", out_name)[:40] or "video"
    out_dir = config.OUTPUT_DIR / safe_name
    out_dir.mkdir(parents=True, exist_ok=True)

    audio_files = generate_audio(scenes)
    base_video = compose_base_video(scenes, visual_files, audio_files, safe_name)
    output_files = export_all_formats(base_video, out_dir)
    return output_files, base_video, out_dir


# ═══════════════════════════════════════════
# 可程式化進入點（給 controller 呼叫）
# ═══════════════════════════════════════════
def run(mode: str, topic: str = "", article_title: str = "", article_content: str = "") -> dict:
    mode = mode.upper()
    safe_name = re.sub(r"[^\w一-鿿]", "_", (topic or article_title))[:40]
    # out_dir 由 render_video 統一建立並回傳（single source of truth；避免空名 fallback 分歧）

    try:
        if mode == "A":
            data = generate_from_topic(topic)
        else:
            data = generate_from_existing(article_title, article_content)

        article = data["article"]
        video_meta = data["video"]

        image_files = generate_all_images(video_meta["scenes"])
        # 合成走共用的 render-only 入口（零重複；run 額外負責生腳本/生圖/發佈）
        output_files, base_video, out_dir = render_video(video_meta["scenes"], image_files, safe_name)

        youtube_url = embed_code = ""
        if config.YOUTUBE_ENABLE:
            youtube_url, embed_code = upload_youtube(
                output_files.get("youtube_linkedin", base_video), video_meta
            )

        wp_url = ""
        if config.WP_ENABLE:
            wp_url = publish_wordpress(article, embed_code, youtube_url)

        n = len(video_meta["scenes"])
        result = {
            "mode": mode,
            "article_title": article["title"],
            "youtube_url": youtube_url,
            "wp_url": wp_url,
            "outputs": {k: str(v) for k, v in output_files.items()},
            "cost_estimate": {
                "dalle3_images": f"${n * 0.04:.2f}",
                "claude_api": "$0.05" if mode == "A" else "$0.02",
                "total": f"${n * 0.04 + (0.05 if mode == 'A' else 0.02):.2f}",
            },
        }
        with open(out_dir / "result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print("\n" + "=" * 60)
        print("完成！")
        print(f"   YouTube  : {youtube_url or '(已停用)'}")
        print(f"   WordPress: {wp_url or '(已停用)'}")
        print(f"   輸出資料夾: {out_dir}")
        print("=" * 60)
        return result
    finally:
        cleanup()


# ═══════════════════════════════════════════
# 互動式主程式（手動執行）
# ═══════════════════════════════════════════
def main():
    print("=" * 60)
    print("  全自動卡通影片 + 多平台發佈系統")
    print("=" * 60)
    print("  [A] 輸入主題 -> 全新生成文章 + 影片")
    print("  [B] 貼入已有文章 -> 只生成影片腳本")
    mode = input("\n選擇 A 或 B：").strip().upper()

    if mode == "A":
        topic = input("\n請輸入主題或關鍵字：\n> ").strip()
        if not topic:
            print("[err] 主題不能為空")
            return
        run("A", topic=topic)

    elif mode == "B":
        article_title = input("\n請輸入文章標題：\n> ").strip()
        print("\n請貼入文章內容（連按兩次 Enter 結束）：")
        lines = []
        while True:
            line = input()
            if line == "" and lines and lines[-1] == "":
                break
            lines.append(line)
        article_content = "\n".join(lines).strip()
        if not article_title or not article_content:
            print("[err] 標題和內容不能為空")
            return
        run("B", article_title=article_title, article_content=article_content)

    else:
        print("[err] 請輸入 A 或 B")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        print(f"\n[err] {e}")
        traceback.print_exc()
