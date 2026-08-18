r"""選擇性同步輸出到 Google Drive（ECT/會議記錄/<日期>/）。

刻意違反「音檔絕不外流」的本機限定原則——操作者 2026-08-18 明確要求，
且明確選擇「依上傳時勾選，每次自己決定」而非全部自動同步。這是唯一
呼叫本模組的路徑：per-job opt-in，不是全域預設。

只複製最終交付物（PPT/會議記錄/教練稿/逐字稿），不複製 input.m4a 原始
音檔、transcript.json 完整結構、diarize_spans.json 等中間產物——音檔本身
比逐字稿更敏感（含聲紋），不該進雲端。

路徑寫死 H:\我的雲端硬碟\ECT\會議記錄（2026-08-18 從實際掛載點確認：
操作者有兩個 Google 帳號同時掛載，G: 跟 H:，ECT 這個共用資料夾在 H:
帳號底下，不在預設的 G: 我的雲端硬碟）。若掛載點改變會直接找不到路徑
而丟出清楚的錯誤，不會靜默寫錯地方。
"""
import datetime
import os
import re
import shutil

DRIVE_BASE = r"H:\我的雲端硬碟\ECT\會議記錄"

_INVALID_FS_CHARS = re.compile(r'[\\/:*?"<>|]')


def _safe_name(s: str, fallback: str) -> str:
    s = (s or "").strip()
    s = _INVALID_FS_CHARS.sub("_", s)
    return s or fallback


def sync_to_drive(job_dir: str, minutes: dict, job_id: str) -> dict:
    """回傳 {"ok": bool, "dest": str, "files": [...], "error": str|None}。
    不丟例外給呼叫端——同步失敗不該讓整個 job 判定為失敗（PPT 等本地產出
    已經成功了），只回報同步本身的狀態。"""
    if not os.path.isdir(DRIVE_BASE):
        return {"ok": False, "dest": None, "files": [],
                "error": f"找不到 Google Drive 路徑 {DRIVE_BASE}；"
                         f"檢查掛載是否還在（可能是 H: 代號變了，或該帳號登出了）"}

    date_folder = datetime.datetime.now().strftime("%Y%m%d")
    dest_dir = os.path.join(DRIVE_BASE, date_folder)
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except OSError as e:
        return {"ok": False, "dest": None, "files": [], "error": f"建立日期資料夾失敗: {e}"}

    title = _safe_name(minutes.get("title"), job_id)
    copied = []
    plan = [
        ("slides.pptx", f"{title}_會議記錄.pptx"),
        ("meeting_notes.md", f"{title}_會議記錄.md"),
        ("coach.md", f"{title}_報告教練.md"),
        ("diarized.txt", f"{title}_逐字稿.txt"),
        ("merged.txt", f"{title}_逐字稿.txt"),  # 沒做講者分離時的備援來源
    ]
    seen_targets = set()
    for src_name, dst_name in plan:
        if dst_name in seen_targets:
            continue  # diarized.txt 優先，merged.txt 只在前者不存在時補位
        src = os.path.join(job_dir, src_name)
        if not os.path.exists(src):
            continue
        dst = os.path.join(dest_dir, dst_name)
        try:
            shutil.copy2(src, dst)
            copied.append(dst_name)
            seen_targets.add(dst_name)
        except OSError as e:
            return {"ok": False, "dest": dest_dir, "files": copied,
                    "error": f"複製 {src_name} 失敗: {e}"}

    return {"ok": True, "dest": dest_dir, "files": copied, "error": None}
