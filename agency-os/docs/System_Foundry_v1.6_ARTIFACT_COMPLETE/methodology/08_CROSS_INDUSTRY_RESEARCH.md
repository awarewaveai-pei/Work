# Cross-Industry Research Standard

## Purpose
刻意跳出目標產業找可轉移的模式——這是這個框架「LEGO 可重用」哲學的具體實踐：好的解法不一定來自同一個產業。

## Sequencing
Step 08. Runs alongside/after `07_INDUSTRY_RESEARCH_STANDARD.md`. Feeds `09_FALSIFICATION_STANDARD.md` with additional candidate patterns to stress-test.

## Required Scope
- structural analogy
- safety patterns
- governance patterns
- transferability

## Required Fields
1. **Structural analogy** — an explicit statement of what structural property this system shares with the source industry's problem (e.g. "high-consequence irreversible actions" shared with aviation/medicine), not a superficial surface resemblance.
2. **Safety/governance patterns borrowed** — the specific mechanism (checklist discipline, dual-control, independent review) and its origin.
3. **Transferability validation** — before adopting a cross-industry pattern, an explicit check that the structural analogy actually holds for this system, not just that the pattern sounds impressive.
4. **What was NOT transferable** — patterns considered and rejected because the structural analogy didn't hold, recorded so the reasoning isn't lost and re-litigated later.

## Rejection of Superficial Borrowing
A cross-industry pattern MUST NOT be adopted on the strength of analogy alone; it MUST be paired with the same falsification treatment as any other decision (`09_FALSIFICATION_STANDARD.md`) before being locked in.

## Gate
This step has no dedicated entry in `runtime/stage-gates.yaml` of its own — like `07_INDUSTRY_RESEARCH_STANDARD.md`, it is raw material feeding `09_FALSIFICATION_STANDARD.md` toward `G7_FALSIFICATION_COMPLETE` (the canonical `G8_ASSURANCE_READY` is a different, later concept — see `12_ARCHITECTURE_ASSURANCE.md`). This step's own local check: reject a cross-industry pattern adopted without an explicit transferability validation, or where the structural analogy is not stated.
