"""會議錄音 -> 逐字稿 -> 講者分離 -> 摘要（人工回路或 API 二選一）-> PPT -> 報告教練。

摘要階段兩條路並存：
  - 人工回路（預設，零費用）：phase1 結束停在 stage="awaiting_summary"，
    使用者把 prompt.txt 複製到任一 AI 對話（用既有訂閱，非 API 計費），
    JSON 貼回頁面觸發 resume_after_summary()。
  - API 模式（2026-08-20 新增，選填）：上傳時勾選 use_api 且已在設定頁填
    API key，phase1 內直接呼叫 summarize.summarize_via_api()，一路做完，
    不停在 awaiting_summary。這是給客戶端用的——客戶碰不到操作者的
    Claude Code 對話視窗，「人工回路」對客戶不成立。真的會計費。

    API 呼叫失敗時**不判定整個 job 失敗**——退回 awaiting_summary，
    prompt.txt 已經寫好，使用者仍可手動貼上完成，轉錄/分離的工作不浪費。

單一 job 目錄隔離所有輸出，每個階段更新 status.json 供 app.py 輪詢。
"""
import json
import os
import time
import traceback

from lib import archive, deck, diarize, excel, hallucination, keep_awake, merge_segments, minutes_md, settings, speaker_notes, summarize
from lib.transcribe import transcribe, write_srt


class JobLogger:
    def __init__(self, job_dir: str):
        self.path = os.path.join(job_dir, "log.txt")
        self._f = open(self.path, "a", encoding="utf-8")

    def __call__(self, msg: str):
        print(msg, flush=True)
        self._f.write(msg + "\n")
        self._f.flush()

    def close(self):
        self._f.close()


def _status_path(job_dir: str) -> str:
    return os.path.join(job_dir, "status.json")


