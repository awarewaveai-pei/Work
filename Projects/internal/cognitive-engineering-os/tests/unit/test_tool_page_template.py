"""docs/TOOL_PAGE_TEMPLATE.md describes what the product's code does, line by line. Every `file:line` it cites must be
a real line that still says what the template claims -- the template was written from rendered pages for four
revisions before anyone read the components (operator 2026-10-15: 「你到底有沒有去讀 那些網頁的code?」), and the
cited files (ResultPage.tsx above all) move every week.
- A citation is `<path>:<line>` or `<path>:<from>-<to>` in backticks; the path is a unique suffix of one file under
  the web app, ai_lego, docs or SPEC. A bare `:123` (file implied by the previous citation) is refused.
- ANCHORS maps each citation, spelled exactly as the template spells it, to text that occurs on exactly ONE line of
  the cited file, inside the cited range -- so the citation goes red as soon as that content moves (a substring that
  also sits on other lines would keep a stale number green). A citation with no anchor is refused (whoever adds a
  citation has read the line and can name it); an anchor whose citation is gone is refused too (stale table).
- Any `<name>.<ext>:<n>` counts, whatever the extension; only URLs (`://`) are skipped.
"""

from __future__ import annotations

import os
import re
import unittest
from pathlib import Path

COS = Path(__file__).resolve().parents[2]
SPEC = Path(os.environ.get("AI_LEGO_SPEC_ROOT") or COS.parents[2] / "agency-os" / "docs" / "AI_LEGO_Cognitive_Engineering_OS")
TEMPLATE = COS / "docs" / "TOOL_PAGE_TEMPLATE.md"
ROOTS = (COS / "apps" / "cognitive-web", COS / "ai_lego", COS / "docs", SPEC)
SKIP_PARTS = {"node_modules", ".next", "__pycache__"}
CITE = re.compile(r"`([^`\s]*?):(\d+)(?:-(\d+))?`")
PATH_LIKE = re.compile(r"\.[A-Za-z0-9]+$")

ANCHORS: dict[str, str] = {
    "RESEARCH_LINES_MASTER_PLAN.md:63": "| I11 |",
    "RESEARCH_LINES_MASTER_PLAN.md:214": "固定骨架",
    "RESEARCH_LINES_MASTER_PLAN.md:195": "| U15 |",
    "RESEARCH_LINES_MASTER_PLAN.md:328": "- 示意稿：任何示意稿改動",
    "five_whys.py:54": "cause_hypothesis_set: dict",
    "pareto.py:39": "cause_hypothesis_set: dict",
    "fishbone.py:75": "problem_statement: dict",
    "method-input-forms.yaml:27": 'events: {label: "① 事件',
    "methods/[id]/page.tsx:26-28": "怎麼讀",
    "methods/[id]/page.tsx:31-33": "沒有固定的下一步",
    "methods/[id]/page.tsx:37": "（平台維運用）",
    "method_form.py:510": "def build_method_form",
    "method_form.py:527": "_workflow_only",
    "method_form.py:545-547": "upstream = _upstream_method(",
    "MethodForm.tsx:116-119": "function examplePlaceholder",
    "MethodForm.tsx:58-68": "function UpstreamEditor",
    "RunPage.tsx:266": "layered={formIsUnits(",
    "RunPage.tsx:97": "const demoSet",
    "RunPage.tsx:205": "const showDemo",
    "RunPage.tsx:275": "<b>要花多少</b>",
    "LessonView.tsx:55": 'a[href*="#demo"]',
    "RunHeader.tsx:31-37": "guide && !lesson",
    "RunHeader.tsx:13": "U14",
    "ResultPage.tsx:23": "data-section = the card",
    "ResultPage.tsx:128": "const CASE_NOT_BUILT",
    "ResultPage.tsx:173": "const unitFields",
    "ResultPage.tsx:224-226": "const layers",
    "ResultPage.tsx:286": "const chartNote",
    "ResultPage.tsx:385-394": "demo: a click",
    "ResultPage.tsx:415-436": "③ 圖表分析",
    "ResultPage.tsx:442": "ownCharts.map((chart, index) => <figure",
    "ResultPage.tsx:456": "facts.seen",
    "ResultPage.tsx:461": "⑦ C 的追蹤指標",
    "ResultPage.tsx:463": "不分層",
    "ResultPage.tsx:473": "drawn?.table?.title",
    "ResultPage.tsx:475": "<th>出手方式</th>",
    "ResultPage.tsx:479": "drawn.table.note",
    "ResultPage.tsx:566-594": 'id="approve"',
}


def resolve(path: str) -> list[Path]:
    base = path.rsplit("/", 1)[-1]
    hits: list[Path] = []
    for root in ROOTS:
        for candidate in root.rglob(base):
            if SKIP_PARTS & set(candidate.parts) or not candidate.is_file():
                continue
            if candidate.as_posix().endswith("/" + path) and candidate not in hits:
                hits.append(candidate)
    return hits


def citations() -> list[tuple[int, str, str, int, int]]:
    """(template line, citation as spelled, path, from, to) for every backticked `path:line[-line]`."""
    out = []
    for n, line in enumerate(TEMPLATE.read_text(encoding="utf-8").splitlines(), 1):
        for m in CITE.finditer(line):
            path, a, b = m.group(1), int(m.group(2)), int(m.group(3) or m.group(2))
            if "://" in line[max(0, m.start() - 12):m.end()] or (path and not PATH_LIKE.search(path)):
                continue   # a URL's port, or `word:1` prose, is not a file citation
            out.append((n, f"{path}:{m.group(2)}" + (f"-{m.group(3)}" if m.group(3) else ""), path, a, b))
    return out


class ToolPageTemplateCitations(unittest.TestCase):
    def test_template_exists_and_cites_something(self):
        self.assertTrue(TEMPLATE.is_file(), TEMPLATE)
        self.assertGreater(len(citations()), 20)

    def test_no_bare_line_citation(self):
        bare = [(n, spelled) for n, spelled, path, _, _ in citations() if not path]
        self.assertEqual(bare, [], "cite `file:line`, never a bare `:line`: %r" % (bare,))

    def test_every_citation_is_a_real_line_that_says_what_the_anchor_names(self):
        problems = []
        for n, spelled, path, a, b in citations():
            if not path:
                continue
            anchor = ANCHORS.get(spelled)
            if anchor is None:
                problems.append((n, spelled, "no anchor in ANCHORS"))
                continue
            hits = resolve(path)
            if len(hits) != 1:
                problems.append((n, spelled, "%d files match; qualify the path" % len(hits)))
                continue
            lines = hits[0].read_text(encoding="utf-8", errors="replace").splitlines()
            if b > len(lines) or a < 1 or a > b:
                problems.append((n, spelled, "file has %d lines" % len(lines)))
                continue
            where = [i for i, text in enumerate(lines, 1) if anchor in text]
            if len(where) != 1:
                problems.append((n, spelled, "anchor %r is on %d lines of the file; pick text on exactly one" % (anchor, len(where))))
            elif not a <= where[0] <= b:
                problems.append((n, spelled, "anchor %r is on line %d, not %d-%d" % (anchor, where[0], a, b)))
        self.assertEqual(problems, [], "template line, citation, problem: %r" % (problems,))

    def test_anchor_table_has_no_stale_entry(self):
        spelled = {c[1] for c in citations()}
        stale = sorted(set(ANCHORS) - spelled)
        self.assertEqual(stale, [], "anchors whose citation left the template: %r" % (stale,))


if __name__ == "__main__":
    unittest.main()
