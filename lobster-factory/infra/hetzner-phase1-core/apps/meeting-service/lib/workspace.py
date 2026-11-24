"""會議工作區的版面存檔（dockview 的 toJSON 結果，內容對本模組不透明）。

存 MS/.workspace.json，.gitignore 排除。load() 讀不到或壞掉回 None，
由頁面改用預設版面並覆寫。
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_PATH = os.path.join(os.path.dirname(HERE), ".workspace.json")
MAX_BYTES = 64 * 1024


def load() -> "dict | None":
    try:
        with open(WORKSPACE_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def save(layout: dict) -> None:
    if not isinstance(layout, dict):
        raise ValueError("版面必須是 JSON 物件")
    text = json.dumps(layout, ensure_ascii=False)
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValueError(f"版面超過 {MAX_BYTES // 1024} KB 上限")
    # tmp+os.replace 原子寫入，理由同 settings.py _save()
    tmp_path = f"{WORKSPACE_PATH}.tmp{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp_path, WORKSPACE_PATH)
