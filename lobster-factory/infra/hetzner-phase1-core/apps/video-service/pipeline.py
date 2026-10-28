#!/usr/bin/env python3
"""
pipeline.py — 文章 → 卡通影片 → 多尺寸輸出 → YouTube + WordPress 全自動

安裝依賴：
  pip install -r requirements.txt
系統依賴：
  Ubuntu/Debian: sudo apt install ffmpeg fonts-noto-cjk
  Windows: 下載 ffmpeg 加入 PATH

設定：複製 .env.example 為 .env 後填值（見 README）。

輸出尺寸（依長寬比）：
  16x9.mp4   1920x1080  （橫式）
  9x16.mp4   1080x1920  （直式）
  4x5.mp4    1080x1350  （直式 4:5）
"""

import os
import re
import json
import base64
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


# Opus 5.5 always thinks (thinking counts toward max_tokens) and effort is its only control; models without
# effort (Haiku) reject it. A safety-classifier decline is re-run by the API on the model it picks.
NO_EFFORT_MODEL_PREFIXES = ("claude-haiku-",)
FALLBACK_MODELS = ("claude-opus-5-5", "claude-opus-5", "claude-fable-5-1")


def _claude_text(prompt: str) -> str:
    """One Claude call -> the answer text (read by block type: a thinking block comes first on Opus 5.5)."""
    model = config.CLAUDE_MODEL
    extra: dict = {}
    if not model.startswith(NO_EFFORT_MODEL_PREFIXES):
        extra["output_config"] = {"effort": "medium"}
    if model in FALLBACK_MODELS:
        extra.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    response = _claude().beta.messages.create(
        model=model,
        max_tokens=16000,
        messages=[{"role": "user", "content": prompt}],
        **extra,
    )
    if response.stop_reason in ("refusal", "max_tokens"):
        raise RuntimeError(f"Claude 未完成回答（stop_reason={response.stop_reason}）")
    return "".join(b.text for b in response.content if b.type == "text")


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
        "image_prompt": "詳細的英文圖片描述，用於生成卡通場景圖",
        "duration": 8
      }}
    ]
  }}
}}
scenes 需要 6-8 個，每個 image_prompt 要描述具體的卡通場景畫面。
不要輸出任何其他文字。
"""
    data = _parse_json(_claude_text(prompt))
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
        "image_prompt": "詳細的英文圖片描述，用於生成卡通場景圖",
        "duration": 8
      }}
    ]
  }}
}}
scenes 需要 6-8 個，內容要忠實反映文章重點。
不要輸出任何其他文字。
"""
    data = _parse_json(_claude_text(prompt))
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
# STEP 2：gpt-image-2 生成卡通場景圖
# ═══════════════════════════════════════════
def generate_scene_image(prompt: str, scene_id: int) -> str:
    full_prompt = config.CARTOON_STYLE + prompt
    path = str(config.TEMP_DIR / f"scene_{scene_id}.png")
    try:
        response = _openai().images.generate(
            model=config.IMAGE_MODEL,
            prompt=full_prompt,
            size=config.IMAGE_SIZE,
            quality="low",
            n=1,
        )
        # gpt-image models return base64 only (no url).
        with open(path, "wb") as f:
            f.write(base64.b64decode(response.data[0].b64_json))
        return path
    except Exception as e:
        print(f"   [warn] {config.IMAGE_MODEL} 失敗 scene {scene_id}: {e}，改用純色背景")
        w, h = (int(x) for x in config.IMAGE_SIZE.split("x"))
        Image.new("RGB", (w, h), (30, 40, 80)).save(path)
        return path


def generate_all_images(scenes: list) -> list:
    print(f"\n[2/6] {config.IMAGE_MODEL} 生成卡通場景圖...")
    image_files = []
    for scene in scenes:
        print(f"   scene {scene['id']}: {scene['image_prompt'][:50]}...")
        image_files.append(generate_scene_image(scene["image_prompt"], scene["id"]))
    return image_files


