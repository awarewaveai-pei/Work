"""會議錄音 -> 逐字稿 -> 講者分離 -> [人工貼上摘要] -> PPT -> 報告教練。

分兩段執行，中間停在「等待摘要」：
  run_pipeline_phase1() — preflight/transcribe/merge/hallucination/diarize，
    全自動、全本機、零費用。結束後寫 prompt.txt，stage="awaiting_summary"。
  resume_after_summary() — 使用者把 phase1 產生的 prompt 貼進任一 Claude 對話
    （用訂閱額度，非 API 計費），把回傳 JSON 貼回頁面觸發這段：
    build_deck/build_notes/build_minutes_md。

為什麼不是單一函式自動跑完：摘要階段需要 LLM 產生 tldr/decisions/topics/
coaching，若走 API 要另外付費；nested `claude -p` headless 呼叫在這個
Windows+Git Bash 環境下經三次真實測試不可靠（孤兒 process、stdout 斷裂）。
人工回路零額外花費、零環境賭注。

單一 job 目錄隔離所有輸出，每個階段更新 status.json 供 app.py 輪詢。
"""
import json
import os
import time
import traceback

from lib import deck, diarize, hallucination, merge_segments, minutes_md, speaker_notes, summarize
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
                         do_diarize: bool = True) -> None:
    """呼叫端（app.py）用背景執行緒跑這個函式。結束時 stage 為
    awaiting_summary（成功）或 error（失敗），不會是 done。"""
    log = JobLogger(job_dir)
    write_status(job_dir, stage="preflight", error=None, done=False, started_at=time.time())

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
        with open(os.path.join(job_dir, "prompt.txt"), "w", encoding="utf-8") as f:
            f.write(prompt)
        log(f"[prompt] {len(prompt)} 字元 -> prompt.txt，等待貼上摘要結果")

        write_status(job_dir, stage="awaiting_summary", done=False)

    except Exception as e:
        tb = traceback.format_exc()
        log(f"[FAIL] {type(e).__name__}: {e}\n{tb}")
        write_status(job_dir, stage="error", error=f"{type(e).__name__}: {e}", done=True)
    finally:
        log.close()


def resume_after_summary(job_dir: str, minutes: dict) -> list:
    """回傳驗證錯誤清單；非空代表未寫任何檔案，呼叫端應把錯誤顯示給使用者
    讓他們拿去要求重新生成，而不是硬吞壞資料。"""
    log = JobLogger(job_dir)
    try:
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

        write_status(job_dir, stage="done", done=True, finished_at=time.time())
        log("[完成] 全流程結束")
        return []

    except Exception as e:
        tb = traceback.format_exc()
        log(f"[FAIL] {type(e).__name__}: {e}\n{tb}")
        write_status(job_dir, stage="error", error=f"{type(e).__name__}: {e}", done=True)
        return [f"{type(e).__name__}: {e}"]
    finally:
        log.close()
