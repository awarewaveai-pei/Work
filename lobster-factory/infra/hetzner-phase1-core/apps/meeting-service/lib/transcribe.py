"""本機離線轉錄（faster-whisper）。音檔絕不外流。

實測數據（同一台筆電，RTX 5060 / Intel CPU）：
  - 2026-08-17 Windows GPU float16：7.0x realtime（BU5.m4a 60 分鐘 → 510s）
  - 2026-08-27 WSL2 CPU int8 large-v3：2.1x realtime（50.4 分鐘 → 1444s）

⚠️ 2026-08-17 曾記錄「CPU int8 0.3x realtime，純 CPU 不可用」，該數字與
08-27 的實測差 7 倍，已證實過度悲觀（實際 50 分鐘會議 24 分鐘跑完，堪用）。
原因未追查，推測是當時未帶 cpu_threads 或量測方式不同。保留兩筆並存而非
刪掉舊值，因為無法確認舊環境不會重現——但決策時請以 2.1x 這筆為準。

**Windows 上本模組可能完全無法載入**：Smart App Control（SAC）會封鎖 `av`
套件未簽章的 .pyd（`ImportError: DLL load failed ... 應用程式控制原則已封鎖`），
且該機 SAC 為完全鎖定狀態無法關閉。解法是改在 WSL2 執行（Linux 不受 SAC 管），
見 README「WSL2 執行」章節。本模組已做跨平台處理，兩邊都能跑。
"""
import os
import sys
import time

ZH_PROMPT = "以下是一場繁體中文會議的錄音，請以臺灣用語的繁體中文輸出逐字稿。"


def register_cuda_dlls():
    """CUDA 執行庫由 pip wheel 提供（nvidia-cublas-cu12 / nvidia-cudnn-cu12），
    但不在預設搜尋路徑上，兩個平台要用不同機制掛上去：

    Windows：wheel 把 DLL 放在 nvidia/*/bin，用 os.add_dll_directory 註冊。
    Linux：wheel 放在 nvidia/*/lib，且 LD_LIBRARY_PATH 由動態連結器在 process
      啟動時就讀完，執行中改 os.environ 沒有用——所以改用 ctypes 直接 preload
      .so 檔，載進 process 後 ctranslate2 dlopen 時就能解析到符號。
      cublas 必須在 cudnn 之前載入（後者相依前者），故先排序再載。
    """
    import glob
    added = []
    roots = _site_roots()

    if sys.platform == "win32":
        for p in roots:
            for d in glob.glob(os.path.join(p, "nvidia", "*", "bin")):
                if os.path.isdir(d):
                    try:
                        os.add_dll_directory(d)
                        added.append(d)
                    except OSError:
                        pass
        # 去重再前置：pick_device() 每個 job 都會呼叫一次，無條件前置會讓 PATH
        # 隨 job 數線性膨脹，長期執行的伺服器會逼近 32,767 字元的環境變數上限。
        cur_path = os.environ.get("PATH", "")
        cur_parts = cur_path.split(os.pathsep)
        new_parts = [d for d in added if d not in cur_parts]
        if new_parts:
            os.environ["PATH"] = os.pathsep.join(new_parts) + os.pathsep + cur_path
        return added

    import ctypes
    sos = []
    for p in roots:
        sos.extend(glob.glob(os.path.join(p, "nvidia", "*", "lib", "*.so*")))
    # cublas 先於 cudnn；其餘維持字典序，確保每次載入順序一致可重現
    sos.sort(key=lambda s: (0 if "cublas" in s else 1, s))
    for so in sos:
        try:
            ctypes.CDLL(so, mode=ctypes.RTLD_GLOBAL)
            added.append(so)
        except OSError:
            pass  # 版本不合或相依缺失的個別 .so 跳過，讓 pick_device 的探針去判定
    return added


def _site_roots():
    """site-packages 根目錄。venv 下 getusersitepackages() 可能拋例外或無意義，
    包起來不讓它中斷整個 CUDA 註冊流程。"""
    import site
    roots = list(getattr(site, "getsitepackages", lambda: [])())
    try:
        roots.append(site.getusersitepackages())
    except Exception:
        pass
    # venv 的 site-packages 不一定在上面兩者裡，用實際載入路徑補一個
    import faster_whisper
    roots.append(os.path.dirname(os.path.dirname(os.path.abspath(faster_whisper.__file__))))
    return [r for r in dict.fromkeys(roots) if r and os.path.isdir(r)]


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


def fmt_vtt_ts(sec: float) -> str:
    """WebVTT timestamp; retain millisecond precision and use a dot separator."""
    return fmt_srt_ts(sec).replace(",", ".")


def write_vtt(segs: list, path: str):
    """Write a deterministic WebVTT rendition without mutating transcript segments."""
    with open(path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, s in enumerate(segs, 1):
            cue_id = str(s.get("id", i)).replace("\r", " ").replace("\n", " ").strip() or str(i)
            f.write(f"{cue_id}\n{fmt_vtt_ts(s['start'])} --> {fmt_vtt_ts(s['end'])}\n{s['text'].strip()}\n\n")