# ═══════════════════════════════════════════
# STEP 3：Edge TTS 配音
# ═══════════════════════════════════════════
async def _tts(text: str, path: str, voice: str = ""):
    await edge_tts.Communicate(text, voice or config.TTS_VOICE).save(path)


def _tts_openai(text: str, path: str, model: str = "tts-1", voice: str = "alloy") -> None:
    """OpenAI TTS (tts-1 / tts-1-hd) — better prosody for English and multi-language."""
    config.require("OPENAI_API_KEY")
    resp = _openai().audio.speech.create(model=model, voice=voice, input=text)
    with open(path, "wb") as f:
        f.write(resp.content)


def generate_audio(scenes: list, tts_provider: str = "edge", tts_voice: str = "") -> list:
    print(f"\n[3/6] {tts_provider.upper()} TTS 生成配音...")
    # OpenAI TTS requested but OPENAI_API_KEY not set → graceful fallback to Edge TTS.
    if tts_provider == "openai" and not config.OPENAI_API_KEY:
        print("   [WARN] OPENAI_API_KEY not set — falling back to Edge TTS")
        tts_provider, tts_voice = "edge", ""
    audio_files = []
    for scene in scenes:
        path = str(config.TEMP_DIR / f"audio_{scene['id']}.mp3")
        if tts_provider == "openai":
            # tts_voice format: "MODEL:VOICE" e.g. "tts-1:nova" or "tts-1-hd:shimmer"
            if ":" in (tts_voice or ""):
                model, voice_name = tts_voice.split(":", 1)
            else:
                model, voice_name = "tts-1", tts_voice or "alloy"
            _tts_openai(scene["narration"], path, model=model, voice=voice_name)
        else:
            asyncio.run(_tts(scene["narration"], path, voice=tts_voice))
        audio_files.append(path)
        print(f"   scene {scene['id']} done")
    return audio_files


