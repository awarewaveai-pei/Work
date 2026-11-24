"""行程內顯卡互斥：即時本機辨識（live）與會後批次整理（batch）不同時佔用顯卡。

不變量：live 與 batch 不會同時登記；兩邊都是「檢查＋登記」在同一把鎖內完成。
- live 同時只有一場；有批次登記中時拿不到。
- batch 可以有好幾個（原本就允許連續上傳）；live 登記中時拿不到。

只在同一個行程內有效；呼叫端負責在拿不到時給使用者說明，並保證每次拿到都會還。"""
import threading
from typing import Optional

_lock = threading.Lock()
_live = False
_batches = 0


def acquire_live() -> bool:
    global _live
    with _lock:
        if _live or _batches:
            return False
        _live = True
        return True


def release_live() -> None:
    global _live
    with _lock:
        _live = False


def acquire_batch() -> bool:
    global _batches
    with _lock:
        if _live:
            return False
        _batches += 1
        return True


def release_batch() -> None:
    global _batches
    with _lock:
        _batches = max(0, _batches - 1)


def active() -> Optional[str]:
    with _lock:
        return "live" if _live else "batch" if _batches else None