def write_status(job_dir: str, **fields):
    path = _status_path(job_dir)
    cur = {}
    if os.path.exists(path):
        try:
            cur = json.load(open(path, encoding="utf-8"))
        except Exception:
            cur = {}
    cur.update(fields)
    cur["updated_at"] = time.time()
    json.dump(cur, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def run_pipeline_phase1(job_dir: str, media_path: str, model_name: str = "large-v3",
                         do_diarize: bool = True, sync_drive: bool = False,
                         use_api: bool = False) -> None:
    """呼叫端（app.py）用背景執行緒跑這個函式。結束時 stage 為
    awaiting_summary（成功）或 error（失敗），不會是 done。

    sync_drive 在上傳當下就決定（勾選框），要持久化到 status.json，
    因為 resume_after_summary() 是後續另一次 HTTP 請求才觸發，
    中間隔著使用者去別的對話貼摘要，不能靠記憶體變數傳遞。"""
    log = JobLogger(job_dir)
    write_status(job_dir, stage="preflight", error=None, done=False, started_at=time.time(),
                 sync_drive=sync_drive)
    keep_awake.prevent_sleep()

    try:
        write_status(job_dir, stage="transcribe")
        result = transcribe(media_path, model_name=model_name, log=log)
        json.dump(result, open(os.path.join(job_dir, "transcript.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        write_srt(result["segments"], os.path.join(job_dir, "transcript.srt"))
        write_status(job_dir, transcribe_stats={
            "audio_duration_sec": result["audio_duration_sec"],
            "realtime_factor": result["realtime_factor"],
            "backend": result["backend"],
        })

        write_status(job_dir, stage="merge")
        merged = merge_segments.merge(result["segments"])
        with open(os.path.join(job_dir, "merged.txt"), "w", encoding="utf-8") as f:
            for m in merged:
                mm, ss = int(m["start"] // 60), int(m["start"] % 60)
                f.write(f"[{mm:02d}:{ss:02d}] {m['text']}\n")

        write_status(job_dir, stage="hallucination_check")
        _, hall_stats = hallucination.suspect_ids(result["segments"])
        json.dump(hall_stats, open(os.path.join(job_dir, "hallucination_stats.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        log(f"[幻覺偵測] 可疑段落 {hall_stats['suspect_pct_segments']}% / "
            f"可疑文字 {hall_stats['suspect_pct_chars']}%")

        turns = speakers = overlap_sec = None
        if do_diarize:
            write_status(job_dir, stage="diarize")
            try:
                spans_cache = os.path.join(job_dir, "diarize_spans.json")
                dr = diarize.diarize(media_path, result["segments"], spans_cache_path=spans_cache, log=log)
                turns, speakers, overlap_sec = dr["turns"], dr["speakers"], dr["overlap_sec"]
                with open(os.path.join(job_dir, "diarized.txt"), "w", encoding="utf-8") as f:
                    for t in turns:
                        mm, ss = int(t["start"] // 60), int(t["start"] % 60)
                        f.write(f"[{mm:02d}:{ss:02d}] {t['speaker']}：{t['text']}\n")
                write_status(job_dir, diarize_stats={"speakers": speakers, "overlap_sec": overlap_sec,
                                                      "turns": len(turns)})
            except Exception as e:
                log(f"[warn] 講者分離失敗，改用未分離逐字稿繼續: {type(e).__name__}: {e}")
                write_status(job_dir, diarize_error=str(e))

        write_status(job_dir, stage="preparing_prompt")
        transcript_text = summarize.build_transcript_text(turns=turns, merged=merged)
        prompt = summarize.build_prompt(
            transcript_text, result["audio_duration_sec"],
            hallucination_stats=hall_stats, overlap_sec=overlap_sec, speakers=speakers,
        )
        # 無論走哪條路都先寫 prompt.txt——API 模式失敗時退回人工回路，
        # 轉錄/分離的工作不能因為 API 出錯就整份作廢。
        with open(os.path.join(job_dir, "prompt.txt"), "w", encoding="utf-8") as f:
            f.write(prompt)
        log(f"[prompt] {len(prompt)} 字元 -> prompt.txt")

        api_key = settings.get_api_key() if use_api else ""
        if use_api and api_key:
            try:
                write_status(job_dir, stage="summarize_via_api")
                minutes = summarize.summarize_via_api(
                    transcript_text, result["audio_duration_sec"], api_key,
                    hallucination_stats=hall_stats, overlap_sec=overlap_sec,
                    speakers=speakers, log=log,
                )
                errs = _finalize_from_minutes(job_dir, minutes, log)
                if not errs:
                    return  # 外層 finally 會處理 allow_sleep/log.close
                # 理論上不會發生：summarize_via_api 內部已用同一個
                # validate() 把關過。留這段是防禦性的，不是預期路徑。
                raise RuntimeError(f"API 產生的摘要未通過最終驗證: {errs}")
            except Exception as e:
                log(f"[warn] API 自動摘要失敗，退回人工回路: {type(e).__name__}: {e}")
                write_status(job_dir, api_error=f"{type(e).__name__}: {e}")

        log("[prompt] 等待貼上摘要結果")
        write_status(job_dir, stage="awaiting_summary", done=False)

    except Exception as e:
        tb = traceback.format_exc()
        log(f"[FAIL] {type(e).__name__}: {e}\n{tb}")
        write_status(job_dir, stage="error", error=f"{type(e).__name__}: {e}", done=True)
    finally:
        # awaiting_summary 這段使用者在操作瀏覽器（複製/貼上），本身會產生
        # 滑鼠鍵盤活動重置 Windows 閒置計時，不需要人工續命；只有這段無人值守
        # 的自動化區間需要 prevent_sleep。
        keep_awake.allow_sleep()
        log.close()


def _finalize_from_minutes(job_dir: str, minutes: dict, log) -> list:
    """從已驗證通過的 minutes JSON 做完 PPT/教練稿/會議記錄/Excel/Drive 同步到
    done。resume_after_summary()（人工回路）與 run_pipeline_phase1() 的 API
    分支共用這段，避免兩條路各寫一份建置邏輯而彼此漂移。

    回傳驗證錯誤清單；非空代表未寫任何檔案。呼叫端負責 keep_awake/log 生命週期，
    這裡不管。"""
    errs = summarize.validate(minutes)
    if errs:
        log(f"[驗證失敗] {'; '.join(errs)}")
        return errs

    json.dump(minutes, open(os.path.join(job_dir, "minutes.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    write_status(job_dir, stage="build_deck")
    pptx_path = os.path.join(job_dir, "slides.pptx")
    n_slides = deck.build(minutes, pptx_path)
    log(f"[PPT] {n_slides} 頁 -> {pptx_path}")

    write_status(job_dir, stage="build_notes")
    speaker_notes.attach_notes(pptx_path, minutes["coaching"])
    speaker_notes.write_coach_md(minutes["coaching"], minutes, os.path.join(job_dir, "coach.md"))

    write_status(job_dir, stage="build_minutes_md")
    minutes_md.write(minutes, os.path.join(job_dir, "meeting_notes.md"))

    write_status(job_dir, stage="build_excel")
    excel.build(minutes, os.path.join(job_dir, "meeting_record.xlsx"))
    log("[Excel] 五個工作表 -> meeting_record.xlsx")

    sync_drive = json.load(open(_status_path(job_dir), encoding="utf-8")).get("sync_drive", False)
    if sync_drive:
        write_status(job_dir, stage="sync_drive")
        result = archive.sync_to_drive(job_dir, minutes, os.path.basename(job_dir))
        if result["ok"]:
            log(f"[Drive 同步] {len(result['files'])} 個檔案 -> {result['dest']}")
        else:
            log(f"[warn] Drive 同步失敗（本地產出不受影響）: {result['error']}")
        write_status(job_dir, drive_sync_result=result)

    write_status(job_dir, stage="done", done=True, finished_at=time.time())
    log("[完成] 全流程結束")
    return []


def resume_after_summary(job_dir: str, minutes: dict) -> list:
    """回傳驗證錯誤清單；非空代表未寫任何檔案，呼叫端應把錯誤顯示給使用者
    讓他們拿去要求重新生成，而不是硬吞壞資料。"""
    log = JobLogger(job_dir)
    keep_awake.prevent_sleep()
    try:
        return _finalize_from_minutes(job_dir, minutes, log)
    except Exception as e:
        tb = traceback.format_exc()
        log(f"[FAIL] {type(e).__name__}: {e}\n{tb}")
        write_status(job_dir, stage="error", error=f"{type(e).__name__}: {e}", done=True)
        return [f"{type(e).__name__}: {e}"]
    finally:
        keep_awake.allow_sleep()
        log.close()
