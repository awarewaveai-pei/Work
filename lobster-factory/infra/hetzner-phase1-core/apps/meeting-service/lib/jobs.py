"""jobs/ 底下的會後整理工作：清單，以及場次與工作的對應 jobs/sessions.json（{場次資料夾路徑: [job_id…]}）。
場次資料夾只讀（OwnVoice app 的資料夾不能寫），對應關係只存在這裡；重跑＝新 job。"""
import json
import os
import threading

from lib.live.archive import write_atomic

INDEX = "sessions.json"
_lock = threading.Lock()


def _read_json(path: str):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def session_index(jobs_dir: str) -> dict:
    data = _read_json(os.path.join(jobs_dir, INDEX))
    return data if isinstance(data, dict) else {}


def link(jobs_dir: str, session_path: str, job_id: str) -> None:
    with _lock:
        index = session_index(jobs_dir)
        index.setdefault(session_path, []).append(job_id)
        write_atomic(os.path.join(jobs_dir, INDEX), json.dumps(index, ensure_ascii=False, indent=1))


def listing(jobs_dir: str, downloads: dict) -> list:
    """每個有 status.json 的工作，新到舊：id、階段、來源、哪些檔可以下載（downloads＝{種類: (檔名, …)}）。"""
    out = []
    try:
        names = os.listdir(jobs_dir)
    except OSError:
        return []
    for name in names:
        folder = os.path.join(jobs_dir, name)
        status = _read_json(os.path.join(folder, "status.json"))
        if not isinstance(status, dict):
            continue
        out.append({"id": name, "stage": status.get("stage"), "done": bool(status.get("done")), "error": status.get("error"),
                    "kind": status.get("kind", "meeting"), "source": status.get("source"), "steps": status.get("steps", {}),
                    "started_at": status.get("started_at") or os.path.getmtime(folder),
                    "downloads": [k for k, (f, *_) in downloads.items() if os.path.exists(os.path.join(folder, f))]})
    out.sort(key=lambda j: -j["started_at"])
    return out
