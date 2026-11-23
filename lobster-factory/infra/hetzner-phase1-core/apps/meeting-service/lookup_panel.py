"""會議中的查詢側欄（Windows）。

在任何視窗反白一段字（例如 OwnVoice Meet 的字幕），按 Ctrl+Shift+F7：
側欄出現並自動搜尋網路；「問 AI」按了才問（會計費）。
側欄貼在螢幕右邊、整條高度，並向 Windows 登記佔用那一條（跟工作列同一種機制）：
其他視窗最大化時會讓開，互不遮蓋（操作者 2026-11-23：不要飄浮視窗）。

只用標準函式庫：這台筆電的 Smart App Control 會擋未簽章的執行檔與 .pyd，
python.exe 本身有簽章。查詢由 meeting-service 做（lib/lookup.py），這裡只管
快捷鍵、取字、顯示。啟動：start_server.ps1 會順便開；單獨開用 `pythonw lookup_panel.py`。
"""
import ctypes
import json
import queue
import sys
import threading
import time
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from ctypes import wintypes

SERVER = "http://127.0.0.1:8420"
HOTKEY_LABEL = "Ctrl+Shift+F7"
MOD_CONTROL, MOD_SHIFT, MOD_NOREPEAT = 0x2, 0x4, 0x4000
# OwnVoice 自己佔了 Ctrl+Shift+Space（回覆）、F8（滑鼠穿透）、F9（新段落），不能撞。
VK_SHIFT, VK_CONTROL, VK_MENU, VK_C, VK_F7 = 0x10, 0x11, 0x12, 0x43, 0x76
KEYEVENTF_KEYUP = 0x2
WM_HOTKEY = 0x0312
FONT = "Microsoft JhengHei UI"
WIDTH_INCHES = 4.8                      # 側欄寬度；用英吋換算，高解析度螢幕上不會變窄
ABM_NEW, ABM_REMOVE, ABM_QUERYPOS, ABM_SETPOS, ABE_RIGHT = 0, 1, 2, 3, 2
GA_ROOT = 2

user32 = ctypes.windll.user32
user32.GetAncestor.restype = wintypes.HWND
user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]


class APPBARDATA(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uCallbackMessage", wintypes.UINT),
                ("uEdge", wintypes.UINT), ("rc", wintypes.RECT), ("lParam", wintypes.LPARAM)]


shell32 = ctypes.windll.shell32
shell32.SHAppBarMessage.restype = ctypes.c_size_t
shell32.SHAppBarMessage.argtypes = [wintypes.DWORD, ctypes.POINTER(APPBARDATA)]


