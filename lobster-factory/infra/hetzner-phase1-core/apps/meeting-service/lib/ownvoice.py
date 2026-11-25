"""OwnVoice Meet 會議資料夾的唯一讀取點。只讀不寫。

格式來源：OwnVoice Meet 0.2.3 `src-tauri/src/archive.rs`：
  <base>/<YYYY-MM-DD HHMM[-N]>/NN-<段落>.wav · transcript.md · summary.md
transcript.md／summary.md 在會議中每幾秒整份重寫（原子 rename），可以邊開會邊讀。
OwnVoice 改格式時只改這一檔。
"""
import json
import os
import re
import time
import wave

APP_ID = "io.github.zaious.ownvoice-meet"
TEXT_FILES = ("transcript.md", "summary.md")
# 錄音中，OwnVoice 每 5 秒才把資料長度回填進檔頭（recorder.rs HEADER_EVERY）：
# 檔案比檔頭宣告的多出一截、或剛剛才被寫過，都代表還在錄。
WAV_HEADER_SLACK_BYTES = 4096
RECORDING_QUIET_SEC = 10
_SESSION = re.compile(r"^\d{4}-\d{2}-\d{2} \d{4}(-\d+)?$")


def _settings() -> dict:
    path = os.path.join(os.environ.get("APPDATA", ""), APP_ID, "settings.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _documents() -> str:
    # 「文件」可能被 OneDrive 轉向，問 Windows 才準；非 Windows 退回家目錄。
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf)  # CSIDL_PERSONAL
        if buf.value:
            return buf.value
    except (AttributeError, OSError):
        pass
    return os.path.join(os.path.expanduser("~"), "Documents")


def base_dir() -> str:
    """與 archive.rs base_dir() 同序；OWNVOICE_SESSIONS_DIR 只給測試指到暫存資料夾。"""
    override = os.environ.get("OWNVOICE_SESSIONS_DIR", "").strip()
    if override:
        return override
    custom = str(_settings().get("archive_dir", "")).strip()
    return custom or os.path.join(_documents(), "OwnVoice Meet")


def language() -> str:
    """OwnVoice 設定的會議語言 -> lib.transcribe.LANGUAGES 的鍵。"""
    code = str(_settings().get("stt_language", "")).lower()
    return "en" if code.startswith("en") else "zh" if code.startswith("zh") else "auto"


def sessions() -> list:
    """新到舊。wavs=0 代表 OwnVoice 當時只存逐字稿（存檔模式不是「錄音」），不能做會後整理。"""
    base = base_dir()
    try:
        names = sorted((n for n in os.listdir(base) if _SESSION.match(n)), reverse=True)
    except OSError:
        return []
    out = []
    for name in names:
        files = os.listdir(os.path.join(base, name))
        out.append({"id": name,
                    "wavs": sum(f.lower().endswith(".wav") for f in files),
                    "transcript": "transcript.md" in files,
                    "summary": "summary.md" in files})
    return out


def session_dir(session_id: str) -> str:
    """"latest" = 最新一場。名稱必須符合 OwnVoice 的資料夾格式，順便擋掉路徑穿越。"""
    if session_id == "latest":
        found = sessions()
        if not found:
            raise KeyError("還沒有 OwnVoice 會議資料夾" if os.name == "nt" else
                           "OwnVoice 整合只在 Windows 原生模式可用（伺服器現在不是跑在 Windows 上，讀不到它的資料夾）")
        session_id = found[0]["id"]
    path = os.path.join(base_dir(), session_id)
    if not _SESSION.match(session_id) or not os.path.isdir(path):
        raise KeyError(f"找不到 OwnVoice 會議：{session_id}")
    return path


def read_text(session_id: str, name: str) -> str:
    """transcript.md 或 summary.md；還沒產生時回空字串。"""
    if name not in TEXT_FILES:
        raise ValueError(name)
    try:
        with open(os.path.join(session_dir(session_id), name), encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return ""


def live_transcript(max_age_sec: int = 1800) -> str:
    """最新一場的 transcript.md，但只在它最近被寫過時才回傳：
    問 AI 會把這段送出去，不能把更早另一場會議的內容當成「現在這場」。"""
    try:
        path = os.path.join(session_dir("latest"), "transcript.md")
        if time.time() - os.path.getmtime(path) > max_age_sec:
            return ""
        # 錄音中這個檔每幾秒重寫一次；讀到寫一半的中文字不該讓呼叫端整個失敗。
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except (KeyError, OSError):
        return ""


def _raw_pcm(path: str, frame_bytes: int) -> bytes:
    """沒收尾的檔（程式被殺）：檔頭的長度是舊的，資料都在。照檔案大小從 44 位元組檔頭後讀到檔尾，尾端不足一個取樣的捨去。"""
    with open(path, "rb") as f:
        head = f.read(44)
        if len(head) < 44 or head[36:40] != b"data":
            raise ValueError(f"{os.path.basename(path)} 沒有收尾，而且檔頭不是標準格式，無法接合")
        data = f.read()
    return data[: len(data) // frame_bytes * frame_bytes]


def join_wavs(session_id: str, out_path: str) -> float:
    """把各段錄音依序接成一個 WAV，回傳秒數。還在錄音（10 秒內被寫過）就拒絕。
    檔案已經安靜夠久但檔頭少記長度＝沒有人在錄、只是沒收尾，照實際大小讀；不改寫原檔。"""
    folder = session_dir(session_id)
    parts = sorted(f for f in os.listdir(folder) if f.lower().endswith(".wav"))
    if not parts:
        raise ValueError("這場會議沒有錄音檔（OwnVoice 存檔模式要選「錄音與逐字稿」）")
    fmt = None
    frames = 0
    with wave.open(out_path, "wb") as out:
        for name in parts:
            path = os.path.join(folder, name)
            with wave.open(path, "rb") as src:
                this = (src.getnchannels(), src.getsampwidth(), src.getframerate())
                if time.time() - os.path.getmtime(path) < RECORDING_QUIET_SEC:
                    raise ValueError("這場會議還在錄音：先在 OwnVoice 按停止，再做會後整理")
                frame_bytes = this[0] * this[1]
                unfinished = os.path.getsize(path) - src.getnframes() * frame_bytes > WAV_HEADER_SLACK_BYTES
                if fmt is None:
                    fmt = this
                    out.setnchannels(this[0])
                    out.setsampwidth(this[1])
                    out.setframerate(this[2])
                elif this != fmt:
                    raise ValueError(f"{name} 的音訊格式 {this} 與前面的 {fmt} 不同，無法接合")
                if unfinished:
                    pcm = _raw_pcm(path, frame_bytes)
                    out.writeframes(pcm)
                    frames += len(pcm) // frame_bytes
                    continue
                while chunk := src.readframes(1 << 16):
                    out.writeframes(chunk)
                frames += src.getnframes()
    return frames / fmt[2]
