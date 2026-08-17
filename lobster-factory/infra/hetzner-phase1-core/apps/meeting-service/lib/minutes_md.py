"""minutes dict -> 可讀的會議記錄 Markdown。PPT 是拿來報告的，這支是拿來存檔傳閱的。"""

PRI = {"high": "🔴 高", "medium": "🟡 中", "low": "🟢 低"}


def render(m: dict) -> str:
    L = []
    L.append(f"# {m.get('title','會議記錄')}\n")

    L.append("| | |")
    L.append("|---|---|")
    L.append(f"| **日期** | {m.get('date','—')} |")
    L.append(f"| **時長** | {m.get('duration_min','—')} 分鐘 |")
    L.append(f"| **出席** | {'、'.join(m.get('attendees',[])) or '—'} |")
    dec, act = len(m.get("decisions", [])), len(m.get("actions", []))
    L.append(f"| **產出** | {dec} 項決議、{act} 項待辦 |")
    L.append("")

    if m.get("_provenance"):
        L.append("> **資料來源與限制**")
        L.append(f"> {m['_provenance']}")
        L.append("")

    L.append("---\n")
    L.append("## 一、三句話結論\n")
    for i, t in enumerate(m.get("tldr", []), 1):
        L.append(f"{i}. {t}")
    L.append("")

    if m.get("decisions"):
        L.append("## 二、決議事項\n")
        L.append("| # | 決議 | 負責 | 理由 |")
        L.append("|---|------|------|------|")
        for i, d in enumerate(m["decisions"], 1):
            L.append(f"| {i} | **{d.get('what','')}** | {d.get('owner','—')} | {d.get('rationale','—')} |")
        L.append("")

    if m.get("actions"):
        L.append("## 三、待辦事項\n")
        L.append("| # | 待辦 | 負責人 | 期限 | 優先 |")
        L.append("|---|------|--------|------|------|")
        for i, a in enumerate(m["actions"], 1):
            p = PRI.get(str(a.get("priority", "medium")).lower(), a.get("priority", ""))
            L.append(f"| {i} | {a.get('task','')} | {a.get('owner','—')} | {a.get('due','—')} | {p} |")
        L.append("")

    if m.get("topics"):
        L.append("## 四、討論內容\n")
        for i, t in enumerate(m["topics"], 1):
            L.append(f"### 4.{i}　{t.get('heading','')}\n")
            for p in t.get("points", []):
                L.append(f"- {p}")
            for q in t.get("quotes", []) or []:
                L.append("")
                L.append(f"> 「{q.get('text','')}」")
                L.append(f"> — {q.get('speaker','')}　`{q.get('t','')}`")
            L.append("")

    if m.get("open_questions"):
        L.append("## 五、未決事項\n")
        for q in m["open_questions"]:
            L.append(f"- [ ] {q}")
        L.append("")

    if m.get("risks"):
        L.append("## 六、風險\n")
        for i, r in enumerate(m["risks"], 1):
            L.append(f"{i}. ⚠️ {r}")
        L.append("")

    c = m.get("coaching", {})
    if c:
        per = c.get("per_slide", [])
        total = sum(x.get("seconds", 0) for x in per)
        L.append("---\n")
        L.append("## 附錄：簡報大綱\n")
        L.append(f"共 {len(per)} 頁，目標時長 {total//60} 分 {total%60} 秒。完整講稿見報告教練檔與 PPT 備忘稿。\n")
        L.append("| 頁 | 這頁要達成什麼 | 秒數 |")
        L.append("|---|---------------|------|")
        for i, n in enumerate(per, 1):
            L.append(f"| {i} | {n.get('goal','')} | {n.get('seconds',0)} |")
        L.append("")

    return "\n".join(L) + "\n"


def write(m: dict, path: str) -> str:
    text = render(m)
    # 走 Google Drive 同步的 .md 需 UTF-8 BOM；本地產出一律加，成本為零
    with open(path, "w", encoding="utf-8-sig") as f:
        f.write(text)
    return path
