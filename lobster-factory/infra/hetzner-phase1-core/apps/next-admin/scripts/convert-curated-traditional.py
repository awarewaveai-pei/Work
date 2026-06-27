# Convert every zh/desc field in culture-curated.json from Simplified → Traditional (Taiwan).
# The LLM generator (generate-culture-curated.mjs) ignores the "Traditional Chinese" instruction
# for many entries, so run this ONCE after each generation. Deterministic (OpenCC s2tw).
#
# ⚠️ RUN EXACTLY ONCE on fresh generator output. OpenCC s2tw is NOT idempotent: a 2nd pass
# over-corrects proper nouns (里約→裡約, 岳飛→嶽飛, 濃郁→濃鬱). Workflow is always:
#   node scripts/generate-culture-curated.mjs --all   # writes raw (may contain Simplified)
#   python scripts/convert-curated-traditional.py      # cleans → Traditional, ONCE
# Never run this twice over the same file. If unsure, restore raw from git and re-run once.
#
#   pip install opencc-python-reimplemented
#   python scripts/convert-curated-traditional.py
import json, os, sys
from opencc import OpenCC

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "lib", "studio", "culture-curated.json")

# s2t (OpenCC Standard Traditional), NOT s2tw: s2tw's Taiwan-idiom layer over-corrects
# already-Traditional proper nouns (里約→裡約, 岳飛→嶽飛, 濃郁→濃鬱). s2t fixes genuine
# Simplified without touching those. We then apply a few unambiguous Taiwan preferences.
cc = OpenCC("s2t")
# Safe global Taiwan-preference swaps (these source chars have ONE Taiwan target, no context risk).
TW_PREF = {"麪": "麵", "裏": "裡"}
# Word-level fixes for proper nouns the AI sometimes writes with wrong Traditional VARIANTS
# (these are NOT Simplified — they're variant chars). Word-scoped so legit 裡/巖 elsewhere is safe.
WORD_FIX = {
    "裡約": "里約", "嶽飛": "岳飛", "濃鬱": "濃郁", "紀唸": "紀念",
    "烏幹達": "烏干達", "巖層": "岩層", "巖石": "岩石", "託爾": "托爾",
}

def to_traditional(v: str) -> str:
    t = cc.convert(v)
    for a, b in TW_PREF.items():
        t = t.replace(a, b)
    for a, b in WORD_FIX.items():
        t = t.replace(a, b)
    return t

with open(OUT, encoding="utf-8") as f:
    data = json.load(f)

changed = 0
for key, items in data.items():
    for it in items:
        for field in ("zh", "en", "desc"):
            v = it.get(field)
            if not isinstance(v, str):
                continue
            # `en` is English but harmless to pass through (OpenCC leaves ASCII untouched);
            # convert zh/desc only to avoid any edge transform of English.
            if field == "en":
                continue
            t = to_traditional(v)
            if t != v:
                it[field] = t
                changed += 1

# Match the generator's on-disk format: minified, trailing newline, UTF-8, keys already sorted.
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")

print(f"converted {changed} field(s) S->T across {len(data)} combos -> {OUT}")
