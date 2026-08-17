"""會議錄音 -> 逐字稿 -> 講者分離 -> 會議記錄 -> PPT -> 報告教練，全流程。

單一 job 目錄隔離所有輸出（scratchpad 版本是直接寫在音檔旁邊，多工作會互踩）。
每個階段更新 status.json，供 app.py 輪詢；log.txt 累積完整輸出。

僅本機執行（需 GPU）。見 README.md「為什麼不部署」。
"""
import json
import os
import time
import traceback

from lib import deck, diarize, hallucination, merge_segments, minutes_md, speaker_notes, summarize
from lib.transcribe import transcribe, write_srt

STAGES = [
    "preflight", "transcribe", "merge", "hallucination_check",
    "diarize", "summarize", "build_deck", "build_notes", "build_minutes_md", "done",
]


class JobLogger:
    def __init__(self, job_dir: str):
        self.path = os.path.join(job_dir, "log.txt")
        self._f = open(self.path, "a", encoding="utf-8")

    def __call__(self, msg: str):
        line = f"{msg}"
        print(line, flush=True)
        self._f.write(line + "\n")
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


def run_pipeline(job_dir: str, media_path: str, model_name: str = "large-v3",
                  do_diarize: bool = True) -> None:
    """同步執行；呼叫端（app.py）用 BackgroundTasks 在背景執行緒跑這個函式。"""
    log = JobLogger(job_dir)
    write_status(job_dir, stage="preflight", error=None, done=False, started_at=time.time())

    try:
        # 1) 轉錄
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

        # 2) 段落合併（僅供人讀逐字稿，不影響摘要輸入）
        write_status(job_dir, stage="merge")
        merged = merge_segments.merge(result["segments"])
        with open(os.path.join(job_dir, "merged.txt"), "w", encoding="utf-8") as f:
            for m in merged:
                mm, ss = int(m["start"] // 60), int(m["start"] % 60)
                f.write(f"[{mm:02d}:{ss:02d}] {m['text']}\n")

        # 3) 幻覺偵測（統計供摘要 prompt 參考，不自動刪除逐字稿內容）
        write_status(job_dir, stage="hallucination_check")
        _, hall_stats = hallucination.suspect_ids(result["segments"])
        json.dump(hall_stats, open(os.path.join(job_dir, "hallucination_stats.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        log(f"[幻覺偵測] 可疑段落 {hall_stats['suspect_pct_segments']}% / "
            f"可疑文字 {hall_stats['suspect_pct_chars']}%")

        # 4) 講者分離（可選；需 HF_TOKEN + GPU 建議）
        turns = None
        speakers = None
        overlap_sec = None
        if do_diarize:
            write_status(job_dir, stage="diarize")
            try:
                spans_cache = os.path.join(job_dir, "diarize_spans.json")
                dr = diarize.diarize(media_path, result["segments"], spans_cache_path=spans_cache, log=log)
                turns = dr["turns"]
                speakers = dr["speakers"]
                overlap_sec = dr["overlap_sec"]
                with open(os.path.join(job_dir, "diarized.txt"), "w", encoding="utf-8") as f:
                    for t in turns:
                        mm, ss = int(t["start"] // 60), int(t["start"] % 60)
                        f.write(f"[{mm:02d}:{ss:02d}] {t['speaker']}：{t['text']}\n")
                write_status(job_dir, diarize_stats={"speakers": speakers, "overlap_sec": overlap_sec,
                                                      "turns": len(turns)})
            except Exception as e:
                # 講者分離失敗不該讓整條管線掛掉——退回無講者標籤繼續跑
                log(f"[warn] 講者分離失敗，改用未分離逐字稿繼續: {type(e).__name__}: {e}")
                write_status(job_dir, diarize_error=str(e))

        # 5) 摘要（Claude API）
        write_status(job_dir, stage="summarize")
        transcript_text = summarize.build_transcript_text(turns=turns, merged=merged)
        minutes = summarize.summarize(
            transcript_text, result["audio_duration_sec"],
            hallucination_stats=hall_stats, overlap_sec=overlap_sec, speakers=speakers, log=log,
        )
        json.dump(minutes, open(os.path.join(job_dir, "minutes.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)

        # 6) PPT
        write_status(job_dir, stage="build_deck")
        pptx_path = os.path.join(job_dir, "slides.pptx")
        n_slides = deck.build(minutes, pptx_path)
        log(f"[PPT] {n_slides} 頁 -> {pptx_path}")

        # 7) 講稿寫入備忘稿 + 報告教練文件
        write_status(job_dir, stage="build_notes")
        speaker_notes.attach_notes(pptx_path, minutes["coaching"])
        coach_path = os.path.join(job_dir, "coach.md")
        speaker_notes.write_coach_md(minutes["coaching"], minutes, coach_path)

        # 8) 會議記錄 Markdown
        write_status(job_dir, stage="build_minutes_md")
        minutes_md.write(minutes, os.path.join(job_dir, "meeting_notes.md"))

        write_status(job_dir, stage="done", done=True, finished_at=time.time())
        log("[完成] 全流程結束")

    except Exception as e:
        tb = traceback.format_exc()
        log(f"[FAIL] {type(e).__name__}: {e}\n{tb}")
        write_status(job_dir, stage="error", error=f"{type(e).__name__}: {e}", done=True)
    finally:
        log.close()