# ═══════════════════════════════════════════
# STEP 4：合成基礎影片（BASE_WIDTH x BASE_HEIGHT）
# ═══════════════════════════════════════════
def _split_narration(text: str, max_len: int = 28) -> list:
    """Split narration into short display segments (~max_len chars each).
    Priority: sentence endings → clause boundaries → word boundaries → hard cut."""
    import re as _re

    def _hard_split(s: str) -> list:
        """Split s into ≤max_len chunks at word boundaries, falling back to hard cut."""
        words = s.split()
        chunks, buf = [], ''
        for w in words:
            candidate = (buf + ' ' + w).strip() if buf else w
            if len(candidate) <= max_len:
                buf = candidate
            else:
                if buf:
                    chunks.append(buf)
                buf = w if len(w) <= max_len else w[:max_len]
        if buf:
            chunks.append(buf)
        return chunks or [s[:max_len]]

    # 1. Split at sentence endings
    parts = _re.split(r'(?<=[。！？\.!?])\s*', text.strip())
    parts = [p.strip() for p in parts if p.strip()]

    result = []
    for part in parts:
        if len(part) <= max_len:
            result.append(part)
        else:
            # 2. Split at clause boundaries (CJK and Latin)
            subs = _re.split(r'(?<=[，,、；;])\s*', part)
            subs = [s.strip() for s in subs if s.strip()]
            for sub in subs:
                if len(sub) <= max_len:
                    result.append(sub)
                else:
                    # 3. Word-boundary + hard cut fallback
                    result.extend(_hard_split(sub))

    return result or [text[:max_len]]


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

    # 5 Ken Burns variants (rotated per scene_id): zoom-in from 4 corners + zoom-out center
    _KB = [
        ("min(1+0.0009*on,1.12)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),   # zoom-in center
        ("min(1+0.0009*on,1.12)", "0",                 "0"),                   # zoom-in top-left
        ("min(1+0.0009*on,1.12)", "iw-(iw/zoom)",      "0"),                   # zoom-in top-right
        ("min(1+0.0009*on,1.12)", "0",                 "ih-(ih/zoom)"),        # zoom-in bottom-left
        ("max(1.12-0.0009*on,1.0)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),  # zoom-out center
    ]
    kb_z, kb_x, kb_y = _KB[scene_id % len(_KB)]
    fade_dur = min(0.3, duration * 0.15)  # cap at 15% of scene duration
    fade_out_st = max(0.0, duration - fade_dur)

    is_video = os.path.splitext(asset_path)[1].lower() in _VIDEO_EXTS
    if is_video:
        inputs = ["-stream_loop", "-1", "-i", asset_path, "-i", audio_path]
        vchain = (f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
                  f"crop={w}:{h},fps={fps},setsar=1,"
                  f"fade=t=in:st=0:d={fade_dur:.3f},"
                  f"fade=t=out:st={fade_out_st:.3f}:d={fade_dur:.3f}[bg0]")
    else:
        frames = max(1, int(round(duration * fps)))
        inputs = ["-loop", "1", "-i", asset_path, "-i", audio_path]
        vchain = (f"[0:v]scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                  f"zoompan=z='{kb_z}':d={frames}:"
                  f"x='{kb_x}':y='{kb_y}':s={w}x{h}:fps={fps},"
                  f"fade=t=in:st=0:d={fade_dur:.3f},"
                  f"fade=t=out:st={fade_out_st:.3f}:d={fade_dur:.3f}[bg0]")

    # Build chained drawtext filters
    font_size = max(48, h // 20)  # 字幕字級加大（1080p≈54px；舊 h//54≈22px 太小，9:16 縮放後幾乎看不到）
    margin_v = max(40, h // 30)
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
            f"borderw=3:"
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


def _render_intro_scene(title: str, duration: float, out_path: str, w: int, h: int, fps: int) -> None:
    """Render a title card: black background + white text that fades in over 0.8s."""
    font_path = ""
    for fp in [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]:
        if os.path.exists(fp):
            font_path = fp
            break

    title_file = str(config.TEMP_DIR / "intro_title.txt")
    with open(title_file, "w", encoding="utf-8") as f:
        f.write(title)

    safe_path = title_file.replace("\\", "/").replace(":", "\\:")
    font_arg = f"fontfile={font_path.replace(':', '\\:')}:" if font_path else ""
    font_size = max(36, h // 18)

    dt_filter = (
        f"[0:v]drawtext={font_arg}"
        f"textfile={safe_path}:"
        f"fontsize={font_size}:"
        f"fontcolor=white:"
        f"alpha='if(lt(t,0.8),t/0.8,1)':"
        f"borderw=2:bordercolor=black:"
        f"x=(w-text_w)/2:y=(h-text_h)/2[v]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"color=c=black:size={w}x{h}:r={fps}",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-filter_complex", dt_filter,
        "-map", "[v]", "-map", "1:a",
        "-t", f"{duration:.2f}",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "21",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        out_path,
    ]
    res = subprocess.run(cmd, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(f"intro render failed: {res.stderr.decode('utf-8', 'ignore')[-400:]}")


def compose_base_video(scenes: list, visual_files: list, audio_files: list, out_name: str,
                       w: "int | None" = None, h: "int | None" = None, fps: "int | None" = None,
                       intro_title: str = "", intro_duration: float = 3.0) -> str:
    """純 ffmpeg 合成：每場景獨立 render 成統一參數 mp4，再 concat demuxer (-c copy) 秒級合併。
    靜圖走 zoompan Ken Burns、實拍走 cover-fit；混合由 _render_scene_ffmpeg 依副檔名派發。
    w/h/fps 省略 → config 預設（BASE_WIDTH/HEIGHT/FPS）= 舊單格式行為；多格式入口傳各格式尺寸，
    per-scene render 直接以該尺寸 cover-fit/zoompan 填滿 → 原生比例、無 letterbox。"""
    w = config.BASE_WIDTH if w is None else w
    h = config.BASE_HEIGHT if h is None else h
    fps = config.FPS if fps is None else fps
    print(f"\n[4/6] 合成基礎影片（{w}x{h}，ffmpeg per-scene + concat）...")
    scene_paths = []

    # Optional intro title card
    if intro_title:
        intro_path = str(config.TEMP_DIR / "scene_intro.mp4")
        _render_intro_scene(intro_title, intro_duration, intro_path, w, h, fps)
        scene_paths.append(intro_path)
        print(f"   intro ({intro_duration:.1f}s): {intro_title[:40]}")

    for i, (scene, asset_path, audio_path) in enumerate(zip(scenes, visual_files, audio_files)):
        duration = _audio_duration(audio_path)
        sp = str(config.TEMP_DIR / f"scene_{i:03d}.mp4")
        _render_scene_ffmpeg(asset_path, scene["narration"], audio_path, duration, sp, w, h, fps, scene_id=i)
        scene_paths.append(sp)
        print(f"   scene {scene.get('id', i)} ({duration:.1f}s)")

    # 所有場景同編碼參數 → concat demuxer -c copy（無重新編碼，秒級）
    base_path = str(config.TEMP_DIR / f"{out_name}_base.mp4")
    return _concat_uniform(scene_paths, "concat.txt", base_path)


def _concat_uniform(segment_paths: list, list_name: str, out_path: str) -> str:
    """concat demuxer -c copy。呼叫端保證所有 segment 已是同編碼參數（codec/尺寸/取樣率一致），
    否則 -c copy 會產出壞檔或直接失敗。"""
    list_path = config.TEMP_DIR / list_name
    with open(list_path, "w", encoding="utf-8") as f:
        for sp in segment_paths:
            # concat demuxer 單引號跳脫：path 內的 ' → '\'' （TEMP_DIR 為 env 可控，硬化防斷）
            safe = sp.replace("\\", "/").replace("'", "'\\''")
            f.write("file '%s'\n" % safe)
    try:
        res = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_path), "-c", "copy", out_path],
            capture_output=True, timeout=_FFMPEG_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"concat failed: 逾時（>{_FFMPEG_TIMEOUT_S}s）")
    if res.returncode != 0:
        raise RuntimeError(f"concat failed: {res.stderr.decode('utf-8', 'ignore')[-400:]}")
    return out_path


# ═══════════════════════════════════════════
# STEP 5：FFmpeg 輸出多平台尺寸
# ═══════════════════════════════════════════
def export_all_formats(base_video: str, out_dir) -> dict:
    """Export base video (16:9 1920x1080) to all platform formats.
    Uses scale+pad (letterbox) instead of scale+crop — no content is cut."""
    print("\n[5/6] 輸出多平台尺寸...")
    # vf filter per format: scale to fit content, pad to exact target size with black bars
    FORMAT_FILTERS = {
        "16x9": f"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
        "9x16": f"scale=1080:-2,pad=1080:1920:0:(oh-ih)/2:black,setsar=1",
        "4x5":  f"scale=1080:-2,pad=1080:1350:0:(oh-ih)/2:black,setsar=1",
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
def render_video(scenes: list, visual_files: list, out_name: str,
                 tts_provider: str = "edge", tts_voice: str = "",
                 intro_title: str = "", intro_duration: float = 3.0):
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

    audio_files = generate_audio(scenes, tts_provider=tts_provider, tts_voice=tts_voice)
    base_video = compose_base_video(scenes, visual_files, audio_files, safe_name,
                                    intro_title=intro_title, intro_duration=intro_duration)
    output_files = export_all_formats(base_video, out_dir)
    return output_files, base_video, out_dir


def render_video_multiformat(scenes: list, format_assets: dict, out_name: str,
                             tts_provider: str = "edge", tts_voice: str = "",
                             intro_title: str = "", intro_duration: float = 3.0):
    """多格式「原生」輸出：每個比例用『自己那組視覺素材』+『自己的目標尺寸』各跑一次 compose
    （per-scene cover-fit/zoompan 直接填滿目標比例）→ 無 export_all_formats 的 pad letterbox、無黑邊。

    format_assets：{ "16x9": [...visual_files], "9x16": [...], "4x5": [...] }；每組長度須等於 scenes
    （與舊 render_video 的 visual_files 同規約，只是 per-format）。audio 與比例無關 → 只生一次三格式
    共用（省 2/3 TTS）；多格式主要增量成本在 ffmpeg per-scene render（每格式一輪）。
    回 (outputs: {fmt: path}, out_dir)。呼叫端負責 cleanup()。"""
    import shutil
    formats = list(format_assets.keys())
    if not formats:
        raise ValueError("format_assets 不可為空")
    for fmt, files in format_assets.items():
        if fmt not in config.FORMATS:
            raise ValueError(f"未知格式 {fmt}（合法：{list(config.FORMATS)}）")
        if not isinstance(files, list) or len(files) != len(scenes):
            n = len(files) if isinstance(files, list) else "N/A"
            raise ValueError(f"format_assets[{fmt}] 長度（{n}）須等於 scenes（{len(scenes)}）")
    safe_name = re.sub(r"[^\w一-鿿]", "_", out_name)[:40] or "video"
    out_dir = config.OUTPUT_DIR / safe_name
    out_dir.mkdir(parents=True, exist_ok=True)

    # 配音與比例無關 → 只生一次，三格式共用。
    audio_files = generate_audio(scenes, tts_provider=tts_provider, tts_voice=tts_voice)

    outputs = {}
    for fmt in formats:
        w, h = config.FORMATS[fmt]
        # ⚠️ 必須序列執行，禁止並行此迴圈：compose 的 per-scene temp（scene_NNN.mp4 / concat.txt /
        # sub_*.txt / scene_intro.mp4）為固定名，序列下後格式覆蓋前格式 temp 無害（前格式 base 已
        # 產出並搬出）；out_name 帶 fmt 後綴使各格式 base 檔名互不衝突。並行化會 silently 損毀輸出。
        base_video = compose_base_video(
            scenes, format_assets[fmt], audio_files, f"{safe_name}_{fmt}", w, h, config.FPS,
            intro_title=intro_title, intro_duration=intro_duration,
        )
        out_path = str(out_dir / f"{fmt}.mp4")
        # base_video 已是目標尺寸 + 統一編碼（per-scene 已 crf 21 / yuv420p）→ 直接搬，免二次轉碼。
        shutil.move(base_video, out_path)
        outputs[fmt] = out_path
        print(f"   {fmt} ({w}x{h}) 原生輸出 ✓")
    return outputs, out_dir


# ═══════════════════════════════════════════
# 實拍剪輯入口（給 next-admin footage/render 積木呼叫）
# ═══════════════════════════════════════════
def _probe_has_audio(path: str) -> bool:
    """ffprobe 是否有音訊流（Pexels 等 B-roll 素材常無音軌，需補靜音才能 concat 對齊）。"""
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a",
         "-show_entries", "stream=index", "-of", "json", path],
        capture_output=True, text=True, timeout=15,
    )
    if res.returncode != 0:
        return False
    try:
        return bool(json.loads(res.stdout or "{}").get("streams"))
    except json.JSONDecodeError:
        return False


_FFMPEG_TIMEOUT_S = 300  # 單一 ffmpeg 呼叫上限；卡住會釋放 server._render_lock（見 subprocess.TimeoutExpired 處理）


def _run_ffmpeg(cmd: list, on_fail_prefix: str) -> None:
    """統一的 subprocess.run 包裝：bound timeout，逾時/失敗都丟 RuntimeError（讓呼叫端 job 標記
    error 並釋放 _render_lock，而不是無限期卡住整個服務——這是唯一有 timeout 的路徑之一，
    其餘既有 _render_scene_ffmpeg/_render_intro_scene/concat 呼叫沿用舊行為，不在本次改動範圍。"""
    try:
        res = subprocess.run(cmd, capture_output=True, timeout=_FFMPEG_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{on_fail_prefix}: 逾時（>{_FFMPEG_TIMEOUT_S}s）")
    if res.returncode != 0:
        raise RuntimeError(f"{on_fail_prefix}: {res.stderr.decode('utf-8', 'ignore')[-500:]}")


def _trim_clip_video(src: str, start_ms: float, duration_ms: float, out_path: str, w: int, h: int, fps: int) -> None:
    """單一 clip 依 [start_ms, start_ms+duration_ms) 剪出畫面（無音軌），cover-fit 填滿目標尺寸。"""
    start_s, dur_s = start_ms / 1000.0, duration_ms / 1000.0
    cmd = [
        "ffmpeg", "-y", "-ss", f"{start_s:.3f}", "-i", src, "-t", f"{dur_s:.3f}",
        "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "21",
        out_path,
    ]
    _run_ffmpeg(cmd, f"clip video trim failed ({os.path.basename(src)})")


def _trim_clip_audio(src: str, start_ms: float, duration_ms: float, out_path: str) -> None:
    """單一 clip（或獨立音訊檔）依 [start_ms, start_ms+duration_ms) 剪出音軌；無音軌來源補等長靜音，
    確保所有片段統一編碼參數（aac/44100/stereo）以便後續 concat -c copy。"""
    start_s, dur_s = start_ms / 1000.0, duration_ms / 1000.0
    if _probe_has_audio(src):
        cmd = [
            "ffmpeg", "-y", "-ss", f"{start_s:.3f}", "-i", src, "-t", f"{dur_s:.3f}",
            "-vn", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            out_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t", f"{dur_s:.3f}", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
            out_path,
        ]
    _run_ffmpeg(cmd, f"clip audio trim failed ({os.path.basename(src)})")


def _mux_audio_track(video_path: str, audio_path: str, out_path: str) -> None:
    """把（已剪好、時長對齊的）音軌接上無聲畫面。-shortest 吸收秒級剪輯誤差，避免尾端卡幀。"""
    cmd = [
        "ffmpeg", "-y", "-i", video_path, "-i", audio_path,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-shortest",
        out_path,
    ]
    _run_ffmpeg(cmd, "audio mux failed")


def _burn_captions_ffmpeg(in_path: str, cues: list, out_path: str, h: int) -> None:
    """依絕對時間（start_ms/end_ms）燒入字幕 cue，非依旁白字數比例切分（與 _render_scene_ffmpeg
    的字幕邏輯不同源，因為 caption cue 時間已由呼叫端 Timeline v1 驗證過，不需重新切分）。
    音訊直接 copy passthrough。"""
    font_path = ""
    for fp in [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    ]:
        if os.path.exists(fp):
            font_path = fp
            break

    font_size = max(48, h // 20)
    margin_v = max(40, h // 30)
    box_border = max(4, h // 270)
    dt_filters = []
    for i, cue in enumerate(cues):
        seg_path = str(config.TEMP_DIR / f"fcaption_{i}.txt")
        with open(seg_path, "w", encoding="utf-8") as f:
            f.write(cue["text"])
        safe_path = seg_path.replace("\\", "/").replace(":", "\\:")
        font_arg = f"fontfile={font_path.replace(':', '\\:')}:" if font_path else ""
        start_s = cue["start_ms"] / 1000.0
        end_s = cue["end_ms"] / 1000.0
        in_tag = "[0:v]" if i == 0 else f"[cap{i}]"
        out_tag = f"[cap{i + 1}]" if i < len(cues) - 1 else "[capout]"
        dt_filters.append(
            f"{in_tag}drawtext={font_arg}"
            f"textfile={safe_path}:"
            f"fontsize={font_size}:"
            f"fontcolor=white:"
            f"borderw=3:"
            f"bordercolor=black:"
            f"box=1:"
            f"boxcolor=black@0.45:"
            f"boxborderw={box_border}:"
            f"x=(w-text_w)/2:"
            f"y=h-text_h-{margin_v}:"
            f"enable='between(t,{start_s:.3f},{end_s:.3f})'"
            f"{out_tag}"
        )

    cmd = [
        "ffmpeg", "-y", "-i", in_path,
        "-filter_complex", ";".join(dt_filters),
        "-map", "[capout]", "-map", "0:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "21",
        "-c:a", "copy",
        out_path,
    ]
    _run_ffmpeg(cmd, "caption burn failed")


def render_footage_multiformat(clips: list, formats: list, out_name: str,
                               audio: "dict | None" = None, captions: "list | None" = None,
                               fps: "int | None" = None):
    """實拍素材剪輯合成：trim 各 clip 到 [source_start_ms, source_start_ms+duration_ms) → concat →
    可選音軌覆蓋／可選字幕燒錄。刻意「不」呼叫 TTS/Claude/生圖 —— 實拍素材本身已是最終畫面
    （可能自帶對白/環境音），本函式只做剪輯合成。

    clips: [{"source_url": <已 materialize 的本機路徑>, "source_start_ms": ms, "duration_ms": ms}, ...]
    audio: 選填 {"source_url","source_start_ms","duration_ms"} —— 提供時取代整段時間軸音軌
           （各 clip 自帶音軌一律捨棄）；省略時保留各 clip 音軌剪接串接（無音軌處補靜音）。
    captions: 選填 [{"start_ms","end_ms","text"}, ...] —— 絕對時間燒字幕，與比例無關但各格式
              需各自重燒（字級/邊距依 h 換算）。
    回傳 (outputs: {fmt: path}, out_dir)。呼叫端負責 cleanup()。
    """
    import shutil
    if not clips:
        raise ValueError("clips 不可為空")
    if not formats:
        raise ValueError("formats 不可為空")
    fps = config.FPS if fps is None else fps
    print(f"\n[實拍剪輯] {len(clips)} 個片段 × {len(formats)} 格式...")
    safe_name = re.sub(r"[^\w一-鿿]", "_", out_name)[:40] or "footage"
    out_dir = config.OUTPUT_DIR / safe_name
    out_dir.mkdir(parents=True, exist_ok=True)

    # 音軌與畫面比例無關（trim 對象是聲音檔，不受 w/h 影響）→ 只需算一次，跨格式共用。
    if audio:
        audio_path = str(config.TEMP_DIR / "fclip_audio_ext.m4a")
        _trim_clip_audio(audio["source_url"], audio["source_start_ms"], audio["duration_ms"], audio_path)
    else:
        audio_segs = []
        for i, clip in enumerate(clips):
            apath = str(config.TEMP_DIR / f"fclip_a_{i:03d}.m4a")
            _trim_clip_audio(clip["source_url"], clip["source_start_ms"], clip["duration_ms"], apath)
            audio_segs.append(apath)
        audio_path = _concat_uniform(audio_segs, "fconcat_audio.txt", str(config.TEMP_DIR / "fclip_audio_native.m4a"))

    outputs = {}
    for fmt in formats:
        w, h = config.FORMATS[fmt]
        video_segs = []
        for i, clip in enumerate(clips):
            vpath = str(config.TEMP_DIR / f"fclip_v_{fmt}_{i:03d}.mp4")
            _trim_clip_video(clip["source_url"], clip["source_start_ms"], clip["duration_ms"], vpath, w, h, fps)
            video_segs.append(vpath)
        base_video = _concat_uniform(video_segs, f"fconcat_video_{fmt}.txt", str(config.TEMP_DIR / f"{fmt}_base.mp4"))
        muxed_path = str(config.TEMP_DIR / f"{fmt}_muxed.mp4")
        _mux_audio_track(base_video, audio_path, muxed_path)
        final_path = str(out_dir / f"{fmt}.mp4")
        if captions:
            _burn_captions_ffmpeg(muxed_path, captions, final_path, h)
        else:
            shutil.move(muxed_path, final_path)
        outputs[fmt] = final_path
        print(f"   {fmt} ({w}x{h}) 實拍剪輯輸出 ✓")
    return outputs, out_dir


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
                output_files.get("16x9", base_video), video_meta
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
                "scene_images": f"${n * 0.02:.2f}",  # gpt-image-2 low ≈ $0.02 (IMAGE_RATES openai-low)
                "claude_api": "$0.05" if mode == "A" else "$0.02",
                "total": f"${n * 0.02 + (0.05 if mode == 'A' else 0.02):.2f}",
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
