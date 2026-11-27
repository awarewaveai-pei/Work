"""設定裡的資料夾路徑：一律存 Windows 寫法（H:\\我的雲端硬碟\\會議記錄），用的時候經 local() 換成這個行程打得開的路徑。
伺服器可能跑在 Windows 原生或 WSL2（start_server.ps1 依 Smart App Control 自動選），同一個設定兩邊都要能用。
只用標準庫：lib/settings.py 的驗證會用到它。"""
import os
import re
import sys
import tempfile

MAX_LEN = 260
_DRIVE = re.compile(r"^([A-Za-z]):[\\/]")
_WSL_MNT = re.compile(r"^/mnt/([A-Za-z])(/.*)?$")
# 雲端同步軟體放資料夾的名字（比對每一層，不分大小寫）；Google Drive 的磁碟另外看磁碟標籤。
CLOUD_NAMES = {"onedrive": "OneDrive", "dropbox": "Dropbox", "iclouddrive": "iCloud", "icloud drive": "iCloud",
               "google drive": "Google Drive", "googledrive": "Google Drive", "my drive": "Google Drive",
               "我的雲端硬碟": "Google Drive", "shared drives": "Google Drive", "共用雲端硬碟": "Google Drive"}
DRIVE_LABEL = "Google Drive"
DRIVE_ROOTS = ("我的雲端硬碟", "My Drive")


class PathError(ValueError):
    """路徑寫法不對，或這台機器現在打不開它；訊息是給頁面看的完整句子。"""
    sentence = True


def is_wsl() -> bool:
    """WSL 判定：核心版本字串含 microsoft（微軟官方建議的偵測方式）。"""
    if sys.platform != "linux":
        return False
    try:
        with open("/proc/version", encoding="utf-8", errors="replace") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def windows(path: str) -> str:
    """存進設定的寫法：X:\\a\\b。也收 X:/a/b 與 WSL 的 /mnt/x/a/b（舊環境變數就是這種）。"""
    if not isinstance(path, str):
        raise PathError("資料夾要是文字")
    p = path.strip().strip('"')
    m = _WSL_MNT.match(p)
    if m:
        p = m.group(1) + ":" + (m.group(2) or "\\")
    if not _DRIVE.match(p):
        raise PathError("資料夾要寫完整路徑，從磁碟代號開始，例如 D:\\會議錄音")
    if len(p) > MAX_LEN:
        raise PathError(f"資料夾路徑太長（上限 {MAX_LEN} 字元）")
    rest = p[2:].replace("/", "\\")
    if any(c in '<>"|?*:' or ord(c) < 32 for c in rest):
        raise PathError('資料夾名稱不能有 < > " | ? * : 或控制字元')
    # Windows drops trailing dots and spaces from a name ("OneDrive." is the OneDrive folder).
    rest = "\\".join(part.rstrip(" .") for part in rest.split("\\") if part.rstrip(" ."))
    return p[0].upper() + ":\\" + rest


def local(path: str, wsl=None) -> str:
    """設定裡的路徑 → 這個行程打得開的路徑。WSL2：X:\\a → /mnt/x/a，那顆磁碟沒掛載就說清楚怎麼掛。"""
    p = windows(path)
    if not (is_wsl() if wsl is None else wsl):
        return p
    letter = p[0].lower()
    mount = f"/mnt/{letter}"
    if not os.path.isdir(mount):
        raise PathError(f"伺服器跑在 WSL2，裡面沒有掛載 {p[0]}: 磁碟（雲端硬碟這類虛擬磁碟不會自動掛載）。"
                        f"在 WSL 執行：sudo mkdir -p {mount} && sudo mount -t drvfs {p[0]}: {mount}")
    return mount + p[2:].replace("\\", "/").rstrip("/")


def cloud(path: str) -> str:
    """路徑在哪個雲端同步資料夾底下（"OneDrive"、"Google Drive"…）；不在就回 ""。
    不是 Windows 磁碟路徑（WSL 裡的 /home/...）就不是 Windows 的雲端資料夾。"""
    real = os.path.realpath(path) if os.path.exists(path) else path
    if real != path:
        # A junction or symbolic link: what counts is where the files really go.
        found = cloud(real)
        if found:
            return found
    try:
        p = windows(path)
    except PathError:
        return ""
    parts = [x.lower() for x in p[3:].split("\\") if x]
    for part in parts:
        if part in CLOUD_NAMES:
            return CLOUD_NAMES[part]
        if part.startswith("onedrive - "):        # 公司帳號：OneDrive - 公司名
            return "OneDrive"
    for var in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial"):
        base = os.environ.get(var, "").strip()
        if base and _DRIVE.match(base):
            b = windows(base).lower()
            if p.lower() == b or p.lower().startswith(b + "\\"):
                return "OneDrive"
    if _volume_label(p[0]) == DRIVE_LABEL:
        return "Google Drive"
    return ""


def _volume_label(letter: str) -> str:
    """Windows 原生才問得到磁碟標籤（Google Drive 桌面版的磁碟叫「Google Drive」）；WSL 回 ""。"""
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(261)
        if ctypes.windll.kernel32.GetVolumeInformationW(f"{letter}:\\", buf, 261, None, None, None, None, 0):
            return buf.value
    except (AttributeError, OSError):
        pass
    return ""


def documents() -> str:
    """Windows 的「文件」資料夾（可能被 OneDrive 轉向，問 Windows 才準）；問不到（WSL）回 ""。"""
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buf)  # CSIDL_PERSONAL
        return buf.value
    except (AttributeError, OSError):
        return ""


def drive_roots() -> list:
    """偵測到的 Google Drive 掛載（X:\\我的雲端硬碟 或 X:\\My Drive），給輸出目的地的捷徑按鈕。"""
    out = []
    for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
        if is_wsl():
            base = f"/mnt/{letter.lower()}"
            found = [r for r in DRIVE_ROOTS if os.path.isdir(f"{base}/{r}")]
        else:
            if _volume_label(letter) != DRIVE_LABEL:
                continue
            found = [r for r in DRIVE_ROOTS if os.path.isdir(f"{letter}:\\{r}")]
        out += [f"{letter}:\\{r}" for r in found]
    return out


def check(path: str, recording: bool) -> dict:
    """「檢查」按鈕：{ok, path（存檔寫法）, message}。存在、能寫入；錄音資料夾另外不可在雲端同步資料夾底下。"""
    try:
        p = windows(path)
        if recording:
            refuse_cloud(p)
        where = local(p)
    except PathError as e:
        return {"ok": False, "path": path, "message": str(e)}
    if not os.path.isdir(where):
        return {"ok": False, "path": p, "message": "找不到這個資料夾（請先建立，或檢查磁碟代號）"}
    try:
        fd, probe = tempfile.mkstemp(prefix=".write-check-", dir=where)
        os.close(fd)
        os.remove(probe)
    except OSError as e:
        return {"ok": False, "path": p, "message": f"這個資料夾不能寫入：{e.strerror or type(e).__name__}"}
    return {"ok": True, "path": p, "message": "可以使用"}


def refuse_cloud(path: str) -> None:
    """錄音不出這台電腦（lib/archive.py 的原則）：錄音資料夾在雲端同步資料夾底下就拒絕。"""
    name = cloud(path)
    if name:
        raise PathError(f"錄音資料夾不能放在 {name} 同步的資料夾裡：錄音（含聲紋）不離開這台電腦。"
                        "請選本機的資料夾；要同步到雲端的是會後整理的產出，請設在「輸出目的地」。")
