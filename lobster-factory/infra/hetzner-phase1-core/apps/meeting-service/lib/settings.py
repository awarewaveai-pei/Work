"""本機設定檔（MS/.settings.json）：金鑰與兩個頁面的偏好，唯一的讀寫點。

金鑰存檔案而非只靠環境變數：客戶不會、也不該被要求去設定 Windows 系統環境變數，
網頁填、網頁存。金鑰只在伺服器端，對外只回遮罩。存檔路徑在 .gitignore 排除。
檔案裡不認得的鍵原樣保留（撤回到舊版、或新版加的欄位，彼此都讀得下去）。
"""
import contextlib
import json
import logging
import math
import os
import re
import tempfile
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_PATH = os.path.join(os.path.dirname(HERE), ".settings.json")

# 金鑰欄位 → 設定檔沒值時改用的環境變數（優先序只有一條：設定檔有值用設定檔，否則環境變數）。
# Anthropic 沒有環境變數備援（今天就沒有）：系統裡常留著給 Claude CLI 用、可能已過期的
# ANTHROPIC_API_KEY，拿它當備援會讓翻譯失敗，而不是改走 Gemini。
KEYS = {
    "anthropic_api_key": None,
    "gemini_api_key": "GEMINI_API_KEY",
    "hf_token": "HF_TOKEN",
    "serper_api_key": "SERPER_API_KEY",
}
KEY_MAX = 512
LANG_RE = re.compile(r"[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}")


def _number(lo, hi, integer=False):
    def check(v):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError("要是數字")
        if integer and v != int(v):
            raise ValueError("要是整數")
        if not lo <= v <= hi:
            raise ValueError(f"要在 {lo} 到 {hi} 之間")
        return int(v) if integer else v
    return check


def _choice(*options):
    def check(v):
        if v not in options:
            raise ValueError("只能是 " + "、".join(options))
        return v
    return check


def _flag(v):
    if not isinstance(v, bool):
        raise ValueError("要是 true 或 false")
    return v


def _lang(v):
    if not isinstance(v, str) or len(v) > 16 or not LANG_RE.fullmatch(v):
        raise ValueError("要是語言代碼，例如 en-US")
    return v


# 偏好欄位 → (預設值, 驗證)。預設值＝今天頁面的行為。
PREFS = {
    "listen": ("en-US", _lang),
    "target": ("zh-TW", _lang),
    "stt": ("gemini", _choice("gemini", "local")),
    "pause_min": (3, _number(0, 120)),
    "end_min": (30, _number(0, 600)),
    "caption_size": (18, _number(12, 40, integer=True)),
    "reply_size": (28, _number(14, 72, integer=True)),
    "summary": (False, _flag),
    "summary_min": (5, _number(1, 60, integer=True)),
    "save": (True, _flag),
}

LABELS = {
    "anthropic_api_key": "Anthropic 金鑰", "gemini_api_key": "Gemini 金鑰", "hf_token": "Hugging Face 金鑰",
    "serper_api_key": "Serper 搜尋金鑰", "listen": "聽的語言", "target": "翻譯成", "stt": "辨識方式",
    "pause_min": "安靜幾分鐘暫停", "end_min": "安靜幾分鐘結束", "caption_size": "字幕字級", "reply_size": "回覆字級",
    "summary": "會議中摘要", "summary_min": "摘要間隔", "save": "存檔",
}


# update() 的「讀、改、寫」整段持鎖：幾個面板同時 PUT（第一次載入搬舊資料時就是）不能互相蓋掉。
_WRITE_LOCK = threading.Lock()
# Windows 上檔案被另一個執行緒開著讀時 os.replace／open 會短暫 PermissionError，重試幾次。
RETRIES, RETRY_SEC = 20, 0.025


def _retry(fn):
    for _ in range(RETRIES - 1):
        try:
            return fn()
        except FileNotFoundError:
            raise
        except PermissionError:
            time.sleep(RETRY_SEC)
    return fn()


def _read() -> dict:
    """設定檔內容；沒有檔案＝{}。讀不到或壞掉時丟例外（寫入端不能把它當空檔再寫回去，會清掉金鑰）。"""
    def once():
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            return json.load(f)
    try:
        data = _retry(once)
    except FileNotFoundError:
        return {}
    if not isinstance(data, dict):
        raise ValueError("設定檔不是 JSON 物件")
    return data


