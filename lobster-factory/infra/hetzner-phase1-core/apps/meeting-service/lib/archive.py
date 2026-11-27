r"""會後整理的產出複製到輸出目的地（設定面板的「輸出目的地」，每個 <目的地>/<日期>/）。

刻意違反「音檔絕不外流」的本機限定原則——操作者 2026-08-18 明確要求，
且明確選擇「每次自己決定」而非全部自動同步：每個工作開始時選要同步去哪幾個目的地
（預設勾「預設同步」的那幾個），pipeline 在工作開始時把清單存進 status.json。

只複製最終交付物（PPT/會議記錄/教練稿/逐字稿），不複製 input.m4a 原始
音檔、transcript.json 完整結構、diarize_spans.json 等中間產物——音檔本身
比逐字稿更敏感（含聲紋），不該進雲端（錄音資料夾也因此不准設在雲端同步資料夾，lib/paths.refuse_cloud）。

路徑存在設定檔（不寫死在程式碼：這支檔案可能被複製到別人的電腦，寫死路徑等於把
操作者的客戶名稱跟帳號資訊帶過去）。舊的環境變數 MEETING_DRIVE_BASE 第一次讀設定時
轉成一個目的地（lib/settings._import_drive_env）。
"""
import datetime
import os
import re
import shutil

from lib import paths

_INVALID_FS_CHARS = re.compile(r'[\\/:*?"<>|]')


def _safe_name(s: str, fallback: str) -> str:
    s = (s or "").strip()
    s = _INVALID_FS_CHARS.sub("_", s)
    return s or fallback


def sync_to(dest: dict, job_dir: str, minutes: dict, job_id: str) -> dict:
    """複製到一個目的地 dest={name, dir}（dir＝存檔寫法）。回傳 {"name", "ok", "dest", "files": [...],
    "failed": [{"file", "error"}], "error"}。一個檔失敗照樣複製其餘的。
    不丟例外給呼叫端——同步失敗不該讓整個 job 判定為失敗（PPT 等本地產出已經成功了）。"""
    out = {"name": dest.get("name", ""), "ok": False, "dest": None, "files": [], "failed": [], "error": None}
    try:
        base = paths.local(dest.get("dir", ""))
    except paths.PathError as e:
        return {**out, "error": str(e)}
    if not os.path.isdir(base):
        return {**out, "error": f"找不到資料夾 {dest.get('dir')}；檢查磁碟是否還在（雲端硬碟可能換了代號，或帳號登出了）"}

    dest_dir = os.path.join(base, datetime.datetime.now().strftime("%Y%m%d"))
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except OSError as e:
        return {**out, "error": f"建立日期資料夾失敗: {e}"}
    out["dest"] = dest_dir

    title = _safe_name(minutes.get("title"), job_id)
    # 新增產出格式時這份清單要一起改——2026-08-27 加 Word 輸出時漏掉這裡，
    # 同步結果少一個檔案且不會報錯（下面 os.path.exists 不存在就靜默跳過），
    # 是這個設計的已知代價：容忍缺檔換取「某個階段沒跑到也不會炸」。
    plan = [
        ("meeting_record.docx", f"{title}_會議記錄.docx"),
        ("slides.pptx", f"{title}_會議記錄.pptx"),
        ("meeting_record.xlsx", f"{title}_會議記錄.xlsx"),
        ("coach.docx", f"{title}_報告教練.docx"),
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
        seen_targets.add(dst_name)
        dst = os.path.join(dest_dir, dst_name)
        try:
            # 刻意不用 shutil.copy2：它等於 copyfile + copystat，而 WSL2 透過
            # drvfs 掛載的 Google Drive 虛擬檔案系統不支援設定 metadata，
            # copystat 會丟 [Errno 1] Operation not permitted —— 檔案內容其實
            # 已經複製完成，卻整批被判定失敗（2026-08-27 實測）。
            # 拆開處理：內容複製失敗才是真失敗；metadata 保留是 best-effort。
            shutil.copyfile(src, dst)
            try:
                shutil.copystat(src, dst)
            except OSError:
                pass  # drvfs / 網路磁碟不支援，不影響檔案內容正確性
            out["files"].append(dst_name)
        except OSError as e:
            out["failed"].append({"file": dst_name, "error": f"{type(e).__name__}: {e.strerror or e}"})
    out["ok"] = not out["failed"]
    if out["failed"]:
        out["error"] = f"{len(out['failed'])} 個檔案複製失敗"
    return out
