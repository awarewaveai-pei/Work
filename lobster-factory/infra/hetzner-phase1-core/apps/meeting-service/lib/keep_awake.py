"""跑長任務時阻止 Windows 睡眠。

根因（2026-08-18 真實事故）：一小時會議轉錄跑到 9% 時筆電睡眠，process 被砍，
job 全部遺失（transcript.json 要整段轉錄完才寫檔，中途沒有任何可回收的進度）。
Windows Event Log 於當下時間點記到 Kernel-Power 事件（Id 41 等）。長任務期間
使用者不會碰滑鼠鍵盤，對 Windows 閒置偵測而言看起來就是「該睡了」。

用 SetThreadExecutionState 這個標準 Win32 API 告訴系統「有任務在跑，別睡」。
只在本 process 存活期間有效，process 結束（含被砍）自動失效，不會有「忘記解除」
讓使用者的筆電永遠不睡的風險。
"""
import ctypes
import sys

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001


def prevent_sleep():
    """呼叫後阻止系統閒置睡眠，直到 allow_sleep() 或 process 結束。非 Windows 上是 no-op。"""
    if sys.platform != "win32":
        return
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


def allow_sleep():
    """恢復正常睡眠行為。"""
    if sys.platform != "win32":
        return
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
