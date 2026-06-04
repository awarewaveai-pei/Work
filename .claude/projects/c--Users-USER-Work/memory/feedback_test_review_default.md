---
name: feedback-test-review-default
description: Every non-trivial code change MUST run critic + real test BEFORE declaring done — not on request
metadata: 
  node_type: memory
  type: feedback
  originSessionId: be3de1eb-01d8-4b15-9564-bd3898cc8e82
---

**Rule**: Every code change beyond trivial (i.e. anything more than typo/rename) must run **all three** before declaring done:
1. **Syntax check** (PowerShell parser / TypeScript tsc / etc.)
2. **Critic deep review** (the `critic` subagent) — finds logic bugs, edge cases, security
3. **Real execution test** — actually run the script/code with real or simulated inputs and observe output

This is NOT optional, NOT "if asked", NOT "if change feels risky". **It is the default.**

**Why**: User feedback 2026-05-22 — "為什麼你做事都沒有實測+review+抓蟲? 我們一起工作好幾個月了，可能都不知道有多少蟲了!"

Concrete case proving necessity: AO-CLOSE bug fix session 2026-05-22.
- Syntax check passed
- Critic round 1 found 3 Majors (real bugs in my "fix" code)
- Critic round 2 came back clean after fixes
- **Real test then revealed a 4th bug critic missed**: backfill-missed-daily.ps1 used PowerShell default CP950 stdout decoding → UTF-8 Chinese commit messages mangled → multi-byte sequences ate newline characters → two commits merged on one line with pipe-separator leakage. Would have been a silent 30-year time bomb on any zh-TW Windows machine.

**Lesson**: Critic reads code, doesn't run it. Real execution is the only way to catch:
- OS locale / encoding mismatches (CP950 vs UTF-8)
- File I/O race conditions
- Tool interop (git stdout, ssh banner parsing, etc.)
- Display/format issues (em-dash mangling, line ending mixups)
- Performance / timing assumptions

**How to apply**:
- After Edit/Write of any *.ps1, *.ts, *.tsx, *.js, *.sh, *.py file beyond trivial fix:
  1. Run language syntax/parse check
  2. Spawn `critic` subagent with the changed files
  3. Either run the changed code directly (Bash powershell -File) OR write a small reproducer to exercise the new path
  4. ONLY THEN declare the task done
- For docs-only changes (.md), only syntax/lint check is needed
- For build/deploy scripts, also test rollback path
- For cross-machine code, test the encoding/locale path explicitly

**Audit debt**: Months of past work may contain bugs that "passed" because I only did syntax+logic-trace. Operator has flagged this; should propose a systematic audit of past-touched scripts when an opportunity arises (see [[project-audit-debt-2026-05]]).

Linked: see also [[feedback-root-cause-discipline]] (don't close on symptom only).
