"""minutes dict -> .docx（會議記錄 + 報告教練稿）。

**這支是所有文件類輸出的唯一格式**（2026-08-27 操作者決定）：原本會議記錄與
教練稿各出一份 `.md`，但操作者不需要 markdown——客戶端傳閱、加註、追蹤修訂、
轉 PDF 寄出，實際用的都是 Word。`.md` 版已停止產出，`minutes_md.py` 與
`speaker_notes.write_coach_md()` 隨之刪除，不留兩套會漂移的渲染邏輯。

  build()       -> 會議記錄（原 minutes_md.render() 的六章節 + 附錄）
  build_coach() -> 報告教練稿（原 write_coach_md() 的四個段落）

注意兩者的資料來源相同（同一份 minutes dict），所以內容一致性由 summarize
階段保證，這裡只負責排版。逐字稿仍是 `.txt`（純文字本來就該是純文字，
Word 化只會讓搜尋與 diff 變難），不在本模組範圍。

品牌色與字型沿用 deck.py 的 token（同一份 next-admin lib/theme/tokens.ts 預設），
不另立一套。CJK 字型要手動寫 <w:rFonts w:eastAsia>，理由同 deck.py 的 set_font()：
python-docx 預設只設 ascii/hAnsi，中文會掉回新細明體。
"""
import unicodedata

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ACCENT = RGBColor(0x63, 0x66, 0xF1)
INK = RGBColor(0x0D, 0x15, 0x26)
MUTED = RGBColor(0x47, 0x55, 0x69)
RED = RGBColor(0xEF, 0x44, 0x44)
YELLOW = RGBColor(0xB4, 0x7A, 0x08)  # md/pptx 的黃在白底 Word 上對比不足，壓深
GREEN = RGBColor(0x0F, 0x8A, 0x62)

# 版面設定（2026-08-27 操作者指定）：A4 / 邊界 2cm / 行高 1.15 / Noto Sans TC
FONT_EA = "Noto Sans TC"
FONT_LAT = "Noto Sans TC"
PAGE_W_CM = 21.0
PAGE_H_CM = 29.7
MARGIN_CM = 2.0
LINE_SPACING = 1.15
# 可用內文寬度 = A4 寬 - 左右邊界 = 21 - 4 = 17cm。表格欄寬依此分配，
# 不再用先前寫死的 6.5 吋（那是 Letter 1 吋邊界的數字，A4 下會偏窄）。
CONTENT_W_CM = PAGE_W_CM - MARGIN_CM * 2

PRI = {"high": ("高", RED), "medium": ("中", YELLOW), "low": ("低", GREEN)}

WPM_ZH = 240  # 中文口語每分鐘字數，正式簡報建議 220-260（與 speaker_notes.py 同值）

# 欄寬夾限：避免編號欄被壓到看不見、或超長句子吃掉整張表
COL_MIN_RATIO = 0.08
COL_MAX_RATIO = 0.55


def _style_run(run, size=11, bold=False, color=INK, italic=False):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = FONT_LAT
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = rPr.makeelement(qn("w:rFonts"), {})
        rPr.append(rFonts)
    rFonts.set(qn("w:eastAsia"), FONT_EA)
    rFonts.set(qn("w:ascii"), FONT_LAT)
    rFonts.set(qn("w:hAnsi"), FONT_LAT)


def _para(doc, text="", size=11, bold=False, color=INK, italic=False,
          space_after=6, align=None, style=None):
    p = doc.add_paragraph(style=style)
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    if text:
        _style_run(p.add_run(text), size=size, bold=bold, color=color, italic=italic)
    return p


def _heading(doc, text, size=15):
    p = _para(doc, text, size=size, bold=True, color=ACCENT, space_after=4)
    p.paragraph_format.space_before = Pt(14)
    return p


def _display_width(s: str) -> int:
    """視覺寬度：CJK 字元佔兩個西文字元寬。用字數當欄寬依據時，若不區分中英，
    「業界流傳的出大包事件」會被當成 11 單位、"2.54 pitch pin header" 被當成
    21 單位，導致中文欄被嚴重壓縮。"""
    w = 0
    for ch in str(s):
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F", "A") else 1
    return w