def _load() -> dict:
    """讀取端用：讀不到就當沒有設定（這一次用預設值與環境變數），不影響檔案。"""
    try:
        return _read()
    except (OSError, ValueError):
        return {}


def _save(data: dict):
    # 唯一暫存檔名＋os.replace 原子寫入：別的請求只會讀到整份舊檔或整份新檔。
    fd, tmp_path = tempfile.mkstemp(prefix=os.path.basename(SETTINGS_PATH) + ".tmp", dir=os.path.dirname(SETTINGS_PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())   # a power cut right after the replace must not leave an empty file
        _retry(lambda: os.replace(tmp_path, SETTINGS_PATH))
    except BaseException:
        with contextlib.suppress(OSError):
            os.remove(tmp_path)
        raise


def _stored_key(data: dict, name: str) -> str:
    v = data.get(name)
    return v.strip() if isinstance(v, str) else ""


def key(name: str) -> str:
    """金鑰的唯一讀法。每次呼叫都重讀檔案：面板剛存的值下一次就用得到。"""
    value = _stored_key(_load(), name)
    env = KEYS[name]
    return value or (os.environ.get(env, "").strip() if env else "")


def get_api_key() -> str:
    return key("anthropic_api_key")


def has_api_key() -> bool:
    return bool(get_api_key())


def pref(name: str, data=None):
    """偏好值；檔案裡的值壞了（手改、舊版）就用預設。`data`：已讀出的設定檔（同一次回應的各欄出自同一版）。"""
    default, check = PREFS[name]
    data = _load() if data is None else data
    if name not in data:
        return default
    try:
        return check(data[name])
    except ValueError:
        return default


def _mask(value: str) -> str:
    # Only enough to tell two keys apart: the last 4 characters of a long key, nothing of a short one.
    return "..." + value[-4:] if len(value) >= 20 else "***"


def public() -> dict:
    """給頁面的樣子：偏好照值，金鑰只有遮罩與來源（settings／env／""），絕不回明文。"""
    data = _load()
    out = {name: pref(name, data) for name in PREFS}
    out["stored"] = sorted(name for name in PREFS if name in data)   # the page's one-time migration skips these
    for name, env in KEYS.items():
        stored = _stored_key(data, name)
        from_env = "" if stored or not env else os.environ.get(env, "").strip()
        value = stored or from_env
        out[name] = {"set": bool(value), "masked": _mask(value) if value else "",
                     "source": "settings" if stored else ("env" if from_env else "")}
    return out


def update(patch) -> dict:
    """部分更新。整包先驗完才寫，一欄不對就整包不寫（ValueError 的訊息給頁面看）。
    金鑰給空字串＝從設定檔拿掉（有環境變數就回頭用環境變數）。"""
    if not isinstance(patch, dict):
        raise ValueError("設定要是 JSON 物件")
    clean = {}
    for name, value in patch.items():
        if name in KEYS:
            if not isinstance(value, str):
                raise ValueError(f"{LABELS[name]}要是文字")
            value = value.strip()
            if len(value) > KEY_MAX:
                raise ValueError(f"{LABELS[name]}太長（上限 {KEY_MAX} 字元）")
            if any(not 33 <= ord(c) <= 126 for c in value):
                raise ValueError(f"{LABELS[name]}只能有英數字與符號，不能有空白")
        elif name in PREFS:
            try:
                value = PREFS[name][1](value)
            except ValueError as e:
                raise ValueError(f"{LABELS[name]}{e}") from None
        else:
            raise ValueError(f"不認得的設定：{str(name)[:40]}")
        clean[name] = value
    if clean:
        with _WRITE_LOCK:
            try:
                data = _read()
            except ValueError:
                # Broken JSON (a hand edit) never heals by itself: keep it aside for recovery and start over.
                bad = f"{SETTINGS_PATH}.bad-{time.strftime('%Y%m%d-%H%M%S')}"
                os.replace(SETTINGS_PATH, bad)
                logging.getLogger(__name__).warning("settings file unreadable, moved to %s", os.path.basename(bad))
                data = {}
            except OSError as e:
                raise OSError(f"設定檔讀不到，這次沒有存（{type(e).__name__}）") from None
            for name, value in clean.items():
                if name in KEYS and not value:
                    data.pop(name, None)
                else:
                    data[name] = value
            _save(data)
    return public()
