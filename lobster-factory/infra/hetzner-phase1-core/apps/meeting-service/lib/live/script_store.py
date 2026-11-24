"""The meeting script and the glossary, kept between runs in MS/.live-script.json (.gitignore'd).
load() never fails: a missing or damaged file is an empty script. save() writes atomically."""
import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(os.path.dirname(os.path.dirname(HERE)), ".live-script.json")
MAX_BYTES = 200 * 1024


def load() -> dict:
    try:
        with open(PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = None
    data = data if isinstance(data, dict) else {}
    return {k: data[k] if isinstance(data.get(k), str) else "" for k in ("script", "glossary")}


def check(name: str, value: str) -> None:
    if not isinstance(value, str):
        raise ValueError(f"{name}必須是文字")
    if len(value.encode("utf-8")) > MAX_BYTES:
        raise ValueError(f"{name}超過 {MAX_BYTES // 1024} KB 上限")


def _set_aside_if_corrupt() -> None:
    """A file that exists but cannot be read would be silently replaced by the next save: keep it
    under another name first, so a damaged script can still be recovered by hand."""
    try:
        with open(PATH, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return
    except (OSError, ValueError):
        data = None
    if not isinstance(data, dict):
        os.replace(PATH, f"{PATH}.corrupt-{time.strftime('%Y%m%d-%H%M%S')}")


def save(script=None, glossary=None) -> dict:
    """Store the given fields, leave the other as it is; returns what is stored now."""
    if script is not None:
        check("講稿", script)
    if glossary is not None:
        check("詞彙表", glossary)
    _set_aside_if_corrupt()
    data = load()
    if script is not None:
        data["script"] = script
    if glossary is not None:
        data["glossary"] = glossary
    # tmp+os.replace 原子寫入，理由同 settings.py _save()
    tmp_path = f"{PATH}.tmp{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp_path, PATH)
    return data
