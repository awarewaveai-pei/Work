"""本機離線轉錄（faster-whisper）。音檔絕不外流。

2026-08-17 實測（BU5.m4a，60 分鐘，RTX 5060）：
  - GPU float16：7.0x realtime（510s）
  - CPU int8：0.3x realtime（3.6 小時）→ 純 CPU 機器不可用
"""
import os
import time

ZH_PROMPT = "以下是一場繁體中文會議的錄音，請以臺灣用語的繁體中文輸出逐字稿。"


def register_cuda_dlls():
    """CUDA 執行庫由 pip wheel 提供（nvidia-cublas-cu12 / nvidia-cudnn-cu12），
    但不在 PATH 上。Windows 需明確 add_dll_directory 才找得到。"""
    import glob
    import site
    added = []
    roots = list(site.getsitepackages()) + [site.getusersitepackages()]
    for p in roots:
        for d in glob.glob(os.path.join(p, "nvidia", "*", "bin")):
            if os.path.isdir(d):
                try:
                    os.add_dll_directory(d)
                    added.append(d)
                except OSError:
                    pass
    if added:
        os.environ["PATH"] = os.pathsep.join(added) + os.pathsep + os.environ.get("PATH", "")
    return added


def pick_device(model_name: str, log=print):
    """建構成功 != 能推論。cuBLAS/cuDNN 缺失只在第一次 encode 才炸，
    這裡跑一次極短的真實推論當探針，失敗才退 CPU。"""
    from faster_whisper import WhisperModel
    import numpy as np

    dlls = register_cuda_dlls()
    log(f"[info] 註冊 CUDA DLL 目錄 {len(dlls)} 個")

    probe = np.zeros(16000, dtype=np.float32)
    try:
        m = WhisperModel(model_name, device="cuda", compute_type="float16")
        list(m.transcribe(probe, language="zh", vad_filter=False)[0])
        return m, "cuda/float16"
    except Exception as e:
        log(f"[warn] GPU 推論探針失敗 ({type(e).__name__}: {str(e)[:140]}) -> 退回 CPU")

    cpu_threads = min(16, os.cpu_count() or 8)
    m = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=cpu_threads)
    list(m.transcribe(probe, language="zh", vad_filter=False)[0])
    return m, f"cpu/int8 x{cpu_threads}"


def preflight(path: str, log=print) -> float:
    """先驗音軌再載模型。沒音軌就炸在 3GB 模型載入之後，浪費又難懂。"""
    import av
    if not os.path.exists(path):
        raise FileNotFoundError(f"檔案不存在: {path}")
    try:
        c = av.open(path)
    except Exception as e:
        raise ValueError(f"無法開啟媒體檔 ({type(e).__name__}): {e}") from e
    n_aud = len(c.streams.audio)
    dur = c.duration / 1_000_000 if c.duration else 0
    c.close()
    if n_aud == 0:
        raise ValueError(f"這個檔案沒有音軌（audio streams = 0），無法轉錄: {path}")
    log(f"[0/3] 預檢通過：音軌 {n_aud} 條 / 長度 {dur:.1f}s")
    return dur


def transcribe(media_path: str, model_name: str = "large-v3", log=print) -> dict:
    """回傳 transcript dict（不寫檔，由呼叫端決定輸出位置）。"""
    preflight(media_path, log)
    log(f"[1/3] 載入模型 {model_name} ...")
    t0 = time.time()
    model, backend = pick_device(model_name, log)
    log(f"      backend={backend}  載入耗時 {time.time()-t0:.1f}s")

    log(f"[2/3] 轉錄 {os.path.basename(media_path)} ...")
    t1 = time.time()
    segments, info = model.transcribe(
        media_path,
        language="zh",
        initial_prompt=ZH_PROMPT,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        beam_size=1,              # 實測：5->1 提速 29%
        word_timestamps=True,     # 實測：對速度無影響，留著換「點句子跳播放」
    )

    segs = []
    for s in segments:
        segs.append({
            "id": s.id, "start": round(s.start, 3), "end": round(s.end, 3),
            "text": s.text.strip(),
            "avg_logprob": round(s.avg_logprob, 4),
            "no_speech_prob": round(s.no_speech_prob, 4),
        })
        log(f"  [{s.start:7.2f}-{s.end:7.2f}] {s.text.strip()}")

    elapsed = time.time() - t1
    dur = info.duration
    out = {
        "media": media_path,
        "model": model_name,
        "backend": backend,
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
        "audio_duration_sec": round(dur, 2),
        "transcribe_sec": round(elapsed, 2),
        "realtime_factor": round(dur / elapsed, 2) if elapsed else None,
        "segments": segs,
        "full_text": "".join(s["text"] for s in segs),
    }
    log(f"[3/3] 完成 — 音檔 {dur:.1f}s / 轉錄 {elapsed:.1f}s / 速度 {out['realtime_factor']}x realtime")
    return out


def fmt_srt_ts(sec: float) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")


def write_srt(segs: list, path: str):
    with open(path, "w", encoding="utf-8") as f:
        for i, s in enumerate(segs, 1):
            f.write(f"{i}\n{fmt_srt_ts(s['start'])} --> {fmt_srt_ts(s['end'])}\n{s['text']}\n\n")