def _fit_ratios(widths):
    """把內容量換算成欄寬比例，總和恰為 1 且每欄都落在 [COL_MIN, COL_MAX]。

    用 water-filling 迭代，不是「夾限後再正規化」——後者會把夾限本身撤銷掉：
    正規化的除法讓被釘在上限的欄又漲回去（實測 metadata 表 0.55 → 0.752），
    也讓未被釘住的欄被壓到下限之下（決議表 # 欄 0.08 → 0.072）。程式碼宣稱
    有上下限、實際沒有，正是「限制器被靜默關掉」的形狀（2026-08-27 critic）。

    做法：每輪把超限的欄釘住並固定其配額，剩餘寬度只在未釘住的欄之間依原始
    權重重新分配，直到沒有新的欄超限（最多 n 輪必收斂，因為每輪至少釘住一欄）。
    """
    n = len(widths)
    if n == 0:
        return []
    equal = [1.0 / n] * n

    # 可行性：欄數太多時 COL_MIN*n 可能 > 1（下限塞不下）；欄數太少時
    # COL_MAX*n 可能 < 1（上限填不滿，例如單欄的 0.55）。兩種情況下限制
    # 本身無解，退化成等寬——這是唯一同時「總和為 1」且不偏袒任何欄的答案。
    if COL_MIN_RATIO * n >= 1 or COL_MAX_RATIO * n <= 1:
        return equal

    total = sum(widths)
    if total <= 0:
        return equal  # 全空內容，沒有可依據的權重

    ratios = [w / total for w in widths]
    # 夾限 → 算出總和缺口 → 只把缺口攤給「該方向還有空間」的欄 → 重複。
    # 每輪至少讓一欄觸限或讓缺口單調變小，n*4 輪是安全上界（實測最多 3 輪）。
    clamped = ratios
    for _ in range(n * 4):
        clamped = [min(COL_MAX_RATIO, max(COL_MIN_RATIO, r)) for r in ratios]
        diff = 1.0 - sum(clamped)
        if abs(diff) < 1e-12:
            return clamped
        if diff > 0:   # 還有寬度沒分完，給還沒到上限的欄
            adjustable = [i for i in range(n) if clamped[i] < COL_MAX_RATIO - 1e-12]
        else:          # 分超過了，從還沒到下限的欄收回
            adjustable = [i for i in range(n) if clamped[i] > COL_MIN_RATIO + 1e-12]
        if not adjustable:
            break      # 可行性已先檢查過，理論上到不了這裡
        share = diff / len(adjustable)
        ratios = list(clamped)
        for i in adjustable:
            ratios[i] += share
    return clamped


def _table(doc, headers, rows, total_width_cm=CONTENT_W_CM):
    """rows 的每格可以是 str，或 (str, RGBColor) 指定該格文字顏色。

    欄寬依實際內容量按比例分配（2026-08-27 操作者要求）。Word 預設的 autofit
    在 python-docx 產出的表格上表現不穩（常見所有欄等寬），所以改成關掉 autofit
    自己算：取每欄「標題與各儲存格的視覺寬度最大值」當權重，夾在 8%~55% 之間
    避免極端值（例如某欄全是編號時被壓到看不見，或某欄有超長句子時吃掉整張表）。

    寬度必須同時寫在 column 與每個 cell 上——Word 實際採用的是儲存格層級的
    tcW，只設 column.width 在多數檢視器會被忽略。
    """
    n = len(headers)
    widths = []
    for i in range(n):
        w = _display_width(headers[i])
        for row in rows:
            if i < len(row):
                val = row[i]
                text = val[0] if isinstance(val, tuple) else val
                w = max(w, _display_width(text))
        widths.append(w)

    ratios = _fit_ratios(widths)

    t = doc.add_table(rows=1, cols=n)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        _style_run(cell.paragraphs[0].add_run(h), size=10, bold=True, color=ACCENT)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            text, color = val if isinstance(val, tuple) else (val, INK)
            cells[i].text = ""
            _style_run(cells[i].paragraphs[0].add_run(str(text)), size=10, color=color)

    for i, ratio in enumerate(ratios):
        col_w = Cm(total_width_cm * ratio)
        t.columns[i].width = col_w
        for row in t.rows:
            row.cells[i].width = col_w
    return t


