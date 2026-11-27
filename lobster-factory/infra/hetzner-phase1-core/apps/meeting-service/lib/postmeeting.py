"""聆聽場次（lib/live/archive.py 存的 session.json，經 lib/ownvoice.session_lines 讀）→ 會後整理產物鏈的產物。
只做轉接：產物寫成 pipeline.py 認得的檔，流程本身只有 pipeline.run_pipeline_phase1 一條。"""
import json
import os

from lib.live import langs
from lib.transcribe import joined_text

TRANSCRIPT = "transcript.json"
SPEAKERS = "speakers.json"
# transcript.json 的 times：speech＝句子時間就是發聲位置；arrival＝文字到達的時間（Gemini，配講者前要重新對齊）。
ARRIVAL, SPEECH = "arrival", "speech"
BACKENDS = {"gemini": "聆聽 Gemini", "local": "聆聽 本機"}
# 聆聽時有這麼多秒聲音沒送到辨識（約一兩句話），聆聽逐字稿就有缺口：預設改成重新辨識。
DROPPED_MAX_SEC = 5.0
# 「不翻譯」時會議記錄用的語言（操作者自己的語言；設定裡沒有這一欄）。
OPERATOR_LANG = langs.MINE   # 「我的語言」：不翻譯時會議記錄用它寫


def segments(lines: list) -> list:
    """session.json 的 lines → transcript.json 的 segments。辨識分數聆聽時拿不到，填中性值；
    翻譯另放 tr（會議記錄輸入用括號附上），不進 text（語速與幻覺偵測只看原文）。"""
    out = []
    for line in lines:
        text = str(line.get("text") or "").strip()
        if not text:
            continue
        start = float(line.get("start") or 0.0)
        seg = {"id": len(out), "start": start, "end": max(float(line.get("end") or 0.0), start), "text": text,
               "avg_logprob": 0.0, "no_speech_prob": 0.0}
        tr = str(line.get("tr") or "").strip()
        if tr:
            seg["tr"] = tr
        if line.get("speaker"):
            seg["speaker"] = str(line["speaker"])
        out.append(seg)
    return out


def transcript(sidecar: dict, audio_duration_sec) -> dict:
    """transcript.json 的內容。audio_duration_sec＝ownvoice.join_wavs 的回傳值；沒有錄音（None）＝最後一句的結束。"""
    segs = segments(sidecar.get("lines") or [])
    if audio_duration_sec is None:
        audio_duration_sec = segs[-1]["end"] if segs else 0.0
    stt = sidecar.get("stt")
    return {"media": None, "model": "live", "backend": BACKENDS.get(stt, "聆聽"), "language": str(sidecar.get("listen") or ""),
            "audio_duration_sec": round(float(audio_duration_sec), 2), "transcribe_sec": 0, "realtime_factor": None,
            "times": ARRIVAL if stt == "gemini" else SPEECH, "segments": segs,
            "full_text": joined_text(s["text"] for s in segs)}


def speakers(segs: list):
    """聆聽時就標了講者（C17 聲音來源、C18 即時分群）→ 講者產物；一句都沒標＝None（要分就跑 pyannote）。
    重疊語音只有 pyannote 算得出，不填 0。"""
    total = {}
    for s in segs:
        if s.get("speaker"):
            total[s["speaker"]] = total.get(s["speaker"], 0.0) + s["end"] - s["start"]
    if not total:
        return None
    return {"speakers": sorted(total, key=lambda n: -total[n]), "overlap_sec": None, "source": "聆聽時標的（聲音來源或即時分群）"}


def write_products(job_dir: str, sidecar: dict, audio_duration_sec) -> None:
    """把聆聽帶來的產物寫進 job 資料夾：逐字稿一定有，講者只在聆聽時標過才有。"""
    result = transcript(sidecar, audio_duration_sec)
    write_json(os.path.join(job_dir, TRANSCRIPT), result)
    product = speakers(result["segments"])
    if product is not None:
        write_json(os.path.join(job_dir, SPEAKERS), product)


def write_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def recommend(sidecar, wavs: int) -> dict:
    """預設做法：reuse＝用聆聽的逐字稿（快），否則重新辨識（慢）；reason 寫給操作者看。"""
    if sidecar is None:
        return {"reuse": False, "reason": "這場沒有聆聽逐字稿（舊場次），要從錄音辨識"}
    if not wavs:
        return {"reuse": True, "reason": "這場沒有錄音，只能用聆聽的逐字稿，也不能分講者"}
    dropped = float(sidecar.get("dropped_sec") or 0.0)
    if dropped > DROPPED_MAX_SEC:
        return {"reuse": False, "reason": f"聆聽時有 {dropped:.0f} 秒聲音沒送到辨識（超過 {DROPPED_MAX_SEC:.0f} 秒），逐字稿有缺口"}
    failed = len(sidecar.get("failed_lines") or [])
    if failed:
        return {"reuse": False, "reason": f"聆聽時有 {failed} 句翻譯失敗"}
    return {"reuse": True, "reason": ""}


def transcribe_language(sidecar) -> str:
    """The language the session was listened in, as a lib.transcribe.LANGUAGES key; "" without a sidecar."""
    row = langs.find(str((sidecar or {}).get("listen") or ""))
    return (row.whisper or "auto") if row else ""


def language_name(code: str) -> str:
    """語言代碼（transcribe 的 zh／en、或 BCP-47）→ 提示詞用名；認不得就原樣。"""
    row = langs.find(code) or langs.from_whisper(code)
    return row.prompt if row and row.prompt else code


def minutes_language(target: str) -> str:
    """設定的「翻譯成」→ 會議記錄要寫的語言；不翻譯（或認不得）＝操作者的語言。"""
    row = langs.find(target)
    return (row if row and row.prompt else langs.find(OPERATOR_LANG)).prompt
