"""會議錄音處理 — 本機操作頁面。

僅限本機執行（GPU 依賴）。啟動方式：
  這台筆電：`.\\start_server.ps1`（實際跑在 WSL2，因為 Windows 的 Smart App
    Control 封鎖 av 套件的 .pyd —— 見 README「執行環境」與 lib/transcribe.py）
  其他環境：`python app.py`
開啟 http://127.0.0.1:8420

不部署到 SG/EU（無 GPU，見 README.md）。
"""
import asyncio
import contextlib
import json
import os
import shutil
import threading
import uuid
from typing import List

from fastapi import Body, Depends, FastAPI, File, Header, HTTPException, Query, UploadFile, WebSocket
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.middleware.trustedhost import TrustedHostMiddleware

from lib import gpu_gate, jobs, lookup, mindmap, ownvoice, paths, postmeeting, settings, summarize, workspace
from lib.live import hub as live_hub
from lib.live import langs, script_store
from lib.live.translate import TranslateError
from lib.transcribe import LANGUAGES
from pipeline import MODELS, Options, resume_after_summary, run_pipeline_phase1, run_video_transcription, write_status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(BASE_DIR, "jobs")
os.makedirs(JOBS_DIR, exist_ok=True)

LIVE_SHUTDOWN_WAIT = 30.0


@contextlib.asynccontextmanager
async def _lifespan(_app):
    yield
    # 伺服器關閉時還在聆聽：先正常停止，錄音檔頭與逐字稿才會收尾（LIVE 在下方定義）。
    await LIVE.stop()
    await asyncio.sleep(0)
    if LIVE.finalizing is not None:
        await asyncio.wait({LIVE.finalizing}, timeout=LIVE_SHUTDOWN_WAIT)