def _new_doc():
    """建立套好版面設定與 CJK 預設字型的空白文件。
    兩個 build 函式共用，避免各設一次而漂移。

    版面（操作者 2026-08-27 指定）：A4 直式 / 四邊邊界 2cm / 行高 1.15 /
    字型 Noto Sans TC。行高設在 Normal style 上而非逐段落設，這樣所有段落
    （含之後新增的）自動繼承，不會有人加了新段落卻忘了設行距。
    """
    doc = Document()

    for section in doc.sections:
        section.page_width = Cm(PAGE_W_CM)
        section.page_height = Cm(PAGE_H_CM)
        section.top_margin = Cm(MARGIN_CM)
        section.bottom_margin = Cm(MARGIN_CM)
        section.left_margin = Cm(MARGIN_CM)
        section.right_margin = Cm(MARGIN_CM)

    normal = doc.styles["Normal"]
    normal.font.name = FONT_LAT
    normal.font.size = Pt(11)
    # 預設樣式也要設 eastAsia，否則沒被 _style_run 走到的地方仍會掉字型。
    # 用 get_or_add_* 而非直接 .rPr.rFonts：後者只有在前面剛好設過 font.name
    # （順帶建出 rPr/rFonts 節點）時才不會是 None，等於隱性依賴敘述順序。
    normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), FONT_EA)
    normal.paragraph_format.line_spacing = LINE_SPACING
    return doc