def call(path: str, payload: dict) -> dict:
    req = urllib.request.Request(SERVER + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            raise RuntimeError(json.load(e)["detail"]) from None
        except (ValueError, KeyError):
            raise RuntimeError(f"HTTP {e.code}") from None
    except OSError:
        raise RuntimeError("連不到會議工具（先執行「啟動會議處理服務」）") from None


def copy_selection() -> bool:
    """對目前的視窗送 Ctrl+C；剪貼簿真的變了才回 True。"""
    # 快捷鍵的 Ctrl／Shift 還按著時送 C 會變成 Ctrl+Shift+C，等手放開。
    deadline = time.monotonic() + 1.5
    while time.monotonic() < deadline and any(
            user32.GetAsyncKeyState(k) & 0x8000 for k in (VK_SHIFT, VK_CONTROL, VK_MENU)):
        time.sleep(0.02)
    before = user32.GetClipboardSequenceNumber()
    for key, flags in ((VK_CONTROL, 0), (VK_C, 0), (VK_C, KEYEVENTF_KEYUP), (VK_CONTROL, KEYEVENTF_KEYUP)):
        user32.keybd_event(key, 0, flags, 0)
    deadline = time.monotonic() + 0.6
    while time.monotonic() < deadline:
        if user32.GetClipboardSequenceNumber() != before:
            return True
        time.sleep(0.02)
    return False


class Panel:
    def __init__(self, events: queue.Queue):
        self.events = events            # 其他執行緒 -> 畫面：("hotkey",) 或 (kind, generation, result)
        self.generation = 0             # 每次發出查詢（搜尋或問 AI）就加一
        self.latest = {}                # kind -> 該種查詢最後一次發出時的 generation；晚到的舊結果丟掉
        self.answer = None              # 問 AI 的結果或錯誤訊息
        self.results = None             # 搜尋結果 list，或錯誤訊息 str

        root = self.root = tk.Tk()
        root.title("查詢")
        root.overrideredirect(True)     # 側欄沒有標題列，不能被拖走；收起來用「隱藏」
        root.attributes("-topmost", True)
        self.docked = None              # 已向 Windows 登記佔用螢幕邊緣時的 APPBARDATA

        self.query = tk.Text(root, height=3, wrap="word", font=(FONT, 11))
        self.query.pack(fill="x", padx=10, pady=(10, 6))
        bar = tk.Frame(root)
        bar.pack(fill="x", padx=10)
        for label, command in (("搜尋網路", self.search), ("問 AI（計費）", self.ask),
                               ("心智圖", lambda: webbrowser.open(SERVER + "/mindmap?session=latest")),
                               ("隱藏", self.hide), ("結束", self.quit)):
            tk.Button(bar, text=label, command=command, font=(FONT, 10)).pack(side="left", padx=(0, 6))
        self.status = tk.Label(root, anchor="w", fg="#475569", font=(FONT, 9),
                               text=f"在任何視窗反白文字，按 {HOTKEY_LABEL}")
        self.status.pack(fill="x", side="bottom", padx=10, pady=6)
        self.out = tk.Text(root, wrap="word", font=(FONT, 11), state="disabled", cursor="arrow",
                           padx=8, pady=8, spacing3=4)
        self.out.pack(fill="both", expand=True, padx=10, pady=(8, 0))
        self.out.tag_config("head", font=(FONT, 11, "bold"), spacing1=8)
        self.out.tag_config("muted", foreground="#475569", font=(FONT, 9))
        self.out.tag_config("link", foreground="#4f52e0", underline=True)

        self.show()
        root.after(100, self.pump)

    # ---------- 側欄：佔用／讓出螢幕右邊 ----------
    def show(self):
        if self.docked:
            return
        root = self.root
        root.deiconify()
        root.update_idletasks()
        bar = APPBARDATA(cbSize=ctypes.sizeof(APPBARDATA), hWnd=user32.GetAncestor(root.winfo_id(), GA_ROOT),
                         uEdge=ABE_RIGHT)
        shell32.SHAppBarMessage(ABM_NEW, ctypes.byref(bar))
        width = int(root.winfo_fpixels("1i") * WIDTH_INCHES)
        bar.rc = wintypes.RECT(root.winfo_screenwidth() - width, 0, root.winfo_screenwidth(), root.winfo_screenheight())
        shell32.SHAppBarMessage(ABM_QUERYPOS, ctypes.byref(bar))    # Windows 依工作列等既有佔用修正上下邊界
        bar.rc.left = bar.rc.right - width
        shell32.SHAppBarMessage(ABM_SETPOS, ctypes.byref(bar))
        root.geometry(f"{width}x{bar.rc.bottom - bar.rc.top}+{bar.rc.left}+{bar.rc.top}")
        self.docked = bar

    def hide(self):
        """把右邊那一條還給其他視窗；快捷鍵會再叫出來。"""
        if self.docked:
            shell32.SHAppBarMessage(ABM_REMOVE, ctypes.byref(self.docked))
            self.docked = None
        self.root.withdraw()

    def quit(self):
        self.hide()
        self.root.destroy()

    # ---------- 取字 ----------
    def on_hotkey(self):
        try:
            old = self.root.clipboard_get()
        except tk.TclError:
            old = None                  # 空的，或不是文字（圖片、檔案）：下面的 Ctrl+C 會蓋掉它，無法還原
        copied = copy_selection()
        try:
            text = self.root.clipboard_get().strip() if copied else ""
        except tk.TclError:
            text = ""
        if copied and old is not None:
            self.root.clipboard_clear()
            self.root.clipboard_append(old)
        self.show()
        if not text:
            self.status.config(text="沒有取到文字：先用滑鼠反白，再按快捷鍵")
            return
        self.query.delete("1.0", "end")
        self.query.insert("1.0", text)
        self.search()

    # ---------- 查詢 ----------
    def start(self, kind: str, path: str, payload: dict):
        self.generation += 1
        generation = self.latest[kind] = self.generation

        def work():
            try:
                result = call(path, payload)
            except RuntimeError as e:
                result = str(e)
            self.events.put((kind, generation, result))

        threading.Thread(target=work, daemon=True).start()

    def text(self) -> str:
        return self.query.get("1.0", "end").strip()

    def search(self):
        if not self.text():
            return
        self.latest.pop("ask", None)    # 換了查詢文字：還在路上的 AI 回答不再適用
        self.answer, self.results = None, "搜尋中…"
        self.render()
        self.start("search", "/api/lookup/search", {"q": self.text()})

    def ask(self):
        if not self.text():
            return
        self.answer = "AI 回答中…"
        self.render()
        self.start("ask", "/api/lookup/ask", {"text": self.text()})

    # ---------- 畫面 ----------
    def pump(self):
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            if event[0] == "hotkey":
                self.on_hotkey()
                continue
            kind, generation, result = event
            if generation != self.latest.get(kind):
                continue
            if kind == "search":
                self.results = result if isinstance(result, str) else result["results"]
            else:
                self.answer = result if isinstance(result, str) else (
                    f"{result['answer']}\n（用量：輸入 {result['input_tokens']}、輸出 {result['output_tokens']} tokens）")
            self.render()
        self.root.after(100, self.pump)

    def render(self):
        out = self.out
        out.config(state="normal")
        out.delete("1.0", "end")
        for tag in out.tag_names():
            if tag.startswith("url"):
                out.tag_delete(tag)
        if self.answer is not None:
            out.insert("end", "AI\n", "head")
            out.insert("end", self.answer + "\n")
        if isinstance(self.results, str):
            out.insert("end", self.results + "\n", "muted")
        elif self.results is not None:
            out.insert("end", "網路\n", "head")
            if not self.results:
                out.insert("end", "沒有找到結果\n", "muted")
            for i, r in enumerate(self.results):
                tag = f"url{i}"
                out.insert("end", r["title"] + "\n", ("link", tag))
                out.tag_bind(tag, "<Button-1>", lambda _e, url=r["link"]: webbrowser.open(url))
                out.insert("end", r["snippet"] + "\n")
        out.config(state="disabled")


def hotkey_loop(events: queue.Queue, registered: list, ready: threading.Event):
    """RegisterHotKey 的訊息只送給註冊它的執行緒，所以註冊與收訊息都在這裡。"""
    registered.append(bool(user32.RegisterHotKey(None, 1, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_F7)))
    ready.set()
    if not registered[0]:
        return
    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        if msg.message == WM_HOTKEY:
            events.put(("hotkey",))


def main():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except (AttributeError, OSError):
        pass
    events, registered, ready = queue.Queue(), [], threading.Event()
    threading.Thread(target=hotkey_loop, args=(events, registered, ready), daemon=True).start()
    ready.wait()
    if not registered[0]:
        sys.exit(0)     # 快捷鍵已被註冊 = 面板已經開著，不開第二個
    Panel(events).root.mainloop()


if __name__ == "__main__":
    main()
