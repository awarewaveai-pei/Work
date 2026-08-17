"""會議錄音處理 — 本機操作頁面。

僅限本機執行（GPU 依賴）。啟動：
    python app.py
開啟 http://127.0.0.1:8420

不部署到 SG/EU（無 GPU，見 README.md）。
"""
import json
import os
import shutil
import threading
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from pipeline import run_pipeline

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
                  model: str = "large-v3"):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援的副檔名 {ext}；允許：{', '.join(sorted(ALLOWED_EXT))}")

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

    for key in ("ANTHROPIC_API_KEY",):
        if not os.environ.get(key):
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(500, f"環境變數 {key} 未設定；請在 mcp/user-env.ps1 補上後重啟本服務")
    if diarize and not os.environ.get("HF_TOKEN"):
        # 講者分離缺 token 不擋主流程——pipeline 內會自動退回無標籤繼續跑
        pass

    thread = threading.Thread(
        target=run_pipeline,
        args=(job_dir, media_path),
        kwargs={"model_name": model, "do_diarize": diarize},
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
def status(job_id: str):
    job_dir = _job_dir(job_id)
    path = os.path.join(job_dir, "status.json")
    if not os.path.exists(path):
        return {"stage": "starting", "done": False}
    return JSONResponse(json.load(open(path, encoding="utf-8")))


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
    "minutes_md": ("meeting_notes.md", "text/markdown; charset=utf-8"),
    "slides": ("slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "coach": ("coach.md", "text/markdown; charset=utf-8"),
    "transcript_srt": ("transcript.srt", "application/x-subrip"),
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
