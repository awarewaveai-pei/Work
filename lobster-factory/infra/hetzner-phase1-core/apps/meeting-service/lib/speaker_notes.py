"""把講稿寫進 PPTX 備忘稿欄位，並輸出報告教練 markdown。"""
from pptx import Presentation

WPM_ZH = 240  # 中文口語每分鐘字數，正式簡報建議 220-260


def attach_notes(pptx_path: str, coaching: dict, out_path: str = None):
    prs = Presentation(pptx_path)
    slides = list(prs.slides)
    notes = coaching.get("per_slide", [])
    # 講稿以位置索引對應投影片。頁數一變就整體錯位，而且是靜默錯位
    # （第 N 頁拿到第 M 頁的稿）。數量不符一律硬失敗，不允許默默對錯。
    if len(notes) != len(slides):
        raise ValueError(
            f"講稿 {len(notes)} 段 != 投影片 {len(slides)} 頁；"
            f"位置索引會靜默錯位，請補齊後重跑"
        )
    for i, s in enumerate(slides):
        n = notes[i]
        body = []
        if n.get("goal"):
            body.append(f"【這頁要達成什麼】{n['goal']}")
        if n.get("script"):
            body.append(f"\n【講稿】\n{n['script']}")
        if n.get("seconds"):
            chars = len(n.get("script", ""))
            est = chars / WPM_ZH * 60
            body.append(f"\n【時間】目標 {n['seconds']} 秒（講稿 {chars} 字，語速 {WPM_ZH} 字/分 約需 {est:.0f} 秒）")
        if n.get("transition"):
            body.append(f"\n【轉場】{n['transition']}")
        if n.get("watch_out"):
            body.append(f"\n【小心】{n['watch_out']}")
        s.notes_slide.notes_text_frame.text = "\n".join(body)
    out = out_path or pptx_path
    prs.save(out)
    return out


def write_coach_md(coaching: dict, minutes: dict, path: str) -> str:
    per = coaching.get("per_slide", [])
    total_s = sum(n.get("seconds", 0) for n in per)
    lines = []
    lines.append(f"# 報告教練 — {minutes.get('title','')}\n")
    lines.append(f"**總時長目標**：{total_s//60} 分 {total_s%60} 秒　|　**頁數**：{len(per)}\n")

    if coaching.get("opening_hook"):
        lines.append("\n## 開場鉤子\n")
        lines.append(f"> {coaching['opening_hook']}\n")
        lines.append("\n開場 30 秒決定聽眾要不要聽下去。先講結論或先講痛點，不要先自我介紹。\n")

    lines.append("\n## 逐頁節奏\n")
    lines.append("| # | 頁面目標 | 秒數 | 講稿字數 | 語速檢查 |")
    lines.append("|---|---------|-----|---------|---------|")
    for i, n in enumerate(per, 1):
        chars = len(n.get("script", ""))
        sec = n.get("seconds", 0)
        need = chars / WPM_ZH * 60
        flag = "✅" if sec == 0 or abs(need - sec) <= sec * 0.25 else ("⚠ 太趕" if need > sec else "⚠ 太空")
        lines.append(f"| {i} | {n.get('goal','')[:28]} | {sec} | {chars} | {flag} |")

    if coaching.get("qa"):
        lines.append("\n## 預期問題與回答\n")
        for i, q in enumerate(coaching["qa"], 1):
            lines.append(f"\n**Q{i}. {q.get('q','')}**")
            lines.append(f"\n{q.get('a','')}\n")
            if q.get("trap"):
                lines.append(f"> ⚠ 陷阱：{q['trap']}\n")

    if coaching.get("delivery_tips"):
        lines.append("\n## 表達提醒\n")
        for t in coaching["delivery_tips"]:
            lines.append(f"- {t}")

    if coaching.get("practice"):
        lines.append("\n## 練習方式\n")
        for t in coaching["practice"]:
            lines.append(f"- {t}")

    text = "\n".join(lines) + "\n"
    # 走 Google Drive 同步的 .md 需 UTF-8 BOM，否則 Big5 系統 CJK 亂碼
    # （見 minutes_md.py 同一慣例；archive.py 會把這支直接複製進 Drive）
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(text)
    return path
