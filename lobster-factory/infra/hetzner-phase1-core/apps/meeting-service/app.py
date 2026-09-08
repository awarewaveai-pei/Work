"""會議錄音處理 — 本機操作頁面。

僅限本機執行（GPU 依賴）。啟動方式：
  這台筆電：`.\\start_server.ps1`（實際跑在 WSL2，因為 Windows 的 Smart App
    Control 封鎖 av 套件的 .pyd —— 見 README「執行環境」與 lib/transcribe.py）
  其他環境：`python app.py`
開啟 http://127.0.0.1:8420

不部署到 SG/EU（無 GPU，見 README.md）。
"""
import json
import os
import shutil
import threading
import uuid

from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse

from lib import settings, summarize
from pipeline import resume_after_summary, run_pipeline_phase1

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(BASE_DIR, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

app = FastAPI(title="Meeting Service (local only)")

MAX_UPLOAD_MB = 500
ALLOWED_EXT = {".mp4", ".m4a", ".mp3", ".wav", ".mov", ".mkv", ".webm", ".aac", ".flac"}


def _job_dir(job_id: str) -> str:
    # job_id 由伺服器自產（uuid4），這裡僅防呼叫端傳入路徑穿越字元
    if not job_id or any(c in job_id for c in ("/", "\\", "..")):
        raise HTTPException(400, "invalid job id")
    d = os.path.join(JOBS_DIR, job_id)
    if not os.path.isdir(d):
        raise HTTPException(404, "job not found")
    return d


@app.get("/", response_class=HTMLResponse)
def index():
    with open(os.path.join(BASE_DIR, "templates", "index.html"), encoding="utf-8") as f:
        return f.read()


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), diarize: bool = True,
                  model: str = "large-v3", sync_drive: bool = False,
                  use_api: bool = False):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援的副檔名 {ext}；允許：{', '.join(sorted(ALLOWED_EXT))}")

    # key 在上傳當下就讀出來、往下傳給背景 thread，不要讓 thread 自己在跑到
    # 摘要階段時才去讀 settings.py 目前的值——轉錄+講者分離常常要跑好幾分鐘，
    # 這段時間夠使用者在設定頁換掉或清除 key，屆時才讀會用錯 key 或誤退回人工。
    api_key = settings.get_api_key() if use_api else ""
    if use_api and not api_key:
        raise HTTPException(400, "尚未在設定頁填入 API key，無法使用 API 自動處理")

    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    media_path = os.path.join(job_dir, f"input{ext}")
    size = 0
    with open(media_path, "wb") as out:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > MAX_UPLOAD_MB * 1024 * 1024:
                out.close()
                shutil.rmtree(job_dir, ignore_errors=True)
                raise HTTPException(413, f"檔案超過 {MAX_UPLOAD_MB}MB 上限")
            out.write(chunk)

    # 預設走人工回路（貼上/叫 Claude Code），不呼叫 API，不需要 ANTHROPIC_API_KEY。
    # use_api=True 且已設定 key 時，pipeline 內會直接呼叫 summarize_via_api()，
    # 真的會計費；key 由使用者自行在 /api/settings 填入，不共用操作者的訂閱。
    # 講者分離缺 HF_TOKEN 也不擋主流程——pipeline 內會自動退回無標籤繼續跑。

    thread = threading.Thread(
        target=run_pipeline_phase1,
        args=(job_dir, media_path),
        kwargs={"model_name": model, "do_diarize": diarize, "sync_drive": sync_drive,
                "use_api": use_api, "api_key": api_key},
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/api/settings")
def get_settings():
    """回傳是否已設定 key + 遮罩版本，絕不回傳明文。"""
    return {"has_api_key": settings.has_api_key(), "masked_api_key": settings.masked_api_key()}


@app.post("/api/settings")
def save_settings(body: dict = Body(...)):
    """設定頁存 API key。空字串等同清除設定，退回人工回路模式。"""
    key = (body.get("anthropic_api_key") or "").strip()
    settings.set_api_key(key)
    return {"has_api_key": settings.has_api_key(), "masked_api_key": settings.masked_api_key()}


@app.get("/api/prompt/{job_id}")
def get_prompt(job_id: str):
    """階段 1 完成後，取得可直接貼進任一 Claude 對話的完整 prompt。"""
    job_dir = _job_dir(job_id)
    path = os.path.join(job_dir, "prompt.txt")
    if not os.path.exists(path):
        raise HTTPException(404, "prompt 尚未產生（可能還在轉錄/講者分離階段）")
    with open(path, encoding="utf-8") as f:
        return PlainTextResponse(f.read())


@app.post("/api/submit-summary/{job_id}")
def submit_summary(job_id: str, body: dict = Body(...)):
    """使用者把 Claude 回傳的 JSON 貼回這裡，接手產生 PPT/教練稿/會議記錄。"""
    job_dir = _job_dir(job_id)
    raw = body.get("text", "")
    try:
        minutes = summarize.parse_pasted_json(raw)
    except Exception as e:
        raise HTTPException(400, f"無法解析為 JSON：{type(e).__name__}: {e}")

    errors = resume_after_summary(job_dir, minutes)
    if errors:
        raise HTTPException(422, "; ".join(errors))
    return {"ok": True}


@app.get("/api/status/{job_id}")
def status(job_id: str):
    job_dir = _job_dir(job_id)
    path = os.path.join(job_dir, "status.json")
    if not os.path.exists(path):
        return {"stage": "starting", "done": False}
    try:
        with open(path, encoding="utf-8") as f:
            return JSONResponse(json.load(f))
    except (json.JSONDecodeError, OSError):
        # write_status() 用原子 rename 寫檔（見 pipeline.py），理論上讀不到
        # 半寫狀態；這裡留防禦性 fallback 是給極端情況（例如檔案系統本身
        # 不支援 atomic rename），寧可讓前端下一輪 1.5s 再 poll，也不要 500。
        return {"stage": "starting", "done": False}


@app.get("/api/log/{job_id}")
def log_tail(job_id: str, lines: int = 60):
    job_dir = _job_dir(job_id)
    path = os.path.join(job_dir, "log.txt")
    if not os.path.exists(path):
        return {"lines": []}
    with open(path, encoding="utf-8", errors="replace") as f:
        content = f.readlines()
    return {"lines": [l.rstrip("\n") for l in content[-lines:]]}


DOWNLOADS = {
    # 文件類一律 Word（2026-08-27 起不再產 .md）；逐字稿維持純文字
    "word": ("meeting_record.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "slides": ("slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "excel": ("meeting_record.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "coach": ("coach.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "transcript_srt": ("transcript.srt", "application/x-subrip"),
    "transcript_vtt": ("transcript.vtt", "text/vtt; charset=utf-8"),
    "transcript_json": ("transcript.json", "application/json"),
    "diarized_txt": ("diarized.txt", "text/plain; charset=utf-8"),
    "merged_txt": ("merged.txt", "text/plain; charset=utf-8"),
}


@app.get("/api/download/{job_id}/{kind}")
def download(job_id: str, kind: str):
    job_dir = _job_dir(job_id)
    if kind not in DOWNLOADS:
        raise HTTPException(404, "unknown file kind")
    filename, media_type = DOWNLOADS[kind]
    path = os.path.join(job_dir, filename)
    if not os.path.exists(path):
        raise HTTPException(404, f"{filename} 尚未產生（可能該階段還沒跑到，或講者分離失敗被跳過）")
    return FileResponse(path, media_type=media_type, filename=filename)


if __name__ == "__main__":
    import uvicorn
    print("會議錄音處理 — 僅限本機執行 http://127.0.0.1:8420")
    uvicorn.run(app, host="127.0.0.1", port=8420)
