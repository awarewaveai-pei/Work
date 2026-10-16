"""跑長任務時阻止 Windows 睡眠。

根因（2026-08-18 真實事故）：一小時會議轉錄跑到 9% 時筆電睡眠，process 被砍，
job 全部遺失（transcript.json 要整段轉錄完才寫檔，中途沒有任何可回收的進度）。
Windows Event Log 於當下時間點記到 Kernel-Power 事件（Id 41 等）。長任務期間
使用者不會碰滑鼠鍵盤，對 Windows 閒置偵測而言看起來就是「該睡了」。

用 SetThreadExecutionState 這個標準 Win32 API 告訴系統「有任務在跑，別睡」。
只在本 process 存活期間有效，process 結束（含被砍）自動失效，不會有「忘記解除」
讓使用者的筆電永遠不睡的風險。

**WSL2 情境（2026-08-27 起主要執行環境）**：服務改在 WSL2 內執行後，
`sys.platform` 變成 `linux`，原本的實作直接 return 變成完全的空操作——而且是
在無人值守時間變長的同時失效的（GPU 7.0x → WSL2 CPU 2.1x，60 分鐘錄音的
無人值守時間從約 9 分鐘變成約 28 分鐘）。這正是 AGENTS.md 點名的最惡樣態：
偵測/保護悄悄失效，系統宣稱有保護但實際沒有。

WSL2 內無法直接呼叫 Win32 API（不同核心），所以改成透過 `powershell.exe`
（WSL 可執行 Windows 執行檔）起一個常駐 helper process 持有 ES_CONTINUOUS，
allow_sleep() 時終止它。Windows 的電源請求綁在那個 helper 的生命週期上，
helper 被砍（含 WSL 關閉）就自動失效，維持與原生版本相同的「不會忘記解除」特性。
"""
import ctypes
import os
import subprocess
import sys
import threading

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001

# WSL2 下持有電源請求的 powershell helper；None = 目前沒有持有
_wsl_helper = None
# Jobs run in threads and share this one helper: count holders and release only when the last leaves
# (Codex 2026-10-16: two overlapping jobs, the first to finish let the machine sleep under the second).
_wsl_holders = 0
_wsl_lock = threading.Lock()

# helper 本體：持續持有 ES_CONTINUOUS|ES_SYSTEM_REQUIRED 直到被終止。
# 用 Sleep 迴圈而非 Read-Host，因為這個 process 沒有 stdin 可讀。
#
# ⚠️ 旗標必須寫成十進位並明確轉 [uint32]：PowerShell 會把 `0x80000001` 解析成
# 有號 Int32（-2147483647），轉 UInt32 參數時直接拋 MethodException，呼叫失敗
# 但 process 照樣活著——結果是「helper 在跑、is_holding() 回 True、實際毫無
# 防睡眠效果」。2026-08-27 第一版就是這樣寫的，實測才抓到。
# 2147483649 = 0x80000001 = ES_CONTINUOUS | ES_SYSTEM_REQUIRED
#
# 回傳 0 代表 API 呼叫失敗；helper 會以 exit code 1 結束，讓 is_holding() 在
# 下一次查詢時據實回報 False，而不是讓失敗看起來像成功。
_PS_KEEPALIVE = (
    "$s=Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]"
    "public static extern uint SetThreadExecutionState(uint esFlags);' "
    "-Name P -Namespace W -PassThru; "
    "$r=$s::SetThreadExecutionState([uint32]2147483649); "
    "if($r -eq 0){exit 1}; "
    "while($true){Start-Sleep -Seconds 60}"
)


def _is_wsl() -> bool:
    """WSL 判定：核心版本字串含 microsoft。這是微軟官方建議的偵測方式。"""
    if sys.platform != "linux":
        return False
    try:
        with open("/proc/version", encoding="utf-8", errors="replace") as f:
            return "microsoft" in f.read().lower()
    except OSError:
        return False


def prevent_sleep():
    """呼叫後阻止系統閒置睡眠，直到 allow_sleep() 或 process 結束。

    Windows 原生：直接呼叫 Win32 API。
    WSL2：起一個 powershell.exe helper 持有電源請求。
    其他 Linux/macOS：no-op（本工具的設計場域是這台 Windows 筆電）。
    """
    global _wsl_helper
    if sys.platform == "win32":
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
        return

    if not _is_wsl():
        return

    global _wsl_holders
    with _wsl_lock:
        _wsl_holders += 1
        _start_wsl_helper()


def _start_wsl_helper():
    global _wsl_helper
    if _wsl_helper is not None and _wsl_helper.poll() is None:
        return  # 已經持有，重複呼叫不再起第二個

    try:
        _wsl_helper = subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", _PS_KEEPALIVE],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except (OSError, FileNotFoundError):
        # 找不到 powershell.exe（非 WSL 的 Linux、或 interop 被關閉）——
        # 不讓防睡眠失敗中斷整個轉錄工作，但也不假裝成功。
        _wsl_helper = None


def allow_sleep():
    """恢復正常睡眠行為。"""
    global _wsl_helper
    if sys.platform == "win32":
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
        return

    global _wsl_holders
    with _wsl_lock:
        _wsl_holders = max(0, _wsl_holders - 1)
        if _wsl_holders:
            return  # another job still needs the machine awake
        _stop_wsl_helper()


def _stop_wsl_helper():
    global _wsl_helper
    if _wsl_helper is None:
        return
    try:
        _wsl_helper.terminate()
        _wsl_helper.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        try:
            _wsl_helper.kill()
        except OSError:
            pass
    finally:
        _wsl_helper = None


def is_holding() -> bool:
    """目前是否真的持有電源請求。供驗證用——「有沒有保護」必須可被查驗，
    不能只靠呼叫了函式就假設生效（這正是 WSL2 遷移時失效卻無人察覺的原因）。"""
    if sys.platform == "win32":
        return True  # Win32 API 無查詢介面；原生路徑本來就一直有效
    return _wsl_helper is not None and _wsl_helper.poll() is None
