"""AI Gateway (Master Plan Phase 1 "AI Gateway" plane, first content 2026-09-17).

One provider seam (``provider.py``) and one use case (``draft.py``: plain-language brief -> builder kwargs ->
real builder + gates -> at most one repair round). The model never bypasses a method's gates: a draft that the
builder refuses is returned WITH the refusal, never silently accepted.
"""
