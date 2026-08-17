"""講者分離（pyannote）。標籤貼回既有 transcript segments。

需要 HF_TOKEN 環境變數，且帳號需同意三個 gated repo（文件只寫兩個，2026-08-17
實測 pyannote 4.x 額外拉 PLDA 元件，缺一失敗）：
  - https://huggingface.co/pyannote/segmentation-3.0
  - https://huggingface.co/pyannote/speaker-diarization-3.1
  - https://huggingface.co/pyannote/speaker-diarization-community-1

2026-08-17 實測（60 分鐘會議，RTX 5060）：
  - GPU: 24.4x realtime（147s）
  - CPU: 1.03x realtime（58 分鐘）→ 有 GPU 才實用

已知限制：單聲道 + 噪音環境下，whisper 的 VAD 與 pyannote 的語音分割不同調，
約 10% 段落配不到人，須靠時間鄰近推定補標（見 relabel 內註解）。
"""
import os
import time

SR = 16000
MODEL = "pyannote/speaker-diarization-3.1"
NEAR_MAX = 3.0  # 秒；最近鄰補標的最大容忍距離


def spk_name(n: int) -> str:
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(ord("A") + r) + s
    return s


def _load_audio(path: str):
    import av
    import numpy as np
    c = av.open(path)
    rs = av.AudioResampler(format="s16", layout="mono", rate=SR)
    out = []
    for frame in c.decode(audio=0):
        for rf in rs.resample(frame):
            out.append(rf.to_ndarray().reshape(-1))
    for rf in rs.resample(None):
        out.append(rf.to_ndarray().reshape(-1))
    c.close()
    return np.concatenate(out).astype(np.float32) / 32768.0


def _run_pyannote(media_path: str, log=print):
    import torch
    hf = os.environ.get("HF_TOKEN")
    if not hf:
        raise RuntimeError("環境變數 HF_TOKEN 未設定")

    log("[1/4] 載入音檔 ...")
    wav = _load_audio(media_path)
    dur = len(wav) / SR
    log(f"      {dur:.1f}s")

    log(f"[2/4] 載入 pipeline {MODEL} ...")
    t0 = time.time()
    from pyannote.audio import Pipeline
    pipe = Pipeline.from_pretrained(MODEL, token=hf)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    pipe.to(torch.device(dev))
    log(f"      device={dev}  載入 {time.time()-t0:.1f}s")

    log("[3/4] 執行講者分離 ...")
    t1 = time.time()
    ann = pipe({"waveform": torch.from_numpy(wav).unsqueeze(0), "sample_rate": SR})
    el = time.time() - t1
    log(f"      完成 {el:.1f}s  ({dur/el:.2f}x realtime)")

    # pyannote 4.x 回傳 DiarizeOutput（3.x 是 Annotation）。
    # .exclusive_speaker_diarization 已去重疊，是官方建議用於下游轉錄對齊的版本。
    full = getattr(ann, "speaker_diarization", ann)
    excl = getattr(ann, "exclusive_speaker_diarization", full)
    spans_full = [(s.start, s.end, l) for s, _, l in full.itertracks(yield_label=True)]
    spans_excl = [(s.start, s.end, l) for s, _, l in excl.itertracks(yield_label=True)]

    tot = {}
    for a, b, l in spans_excl:
        tot[l] = tot.get(l, 0.0) + (b - a)
    order = sorted(tot, key=lambda l: -tot[l])
    name = {l: spk_name(i) for i, l in enumerate(order)}

    speech = sum(tot.values()) or 1.0
    log(f"\n      偵測到 {len(order)} 位講者 / {len(spans_excl)} 個語音區段")
    for l in order:
        log(f"        {name[l]}: {tot[l]:7.1f}s ({tot[l]/speech*100:5.1f}%)")

    ev = []
    for a, b, _ in spans_full:
        ev.append((a, 1)); ev.append((b, -1))
    ev.sort()
    cur = ov = 0.0
    last = None
    for t, delta in ev:
        if cur >= 2 and last is not None:
            ov += t - last
        cur += delta
        last = t
    log(f"      重疊語音 {ov:.1f}s ({ov/dur*100:.1f}% of audio)")

    return {
        "exclusive": [[a, b, name[l]] for a, b, l in spans_excl],
        "full": [[a, b, name[l]] for a, b, l in spans_full],
        "overlap_sec": round(ov, 1),
        "speakers": [name[l] for l in order],
    }


def diarize(media_path: str, segments: list, spans_cache_path: str = None, log=print) -> dict:
    """執行（或載入快取的）講者分離，並把標籤貼回 segments。

    回傳 {"speakers": [...], "overlap_sec": float, "turns": [...]}。
    segments 會被原地加上 "speaker" / "speaker_inferred" 欄位。
    """
    spans = None
    if spans_cache_path and os.path.exists(spans_cache_path):
        import json
        spans = json.load(open(spans_cache_path, encoding="utf-8"))
        log(f"[1-3/4] 從快取載入 spans（excl {len(spans['exclusive'])} / full {len(spans['full'])}）")

    if spans is None:
        spans = _run_pyannote(media_path, log)
        if spans_cache_path:
            import json
            json.dump(spans, open(spans_cache_path, "w", encoding="utf-8"))

    return _relabel(segments, spans, log)


def _match(seg, pool):
    best, bl = 0.0, None
    for a, b, l in pool:
        o = min(seg["end"], b) - max(seg["start"], a)
        if o > best:
            best, bl = o, l
    return bl


def _nearest(seg, pool):
    """whisper VAD 與 pyannote 分割不同調，部分已轉出文字的片段落在
    pyannote 判定的非語音區。用時間上最接近的語音區段補標，標記為推定。"""
    best, bl = NEAR_MAX, None
    for a, b, l in pool:
        gap = a - seg["end"] if a > seg["end"] else (seg["start"] - b if b < seg["start"] else 0)
        if gap < best:
            best, bl = gap, l
    return bl


def _relabel(segments: list, spans: dict, log=print) -> dict:
    log("[4/4] 貼標籤回 segments ...")
    excl, full = spans["exclusive"], spans["full"]

    n_excl = n_full = n_near = n_unk = 0
    for s in segments:
        s.pop("speaker_inferred", None)
        bl = _match(s, excl)
        if bl:
            n_excl += 1
        elif (bl := _match(s, full)):
            n_full += 1
            s["speaker_inferred"] = "overlap"
        elif (bl := _nearest(s, full)):
            n_near += 1
            s["speaker_inferred"] = "proximity"
        else:
            n_unk += 1
        s["speaker"] = bl or "?"
    log(f"      標籤來源：直接 {n_excl} / 重疊回退 {n_full} / 鄰近推定 {n_near} / 無法判定 {n_unk}")

    turns = []
    for s in segments:
        if turns and turns[-1]["speaker"] == s["speaker"] and s["start"] - turns[-1]["end"] < 2.0:
            turns[-1]["text"] += s["text"]
            turns[-1]["end"] = s["end"]
        else:
            turns.append({"speaker": s["speaker"], "start": s["start"],
                          "end": s["end"], "text": s["text"]})

    short = sum(1 for t in turns if t["end"] - t["start"] < 1.5)
    log(f"      {len(turns)} 輪次 / 極短(<1.5s) {short} ({short/max(len(turns),1)*100:.1f}%)")

    return {"speakers": spans["speakers"], "overlap_sec": spans["overlap_sec"], "turns": turns}
