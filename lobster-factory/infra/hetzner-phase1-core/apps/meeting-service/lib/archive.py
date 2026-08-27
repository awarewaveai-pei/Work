r"""選擇性同步輸出到 Google Drive（ECT/會議記錄/<日期>/）。

刻意違反「音檔絕不外流」的本機限定原則——操作者 2026-08-18 明確要求，
且明確選擇「依上傳時勾選，每次自己決定」而非全部自動同步。這是唯一
呼叫本模組的路徑：per-job opt-in，不是全域預設。

只複製最終交付物（PPT/會議記錄/教練稿/逐字稿），不複製 input.m4a 原始
音檔、transcript.json 完整結構、diarize_spans.json 等中間產物——音檔本身
比逐字稿更敏感（含聲紋），不該進雲端。

路徑走環境變數 MEETING_DRIVE_BASE，不寫死在程式碼裡——這支檔案可能被複製
到別人的電腦（例如給家人自己裝一份），寫死路徑等於把操作者的客戶名稱
（資料夾名 ECT）跟帳號資訊帶去別人的機器。未設定環境變數時功能直接停用
（回報清楚原因），不會用錯誤的預設值意外寫到不相干的地方。

操作者本機設定（2026-08-18 從實際掛載點確認：操作者有兩個 Google 帳號
同時掛載，G: 跟 H:，ECT 這個共用資料夾在 H: 帳號底下）：
    setx MEETING_DRIVE_BASE "H:\我的雲端硬碟\ECT\會議記錄"
"""
import datetime
import os
import re
import shutil
import sys

DRIVE_BASE = os.environ.get("MEETING_DRIVE_BASE")

_INVALID_FS_CHARS = re.compile(r'[\\/:*?"<>|]')


def _is_wsl() -> bool:
    """WSL 判定：核心版本字串含 microsoft（微軟官方建議的偵測方式）。"""
    if sys.platform != "linux":
        return False
    try:
        with open("/proc/version", encoding="utf-8", errors="replace") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def _safe_name(s: str, fallback: str) -> str:
    s = (s or "").strip()
    s = _INVALID_FS_CHARS.sub("_", s)
    return s or fallback


def sync_to_drive(job_dir: str, minutes: dict, job_id: str) -> dict:
    """回傳 {"ok": bool, "dest": str, "files": [...], "error": str|None}。
    不丟例外給呼叫端——同步失敗不該讓整個 job 判定為失敗（PPT 等本地產出
    已經成功了），只回報同步本身的狀態。"""
    if not DRIVE_BASE:
        return {"ok": False, "dest": None, "files": [],
                "error": "未設定環境變數 MEETING_DRIVE_BASE，Google Drive 同步功能未啟用"}
    if not os.path.isdir(DRIVE_BASE):
        # WSL2 情境要給不同的指路：Google Drive 這類虛擬磁碟不會被 WSL2 自動
        # automount（只有實體磁碟會），所以 /mnt/h 天生不存在，跟「磁碟代號變了
        # 或帳號登出」完全無關。給錯的原因會讓人往錯的方向查（2026-08-27 critic
        # 指出：服務搬進 WSL2 後這個功能實際上已完全失效）。
        if DRIVE_BASE.startswith("/mnt/") and _is_wsl():
            drive_letter = DRIVE_BASE.split("/")[2] if len(DRIVE_BASE.split("/")) > 2 else "?"
            return {"ok": False, "dest": None, "files": [],
                    "error": f"WSL2 內找不到 {DRIVE_BASE}。Google Drive 這類虛擬磁碟不會被 "
                             f"WSL2 自動掛載，需手動掛："
                             f"sudo mkdir -p /mnt/{drive_letter} && "
                             f"sudo mount -t drvfs {drive_letter.upper()}: /mnt/{drive_letter}"
                             f"（start_server.sh 會嘗試自動處理，失敗時才會看到這則訊息）"}
        return {"ok": False, "dest": None, "files": [],
                "error": f"找不到 Google Drive 路徑 {DRIVE_BASE}；"
                         f"檢查掛載是否還在（可能是磁碟代號變了，或該帳號登出了）"}

    date_folder = datetime.datetime.now().strftime("%Y%m%d")
    dest_dir = os.path.join(DRIVE_BASE, date_folder)
    try:
        os.makedirs(dest_dir, exist_ok=True)
    except OSError as e:
        return {"ok": False, "dest": None, "files": [], "error": f"建立日期資料夾失敗: {e}"}

    title = _safe_name(minutes.get("title"), job_id)
    copied = []
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
            copied.append(dst_name)
            seen_targets.add(dst_name)
        except OSError as e:
            return {"ok": False, "dest": dest_dir, "files": copied,
                    "error": f"複製 {src_name} 失敗: {e}"}

    return {"ok": True, "dest": dest_dir, "files": copied, "error": None}
