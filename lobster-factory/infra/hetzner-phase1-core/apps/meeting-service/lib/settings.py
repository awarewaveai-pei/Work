"""本機設定檔管理——目前只存 Anthropic API key。

刻意不寫死在程式碼、不進環境變數：這支服務要給客戶用，每個客戶要能填自己
的 key，不該跟操作者共用、也不該混進程式碼。存檔案而非環境變數是因為
客戶不會、也不該被要求去設定 Windows 系統環境變數——網頁填、網頁存，
是唯一對非技術使用者合理的介面。

存檔路徑刻意在 .gitignore 排除，絕不進版本控制。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS_PATH = os.path.join(os.path.dirname(HERE), ".settings.json")


def _load() -> dict:
    if not os.path.exists(SETTINGS_PATH):
        return {}
    try:
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _save(data: dict):
    # tmp+os.replace 原子寫入，理由同 pipeline.py write_status()：避免
    # /api/settings 存檔的瞬間，剛好被另一個請求的 _load() 讀到寫一半的檔案。
    # 上傳當下的 key 快照（app.py）仍可能讀到「存檔前」的舊值——這是請求
    # 排序的問題，不是檔案損毀，本檔案原子化解決的是後者，不試圖處理前者
    # （單一使用者的本機工具，UI 上兩個按鈕手動連續點擊才會踩到，不值得為此
    # 加分散式鎖）。
    tmp_path = f"{SETTINGS_PATH}.tmp{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, SETTINGS_PATH)


def get_api_key() -> str:
    return _load().get("anthropic_api_key", "")


def set_api_key(key: str):
    data = _load()
    data["anthropic_api_key"] = key.strip()
    _save(data)


def has_api_key() -> bool:
    return bool(get_api_key())


def masked_api_key() -> str:
    """回傳給前端顯示用的遮罩版本，絕不回傳明文 key。"""
    key = get_api_key()
    if not key:
        return ""
    if len(key) <= 12:
        return "*" * len(key)
    return key[:8] + "..." + key[-4:]