class _SameOriginWrites:
    """跨站寫入守衛（唯一一處）：GET／HEAD 以外的請求，帶了 Origin 或 Sec-Fetch-Site 就必須是本服務自己的頁面。
    兩個都沒帶的放行：瀏覽器送出的寫入一定帶其中之一；curl、影片工人（/api/video/transcribe 走 Bearer token）與測試不帶。"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] not in ("GET", "HEAD"):
            h = Headers(scope=scope)
            origin, site = h.get("origin"), h.get("sec-fetch-site")
            if (origin is not None and not live_hub.origin_allowed(origin, h.get("host", ""))) or                     (site is not None and site != "same-origin"):
                await JSONResponse({"detail": "只接受這個服務自己的頁面送出的修改"}, status_code=403)(scope, receive, send)
                return
        await self.app(scope, receive, send)


app = FastAPI(title="Meeting Service (local only)", lifespan=_lifespan)
# 只認本機的主機名：別的網域就算解析到 127.0.0.1（DNS rebinding），瀏覽器送來的 Host 也不會過，
# 那個網頁就讀不到逐字稿、也叫不動會計費的端點。
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
# 別的網頁不能替使用者對這裡送出會計費或改設定的請求（/api/upload?use_api=true、/api/lookup/ask、/api/settings…）。
app.add_middleware(_SameOriginWrites)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

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


SETTINGS_SLOT = "<!-- settings-panel -->"


def _page(name: str) -> str:
    """頁面裡的 SETTINGS_SLOT 換成 templates/_settings.html（設定面板只有這一份，兩頁共用）。"""
    with open(os.path.join(BASE_DIR, "templates", name), encoding="utf-8") as f:
        page = f.read()
    if SETTINGS_SLOT in page:
        with open(os.path.join(BASE_DIR, "templates", "_settings.html"), encoding="utf-8") as f:
            page = page.replace(SETTINGS_SLOT, f.read(), 1)
    return page


def _check_language(language: str) -> None:
    if language not in LANGUAGES:
        raise HTTPException(400, f"不支援的語言 {language}；可選：{', '.join(LANGUAGES)}")


class _BatchGpu:
    """一個批次工作對顯卡的登記：從請求一進來，到它的背景執行緒結束。gpu=False＝這個工作不用顯卡，不登記。"""

    def __init__(self, gpu: bool = True):
        self.gpu = gpu
        self.handed = False

    def start(self, target, *args, **kwargs) -> None:
        def run():
            try:
                target(*args, **kwargs)
            finally:
                if self.gpu:
                    gpu_gate.release_batch()

        threading.Thread(target=run, daemon=True).start()
        self.handed = True


@contextlib.contextmanager
def _gpu_claim(gpu: bool = True):
    """本機即時辨識進行中就回 409（8 GB 顯存放不下兩份模型）。登記在請求開頭就完成，上傳檔案那幾分鐘裡
    即時辨識也拿不到顯卡；沒交給執行緒就結束（失敗）時在這裡登出。gpu=False 不登記也不擋。"""
    if gpu and not gpu_gate.acquire_batch():
        raise HTTPException(409, "會議工作區正在用這台電腦的顯卡做即時辨識，請先按停止，再做會後整理")
    claim = _BatchGpu(gpu)
    try:
        yield claim
    finally:
        if gpu and not claim.handed:
            gpu_gate.release_batch()


def _batch_gpu():
    """一定會用顯卡（要轉錄）的批次端點的依賴。"""
    with _gpu_claim() as claim:
        yield claim


def _options(diarize, model, language, sync, use_api) -> Options:
    """會後整理的選項，三個入口（上傳、舊場次、聆聽場次）共用這一個檢查。
    sync＝要同步去的輸出目的地名稱清單；在這裡換成名稱與資料夾，之後改設定不影響這個工作。"""
    if model not in MODELS:
        raise HTTPException(400, f"不支援的模型 {model}；可選：{', '.join(MODELS)}")
    _check_language(language)
    if not isinstance(sync, list) or not all(isinstance(n, str) for n in sync):
        raise HTTPException(400, "同步要是輸出目的地名稱的清單")
    known = {d["name"]: d["dir"] for d in settings.destinations()}
    missing = [n for n in sync if n not in known]
    if missing:
        raise HTTPException(400, f"沒有這個輸出目的地：{'、'.join(missing)[:80]}（在「設定」裡新增）")
    return Options(diarize=bool(diarize), model=model, language=language,
                   destinations=tuple((n, known[n]) for n in dict.fromkeys(sync)),
                   use_api=bool(use_api), target=settings.pref("target"))


def _new_job(source: dict) -> tuple:
    """(job_id, job 資料夾)；source 記在 status.json（工作清單顯示它從哪來）。"""
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir)
    write_status(job_dir, source=source)
    return job_id, job_dir


def _api_key_for(use_api: bool) -> str:
    """key 在請求當下讀出、往下傳給背景 thread（理由見 upload()）。"""
    api_key = settings.get_api_key() if use_api else ""
    if use_api and not api_key:
        raise HTTPException(400, "還沒在「設定」填 Anthropic 金鑰，無法使用 API 自動處理")
    return api_key


@app.get("/", response_class=HTMLResponse)
def index():
    return _page("index.html")


@app.get("/workspace", response_class=HTMLResponse)
def workspace_page():
    return _page("workspace.html")


@app.get("/api/workspace/layout")
def workspace_layout_get():
    """沒存過或檔案壞掉回 JSON null，頁面改用預設版面。"""
    return workspace.load()


@app.put("/api/workspace/layout")
def workspace_layout_put(body: dict = Body(...)):
    try:
        workspace.save(body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


LIVE = live_hub.Hub()


@app.websocket("/api/live/ws")
async def live_ws(ws: WebSocket):
    """會議工作區的即時字幕。只收本服務自己頁面開的連線（見 hub.origin_allowed）。"""
    if not live_hub.origin_allowed(ws.headers.get("origin", ""), ws.headers.get("host", "")):
        await ws.close(code=1008)
        return
    await ws.accept()
    await LIVE.serve(ws)


# 這三個端點用 async def：要在事件迴圈裡呼叫 LIVE.set_script（它把事件放進各頁的佇列，不能在 thread pool 裡做）。
@app.get("/api/live/script")
async def live_script_get():
    return script_store.load()


@app.put("/api/live/script")
async def live_script_put(body: dict = Body(...)):
    """body 可以只有 script 或只有 glossary；另一欄不動。存好後其他開著的頁會收到 script 事件。"""
    try:
        saved = script_store.save(live_hub.clean_text(body.get("script")), live_hub.clean_text(body.get("glossary")))
    except ValueError as e:
        raise HTTPException(400, str(e))
    LIVE.set_script(saved["script"], saved["glossary"])
    return saved


@app.post("/api/live/script/gloss")
async def live_script_gloss(body: dict = Body(...)):
    """補對照（計費）：把講稿缺的那一半交給翻譯模型，結果存成目前的講稿。"""
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(400, "沒有講稿可以補對照")
    try:
        filled, n = await LIVE.gloss_script(text)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except live_hub.ScriptChanged as e:
        raise HTTPException(409, str(e))
    except TranslateError as e:
        raise HTTPException(502, str(e))
    return {"text": filled, "filled": n}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...), diarize: bool = True,
                  model: str = "large-v3", sync: List[str] = Query(default=[]),
                  use_api: bool = False, language: str = "zh",
                  gpu: _BatchGpu = Depends(_batch_gpu)):
    opts = _options(diarize, model, language, sync, use_api)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援的副檔名 {ext}；允許：{', '.join(sorted(ALLOWED_EXT))}")

    # key 在上傳當下就讀出來、往下傳給背景 thread，不要讓 thread 自己在跑到
    # 摘要階段時才去讀 settings.py 目前的值——轉錄+講者分離常常要跑好幾分鐘，
    # 這段時間夠使用者在設定頁換掉或清除 key，屆時才讀會用錯 key 或誤退回人工。
    api_key = _api_key_for(use_api)

    job_id, job_dir = _new_job({"kind": "upload", "name": os.path.basename(file.filename or "")})

    media_path = os.path.join(job_dir, f"input{ext}")
    size = 0
    try:
        with open(media_path, "wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_MB * 1024 * 1024:
                    raise HTTPException(413, f"檔案超過 {MAX_UPLOAD_MB}MB 上限")
                out.write(chunk)
    except BaseException:
        # No half-written job left in the job list.
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    # 預設走人工回路（貼上/叫 Claude Code），不呼叫 API，不需要 ANTHROPIC_API_KEY。
    # use_api=True 且已設定 key 時，pipeline 內會直接呼叫 summarize_via_api()，
    # 真的會計費；key 由使用者自行在 /api/settings 填入，不共用操作者的訂閱。
    # 講者分離缺 HF_TOKEN 也不擋主流程——pipeline 內會自動退回無標籤繼續跑。

    gpu.start(run_pipeline_phase1, job_dir, media_path, opts, api_key)

    return {"job_id": job_id}


# ---------- OwnVoice Meet：會議中查詢、會後整理、心智圖（資料夾格式只有 lib/ownvoice.py 知道） ----------

def _ownvoice(call, *args):
    try:
        return call(*args)
    except KeyError as e:
        raise HTTPException(404, str(e.args[0]))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/ownvoice/sessions")
def ownvoice_sessions():
    """每一場：有沒有聆聽逐字稿（live）、預設做法與理由（recommend）、整理過的工作（jobs，新到舊）。"""
    known = {j["id"]: j for j in jobs.listing(JOBS_DIR, DOWNLOADS)}
    found = ownvoice.sessions()
    for s in found:
        sidecar = ownvoice.session_lines(s["id"], os.path.join(s["root"], s["id"]))
        s["live"] = sidecar is not None
        s["recommend"] = postmeeting.recommend(sidecar, s["wavs"])
        linked = jobs.for_session(JOBS_DIR, os.path.join(s["root"], s["id"]))
        s["jobs"] = sorted((known[i] for i in linked if i in known), key=lambda j: -j["started_at"])
    roots = ownvoice.roots()
    return {"sessions": found, "language": ownvoice.language(), "dir": roots[0] if roots else ownvoice.base_dir()}


@app.post("/api/ownvoice/import")
def ownvoice_import(body: dict = Body(...)):
    """一場會議交給會後整理產物鏈。body：session、reuse（true＝用聆聽的逐字稿，false＝從錄音重新辨識；
    沒給＝postmeeting.recommend 的預設）、diarize、model、language、sync（輸出目的地名稱清單）、use_api。
    顯卡只在要轉錄或要跑 pyannote 時登記。場次資料夾只讀，產物全在 job 資料夾。"""
    # "latest" 在這裡定成實際資料夾名，之後不再重新解析（中途開了新會議也不會接到另一場）。
    folder = _ownvoice(ownvoice.session_dir, str(body.get("session", "")))
    session_id = os.path.basename(folder)
    wavs = next(s["wavs"] for s in ownvoice.sessions() if s["id"] == session_id)
    sidecar = ownvoice.session_lines(session_id)
    # 沒指定語言：聆聽場次用它當時聽的語言，舊場次用 OwnVoice 的設定。
    language = body.get("language") or postmeeting.transcribe_language(sidecar) or ownvoice.language()
    opts = _options(body.get("diarize", True), str(body.get("model") or "large-v3"),
                    language, body.get("sync", []), body.get("use_api"))
    api_key = _api_key_for(opts.use_api)
    reuse = body["reuse"] if isinstance(body.get("reuse"), bool) else postmeeting.recommend(sidecar, wavs)["reuse"]
    if reuse and sidecar is None:
        raise HTTPException(400, "這場沒有聆聽逐字稿，只能從錄音重新辨識")
    if not reuse and not wavs:
        raise HTTPException(400, "這場沒有錄音，不能重新辨識")
    labelled = reuse and postmeeting.speakers(postmeeting.segments(sidecar.get("lines") or [])) is not None
    needs_gpu = not reuse or (opts.diarize and bool(wavs) and not labelled)

    with _gpu_claim(needs_gpu) as claim:
        job_id, job_dir = _new_job({"kind": "session", "session": session_id, "reuse": reuse})
        media_path = None
        try:
            duration = None
            if wavs:
                media_path = os.path.join(job_dir, "input.wav")
                duration = _ownvoice(ownvoice.join_wavs, session_id, media_path)
            if reuse:
                postmeeting.write_products(job_dir, sidecar, duration)
            jobs.link(JOBS_DIR, folder, job_id)
        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise
        claim.start(run_pipeline_phase1, job_dir, media_path, opts, api_key)
    return {"job_id": job_id, "reuse": reuse}


@app.get("/api/jobs")
def jobs_list():
    """jobs/ 裡每一個工作（含等貼上摘要的），新到舊。"""
    return {"jobs": jobs.listing(JOBS_DIR, DOWNLOADS)}


@app.get("/api/postmeeting/options")
def postmeeting_options():
    """會後整理面板的選項按鈕：模型、會議語言（顯示名）、能不能用 API 自動處理。"""
    def label(code):
        row = langs.find(code) or langs.from_whisper(code)
        return row.label if row else code
    return {"models": list(MODELS), "languages": [{"code": c, "label": label(c)} for c in LANGUAGES],
            "language": ownvoice.language(), "has_api_key": settings.has_api_key(),
            "dropped_max_sec": postmeeting.DROPPED_MAX_SEC}


@app.post("/api/lookup/search")
def lookup_search(body: dict = Body(...)):
    query = str(body.get("q", "")).strip()
    if not query:
        raise HTTPException(400, "沒有要搜尋的文字")
    key = settings.key("serper_api_key")
    if not key:
        raise HTTPException(400, "還沒填搜尋金鑰：到「設定」填 Serper 搜尋金鑰")
    try:
        return {"results": lookup.search(query, key)}
    except Exception as e:
        raise HTTPException(502, f"搜尋失敗：{type(e).__name__}: {e}")


@app.post("/api/lookup/ask")
async def lookup_ask(body: dict = Body(...)):
    """先搜尋一次，再把結果與會議上下文交給模型整理（理由見 lib/lookup.py 檔頭）。"""
    text = live_hub.clean_text(str(body.get("text", ""))).strip()
    if not text:
        raise HTTPException(400, "沒有要問的文字")
    results, note = [], ""
    key = settings.key("serper_api_key")
    if key:
        try:
            results = await asyncio.to_thread(lookup.search, text, key)
        except Exception as e:
            note = f"這次沒搜尋到網路（{type(e).__name__}），以下只根據會議內容"
    else:
        note = "還沒填搜尋金鑰（「設定」可以填），以下只根據會議內容"
    # 上下文：會議工作區這場的字幕；沒有的話才看 OwnVoice 正在寫的逐字稿。
    try:
        # 讀檔放到執行緒：這個端點在事件迴圈上跑，不能讓即時字幕等磁碟。
        context = LIVE.transcript_tail() or await asyncio.to_thread(ownvoice.live_transcript)
        # 搜尋結果與逐字稿是外來文字，可能帶壞掉的半個字元；送出前清掉，否則整個請求會編碼失敗。
        user = live_hub.clean_text(lookup.ask_user(text, context, results))
        answer = await LIVE.ask(lookup.ASK_SYSTEM, user)
    except TranslateError as e:
        raise HTTPException(502, f"問 AI 失敗：{e}")
    except Exception as e:
        raise HTTPException(502, f"問 AI 失敗：{type(e).__name__}")
    sources = [{"n": i, "title": r["title"], "link": r["link"]} for i, r in enumerate(results, 1)]
    return {"answer": answer, "sources": sources, "note": note}


@app.get("/mindmap", response_class=HTMLResponse)
def mindmap_page():
    return _page("mindmap.html")


def _mindmap_source(job: str, session: str) -> tuple:
    """回傳 (逐字稿, 心智圖存檔路徑)。job = 會後的正式逐字稿；session = OwnVoice 目前為止的逐字稿。"""
    if job:
        job_dir = _job_dir(job)
        for name in ("diarized.txt", "merged.txt"):     # 有分角色的版本就用它
            path = os.path.join(job_dir, name)
            if os.path.exists(path):
                with open(path, encoding="utf-8") as f:
                    return f.read(), os.path.join(job_dir, "mindmap.json")
        raise HTTPException(404, "逐字稿還沒產生（轉錄完成後才能做心智圖）")
    session_id = os.path.basename(_ownvoice(ownvoice.session_dir, session or "latest"))
    transcript = ownvoice.read_text(session_id, "transcript.md")
    if not transcript.strip():
        raise HTTPException(404, "OwnVoice 還沒寫出逐字稿（存檔模式要開，而且至少說完一句話）")
    # OwnVoice 的資料夾只讀不寫，會議中的心智圖存在自己的 jobs/ 底下
    return transcript, os.path.join(JOBS_DIR, "ownvoice-mindmaps", f"{session_id}.json")


@app.get("/api/mindmap")
def mindmap_get(job: str = "", session: str = ""):
    """已經產生過就回那張圖；還沒有回 tree=null，頁面顯示產生的做法。"""
    _, path = _mindmap_source(job, session)
    tree = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            tree = json.load(f)
    return {"tree": tree, "has_api_key": settings.has_api_key()}


@app.get("/api/mindmap/prompt")
def mindmap_prompt(job: str = "", session: str = ""):
    return PlainTextResponse(mindmap.build_prompt(_mindmap_source(job, session)[0]))


@app.post("/api/mindmap")
def mindmap_make(body: dict = Body(...)):
    """body.text = 貼回的 AI 回覆（零費用）；沒給就用設定頁的 key 呼叫 API（計費，逐字稿會送出去）。"""
    transcript, path = _mindmap_source(str(body.get("job", "")), str(body.get("session", "")))
    pasted = str(body.get("text", "")).strip()
    if pasted:
        try:
            tree = mindmap.parse_tree(pasted)
        except ValueError as e:      # json.JSONDecodeError 也是 ValueError
            raise HTTPException(400, f"貼回的內容看不懂：{e}")
    else:
        api_key = settings.get_api_key()
        if not api_key:
            raise HTTPException(400, "還沒在「設定」填 Anthropic 金鑰；請用「複製 prompt → 貼回」的做法")
        try:
            tree = mindmap.generate(transcript, api_key)
        except Exception as e:
            raise HTTPException(502, f"產生失敗：{type(e).__name__}: {e}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp{os.getpid()}.{threading.get_ident()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return {"tree": tree}


@app.post("/api/video/transcribe")
async def video_transcribe(file: UploadFile = File(...), model: str = "large-v3", authorization: str = Header(default=""),
                           gpu: _BatchGpu = Depends(_batch_gpu)):
    """Local-only Whisper worker boundary for video captions.

    The caller uploads the source bytes; the worker never fetches arbitrary URLs.
    Poll ``/api/status/{job_id}`` and download transcript_json/srt/vtt when done.
    """
    expected_token = os.environ.get("VIDEO_WORKER_TOKEN", "").strip()
    if expected_token and authorization != f"Bearer {expected_token}":
        raise HTTPException(401, "invalid worker token")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"不支援的副檔名 {ext}；允許：{', '.join(sorted(ALLOWED_EXT))}")
    if not model or len(model) > 64 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in model):
        raise HTTPException(400, "invalid model")
    job_id = uuid.uuid4().hex[:12]
    job_dir = os.path.join(JOBS_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    media_path = os.path.join(job_dir, f"input{ext}")
    size = 0
    try:
        with open(media_path, "wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_MB * 1024 * 1024:
                    raise HTTPException(413, f"檔案超過 {MAX_UPLOAD_MB}MB 上限")
                out.write(chunk)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    gpu.start(run_video_transcription, job_dir, media_path, model_name=model)
    return {"job_id": job_id, "kind": "video_transcription"}


@app.get("/api/settings")
def get_settings():
    """全部設定；金鑰只回遮罩與來源，絕不回明文（見 lib/settings.py public）。"""
    return settings.public()


@app.put("/api/settings")
@app.post("/api/settings")      # 舊頁面用 POST 存 key，同一個函式
def save_settings(body: dict = Body(...)):
    """部分更新：只送要改的欄位；未知欄位、型別或長度不對回 400，整包不寫。金鑰空字串＝清除。"""
    try:
        return settings.update(body)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except OSError as e:
        raise HTTPException(503, str(e))


@app.post("/api/settings/check")
def check_folder(body: dict = Body(...)):
    """設定面板的「檢查」：{path, recording}；recording＝錄音存檔資料夾（不可在雲端同步資料夾底下）。"""
    return paths.check(str(body.get("path", ""))[:paths.MAX_LEN + 8], body.get("recording") is True)


@app.get("/api/settings/folders")
def folder_shortcuts():
    """設定面板的捷徑按鈕：「文件」、偵測到的 Google Drive（只給輸出目的地用），以及 OwnVoice 的預設資料夾（顯示用）。"""
    return {"documents": paths.documents(), "drives": paths.drive_roots(), "ownvoice": ownvoice.base_dir()}


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