def build_coach(coaching: dict, minutes: dict, out_path: str) -> str:
    """報告教練稿 -> .docx。段落結構與原 speaker_notes.write_coach_md() 一致：
    開場鉤子 / 逐頁節奏（含語速檢查）/ 預期問答 / 表達提醒 / 練習方式。"""
    doc = _new_doc()
    per = coaching.get("per_slide", []) or []
    total_s = sum(n.get("seconds", 0) for n in per)

    _para(doc, f"報告教練 — {minutes.get('title', '')}", size=20, bold=True,
          space_after=6, align=WD_ALIGN_PARAGRAPH.CENTER)
    _para(doc, f"總時長目標：{total_s // 60} 分 {total_s % 60} 秒　|　頁數：{len(per)}",
          size=10, color=MUTED, space_after=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    if coaching.get("opening_hook"):
        _heading(doc, "開場鉤子")
        hp = _para(doc, f"「{coaching['opening_hook']}」", size=12, color=ACCENT,
                   italic=True, space_after=4)
        hp.paragraph_format.left_indent = Pt(18)
        _para(doc, "開場 30 秒決定聽眾要不要聽下去。先講結論或先講痛點，不要先自我介紹。",
              size=10, color=MUTED)

    if per:
        _heading(doc, "逐頁節奏")
        rows = []
        for i, n in enumerate(per, 1):
            chars = len(n.get("script", "") or "")
            sec = n.get("seconds", 0) or 0
            need = chars / WPM_ZH * 60
            # 語速檢查與 md 版同一套判準：誤差 25% 內算過關
            if sec == 0 or abs(need - sec) <= sec * 0.25:
                flag, color = "OK", GREEN
            elif need > sec:
                flag, color = "太趕", RED
            else:
                flag, color = "太空", YELLOW
            rows.append([i, n.get("goal", "")[:28], sec, chars, (flag, color)])
        _table(doc, ["#", "頁面目標", "秒數", "講稿字數", "語速檢查"], rows)

        _heading(doc, "逐頁講稿")
        for i, n in enumerate(per, 1):
            _para(doc, f"第 {i} 頁　{n.get('goal', '')}", size=12, bold=True, space_after=3)
            if n.get("script"):
                sp = _para(doc, n["script"], space_after=3)
                sp.paragraph_format.left_indent = Pt(18)
            meta = []
            if n.get("seconds"):
                meta.append(f"目標 {n['seconds']} 秒（{len(n.get('script', '') or '')} 字）")
            if n.get("transition"):
                meta.append(f"轉場：{n['transition']}")
            if meta:
                mp = _para(doc, "　|　".join(meta), size=9, color=MUTED, space_after=2)
                mp.paragraph_format.left_indent = Pt(18)
            if n.get("watch_out"):
                wp = _para(doc, f"小心：{n['watch_out']}", size=9, color=RED, space_after=8)
                wp.paragraph_format.left_indent = Pt(18)

    if coaching.get("qa"):
        doc.add_page_break()
        _heading(doc, "預期問題與回答")
        for i, q in enumerate(coaching["qa"], 1):
            _para(doc, f"Q{i}. {q.get('q', '')}", size=12, bold=True, space_after=3)
            ap = _para(doc, q.get("a", ""), space_after=3)
            ap.paragraph_format.left_indent = Pt(18)
            if q.get("trap"):
                tp = _para(doc, f"陷阱：{q['trap']}", size=9, color=RED, space_after=8)
                tp.paragraph_format.left_indent = Pt(18)

    if coaching.get("delivery_tips"):
        _heading(doc, "表達提醒")
        for t in coaching["delivery_tips"]:
            _para(doc, t, style="List Bullet", space_after=2)

    if coaching.get("practice"):
        _heading(doc, "練習方式")
        for t in coaching["practice"]:
            _para(doc, t, style="List Bullet", space_after=2)

    doc.save(out_path)
    return out_path


def build(m: dict, out_path: str) -> str:
    doc = _new_doc()
    _para(doc, m.get("title", "會議記錄"), size=22, bold=True, color=INK,
          space_after=10, align=WD_ALIGN_PARAGRAPH.CENTER)

    dec = m.get("decisions", []) or []
    act = m.get("actions", []) or []
    _table(doc, ["項目", "內容"], [
        ["日期", m.get("date") or "—"],
        ["時長", f"{m.get('duration_min','—')} 分鐘"],
        ["出席", "、".join(m.get("attendees", []) or []) or "—"],
        ["產出", f"{len(dec)} 項決議、{len(act)} 項待辦"],
    ])

    if m.get("_provenance"):
        _para(doc, "")
        p = _para(doc, "資料來源與限制：", size=9, bold=True, color=MUTED, space_after=2)
        _style_run(p.add_run(m["_provenance"]), size=9, color=MUTED, italic=True)

    _heading(doc, "一、三句話結論")
    tldr = m.get("tldr", []) or []
    if tldr:
        for t in tldr:
            _para(doc, t, style="List Number", space_after=3)
    else:
        _para(doc, "（本次錄音內容不構成正式會議結論）", color=MUTED, italic=True)

    if dec:
        _heading(doc, "二、決議事項")
        _table(doc, ["#", "決議", "負責", "理由"],
               [[i, d.get("what", ""), d.get("owner", "—"), d.get("rationale", "—")]
                for i, d in enumerate(dec, 1)])

    if act:
        _heading(doc, "三、待辦事項")
        rows = []
        for i, a in enumerate(act, 1):
            label, color = PRI.get(str(a.get("priority", "medium")).lower(),
                                   (a.get("priority", "—"), INK))
            rows.append([i, a.get("task", ""), a.get("owner", "—"),
                         a.get("due", "—"), (label, color)])
        _table(doc, ["#", "待辦", "負責人", "期限", "優先"], rows)

    if m.get("topics"):
        _heading(doc, "四、討論內容")
        for i, t in enumerate(m["topics"], 1):
            _para(doc, f"4.{i}　{t.get('heading','')}", size=12, bold=True, space_after=3)
            for pt in t.get("points", []) or []:
                _para(doc, pt, style="List Bullet", space_after=2)
            for q in t.get("quotes", []) or []:
                qp = _para(doc, f"「{q.get('text','')}」", size=10, color=MUTED,
                           italic=True, space_after=1)
                qp.paragraph_format.left_indent = Pt(24)
                sp = _para(doc, f"— {q.get('speaker','')}　{q.get('t','')}",
                           size=9, color=MUTED, space_after=6)
                sp.paragraph_format.left_indent = Pt(24)

    if m.get("open_questions"):
        _heading(doc, "五、未決事項")
        for q in m["open_questions"]:
            _para(doc, f"☐ {q}", style="List Bullet", space_after=2)

    if m.get("risks"):
        _heading(doc, "六、風險")
        for r in m["risks"]:
            _para(doc, r, style="List Number", color=RED, space_after=2)

    c = m.get("coaching", {}) or {}
    per = c.get("per_slide", []) or []
    if per:
        doc.add_page_break()
        _heading(doc, "附錄：簡報大綱")
        total = sum(x.get("seconds", 0) for x in per)
        _para(doc, f"共 {len(per)} 頁，目標時長 {total//60} 分 {total%60} 秒。"
                   f"完整講稿見報告教練檔與 PPT 備忘稿。", size=10, color=MUTED)
        _table(doc, ["頁", "這頁要達成什麼", "秒數"],
               [[i, n.get("goal", ""), n.get("seconds", 0)] for i, n in enumerate(per, 1)])

    doc.save(out_path)
    return out_path
