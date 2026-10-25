#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Repair Center Phase 4 weekly checks -- THE single implementation.

Why this file exists (2026-08-26)
---------------------------------
Phase 4 used to have the check logic written TWICE: once as prose inside the
cloud routine prompt (AgencyOS-RepairCenterPhase4Weekly, the path that actually
runs) and once as PowerShell inside scripts/phase4-weekly-check.ps1 (the manual
fallback).  They drifted: CHECK 4 was added to the cloud prompt on 2026-05-23 and
never reached the .ps1, so for three months the "belt-and-suspenders fallback"
was silently a different detector.  Both callers now shell out to this file, so
adding a check is a repo change and never requires touching the deployed prompt.

The restore-drill sub-check (3A) also used to read a HAND-MAINTAINED DERIVED
value, `restore_drill_due_after`.  Two ways that rots, both were live:
  P1  a drill happens, nobody bumps the date  -> permanent false WARN
      (2026-08-16 drill PASSed; the gate still cried "overdue" four weeks later)
  P2  somebody bumps the date without a drill -> gate silently satisfied
and a third, proven by experiment on 2026-08-26: writing garbage into the field
(or deleting the line) made the whole sub-check VANISH -- no warning, no error,
because the old regex simply failed to match and the `if` block was skipped
under `$ErrorActionPreference = "SilentlyContinue"`.

So 3A now derives the deadline from the drill RECORDS themselves and every
unparseable/missing state is a WARNING, never a silent pass.  See check_tenant().

Encoding (this is a repeat offender in this repo, do not "simplify" it away)
---------------------------------------------------------------------------
On the operator's Windows box `locale.getpreferredencoding()` is **cp950** and so
is `sys.stdout.encoding`.  A bare open() on a UTF-8 tenant file mojibakes or
raises; a bare print() of any CJK raises UnicodeEncodeError and would take the
whole run down with it (= all four checks SKIP).  Hence: explicit utf-8-sig on
every read, an explicit stdout reconfigure below, and newline="\n" on writes so
the two callers cannot produce different line endings for the same report.

Usage
-----
  python3 scripts/phase4-checks.py --format report
  python3 scripts/phase4-checks.py --format json
  python3 scripts/phase4-checks.py --write --timestamp "2026-08-28 14:01" \
          --trigger "Claude routine AgencyOS-RepairCenterPhase4Weekly"
  python3 scripts/phase4-checks.py --selftest      # exits non-zero on failure

Exit codes
----------
  0  the run completed (verdicts live in the output, NOT in the exit code)
  1  --selftest failed
  2  the run could not be performed at all (caller must render SKIP, never PASS)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

# --- stdout/stderr: never let a CJK detail string kill the run (see module docstring)
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - very old interpreters
        pass

PASS = "PASS"
WARNING = "WARNING"
SKIP = "SKIP"

# Sub-check tuning.  These are POLICY, not physics -- each one states what it is
# measuring and why the number is what it is, so a future reader can move it
# with their eyes open.
BACKUP_STALE_DAYS = 8          # weekly cadence + 1 day grace
TRUTH_SOURCE_STALL_DAYS = 9    # see check_truth_source_freshness()
DEFAULT_DRILL_INTERVAL_DAYS = 90

REPORT_DIR_REL = os.path.join("agency-os", "reports", "repair-center")

# 2026-08-30: ks-aw-01-auto-reboot.conf is the live single-host SSOT (deployed to
# the same /etc/apt/apt.conf.d/52awarewave-auto-reboot path on ks-aw-01). The two
# pre-consolidation files below are kept as historical reference, not deleted, so
# this list still checks both -- neither going missing should go unnoticed.
AUTO_REBOOT_SSOT = [
    "lobster-factory/infra/hetzner-phase1-core/auto-reboot/ks-aw-01-auto-reboot.conf",
    "lobster-factory/infra/hetzner-phase1-core/auto-reboot/52awarewave-auto-reboot.conf",
    "lobster-factory/infra/hetzner-phase1-core/auto-reboot/53awarewave-stagger-eu.conf",
    "runbooks/VPS-AUTO-REBOOT-RUNBOOK.md",
]

GH_REPO = "awarewaveai-pei/Work"


# --------------------------------------------------------------------------
# io helpers
# --------------------------------------------------------------------------

def read_text(path):
    """utf-8-sig: tolerates a BOM if one ever appears without corrupting the
    first key of the frontmatter (`\ufeff---` would fail the \\A--- anchor)."""
    with open(path, "r", encoding="utf-8-sig") as fh:
        return fh.read()


def read_json(path):
    with open(path, "r", encoding="utf-8-sig") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------
# frontmatter: a deliberately small YAML subset
# --------------------------------------------------------------------------
# Only what the tenant files actually use: top-level scalars plus one list of
# flat mappings (restore_drills).  Anything outside that shape is reported as an
# error rather than guessed at -- a monitoring file that we cannot parse must
# make noise, not assumptions.

_KEY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$")
_FM_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)


def _scalar(raw):
    raw = raw.strip()
    if raw.startswith('"') and raw.endswith('"') and len(raw) >= 2:
        return raw[1:-1]
    if raw.startswith("'") and raw.endswith("'") and len(raw) >= 2:
        return raw[1:-1]
    # strip a trailing ` # comment`, but only when unquoted
    raw = re.sub(r"\s+#.*$", "", raw).strip()
    if raw == "[]":
        # Inline empty list. Without this, `restore_drills: []` -- an idiom a human
        # or another agent will absolutely type -- would parse to the STRING "[]"
        # and 3A would report "not a list", i.e. a confusing false warning on a
        # tenant that is merely new. Treat it as the empty list it obviously is.
        return []
    if raw in ("", "null", "~"):
        return None
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    return raw


def parse_frontmatter(text):
    """-> (dict, None) or (None, reason). Never raises on malformed input."""
    m = _FM_RE.match(text)
    if not m:
        return None, "no YAML frontmatter block at top of file"

    data = {}
    cur_list = None
    cur_item = None

    for raw_line in m.group(1).splitlines():
        line = raw_line.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        indent = len(line) - len(line.lstrip())
        body = line.strip()

        if indent == 0:
            cur_list = None
            cur_item = None
            km = _KEY_RE.match(body)
            if not km:
                return None, "unparseable top-level line: %s" % body[:48]
            key, rawval = km.group(1), km.group(2)
            if rawval.strip() == "":
                # An empty value opens a block: either a list of mappings, or a
                # genuinely empty key.  We start it as a list and leave it empty
                # if nothing indented follows -- callers treat [] and None alike.
                data[key] = []
                cur_list = data[key]
            else:
                data[key] = _scalar(rawval)
            continue

        # indented -> must belong to the list opened by the previous top-level key
        if cur_list is None:
            return None, "indented line outside any list: %s" % body[:48]

        if body.startswith("- "):
            cur_item = {}
            cur_list.append(cur_item)
            body = body[2:].strip()
            if not body:
                continue
        if cur_item is None:
            return None, "list continuation before any '- ' item: %s" % body[:48]

        km = _KEY_RE.match(body)
        if not km:
            return None, "unparseable list-item line: %s" % body[:48]
        cur_item[km.group(1)] = _scalar(km.group(2))

    return data, None


# --------------------------------------------------------------------------
# repo helpers
# --------------------------------------------------------------------------

def find_repo_root(explicit=None):
    if explicit:
        return os.path.abspath(explicit)
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=20,
        )
        if out.returncode == 0 and out.stdout.strip():
            return os.path.abspath(out.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    return os.path.abspath(os.getcwd())


def find_tenant_proofs(repo):
    """All tenant BACKUP_RESTORE_PROOF.md, templates excluded.

    The exclusion matches the EU sync script's `-not -path '*template*'` so the
    two never disagree about which tenants exist.  Matching is done on the path
    RELATIVE to the repo so an unlucky absolute path (a checkout living under
    e.g. C:\\templates\\) cannot silently empty the whole list.
    """
    base = os.path.join(repo, "agency-os", "tenants")
    found = []
    if not os.path.isdir(base):
        return found
    for dirpath, _dirnames, filenames in os.walk(base):
        if "BACKUP_RESTORE_PROOF.md" not in filenames:
            continue
        full = os.path.join(dirpath, "BACKUP_RESTORE_PROOF.md")
        rel = os.path.relpath(full, repo).replace("\\", "/")
        if "template" in rel.lower():
            continue
        found.append(full)
    return sorted(found)


def tenant_slug(repo, md_path):
    rel = os.path.relpath(md_path, repo).replace("\\", "/")
    parts = rel.split("/")
    if "tenants" in parts:
        i = parts.index("tenants")
        if i + 1 < len(parts):
            return parts[i + 1]
    return os.path.basename(os.path.dirname(os.path.dirname(md_path)))


def run_gh(args, timeout=90):
    """-> (ok, parsed_json_or_None, reason)."""
    try:
        proc = subprocess.run(["gh"] + args, capture_output=True, text=True,
                              timeout=timeout, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return False, None, "gh not installed"
    except subprocess.SubprocessError as exc:
        return False, None, "gh failed: %s" % exc
    if proc.returncode != 0:
        return False, None, "gh exit=%d" % proc.returncode
    body = (proc.stdout or "").strip()
    if not body:
        return True, [], ""
    try:
        return True, json.loads(body), ""
    except ValueError:
        return False, None, "gh returned non-JSON output"


# --------------------------------------------------------------------------
# CHECK 1 / CHECK 2 -- auto-repair PR hygiene
# --------------------------------------------------------------------------

def check_duplicate_repairs():
    ok, prs, reason = run_gh([
        "pr", "list", "--repo", GH_REPO, "--label", "auto-repair",
        "--state", "all", "--limit", "30", "--json", "number,title,createdAt",
    ])
    if not ok:
        return {"status": SKIP, "detail": reason, "lines": []}

    groups = {}
    for pr in prs:
        title = pr.get("title") or ""
        key = re.sub(r"#\d+", "", title)
        key = re.sub(r"\s+", " ", key).strip().lower()[:40]
        groups.setdefault(key, []).append("#%s" % pr.get("number"))

    dupes = [(k, v) for k, v in sorted(groups.items()) if len(v) >= 2]
    if not dupes:
        return {"status": PASS,
                "detail": "%d auto-repair PR 已檢查，無重複" % len(prs), "lines": []}
    detail = "; ".join("[%s]: %s..." % (", ".join(v), k) for k, v in dupes)
    return {"status": WARNING, "detail": detail, "lines": []}


def check_human_review_backlog():
    ok, prs, reason = run_gh([
        "pr", "list", "--repo", GH_REPO, "--label", "needs-human-review",
        "--state", "open", "--limit", "10", "--json", "number,title,url",
    ])
    if not ok:
        return {"status": SKIP, "detail": reason, "lines": []}
    if not prs:
        return {"status": PASS, "detail": "", "lines": []}
    detail = " | ".join("#%s: %s" % (p.get("number"), p.get("title")) for p in prs)
    return {"status": WARNING, "detail": detail, "lines": []}


# --------------------------------------------------------------------------
# CHECK 3 -- tenant backup health
# --------------------------------------------------------------------------

# The reconciliation scan (3A2) deliberately looks ONLY at this structured table
# row and not at prose headings.  A heading like "Drill #2 預計 2026-11-01 執行"
# is a plan, not a record, and matching it would manufacture exactly the kind of
# false warning this whole rewrite exists to delete.
_DRILL_ROW_RE = re.compile(r"^\|\s*Drill date\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|", re.M)


def _parse_date(value):
    if value is None:
        return None
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def check_restore_drills(fm, text, today):
    """3A -- freshness derived from the drill records themselves.

    Every branch that cannot establish "a passing drill happened on date D" is a
    WARNING.  There is intentionally NO path from missing/malformed data to
    PASS: the failure this replaces was precisely a detector that went quiet
    when its input stopped making sense.
    """
    warns = []

    interval = fm.get("restore_drill_interval_days")
    if interval is None:
        interval = DEFAULT_DRILL_INTERVAL_DAYS
    elif not isinstance(interval, int) or interval <= 0:
        warns.append("restore_drill_interval_days 非正整數（%r），改用預設 %d 天"
                     % (interval, DEFAULT_DRILL_INTERVAL_DAYS))
        interval = DEFAULT_DRILL_INTERVAL_DAYS

    drills = fm.get("restore_drills")
    if drills is None:
        return [(WARNING, "3A 還原演練", "frontmatter 缺 restore_drills —— 無法證明備份可還原")]
    if not isinstance(drills, list):
        return [(WARNING, "3A 還原演練", "restore_drills 不是清單，無法解析")]
    if not drills:
        return [(WARNING, "3A 還原演練", "restore_drills 為空 —— 尚無任何還原演練記錄")]

    recorded_dates = set()
    passing = []
    for idx, entry in enumerate(drills, 1):
        if not isinstance(entry, dict):
            warns.append("第 %d 筆演練記錄格式錯誤" % idx)
            continue
        day = _parse_date(entry.get("date"))
        if day is None:
            warns.append("第 %d 筆演練缺少或無法解析 date" % idx)
            continue
        recorded_dates.add(day.isoformat())
        result = str(entry.get("result") or "").strip().upper()
        if result == "PASS":
            passing.append(day)
        elif result not in ("FAIL", "PARTIAL"):
            warns.append("第 %d 筆演練 result 非 PASS/FAIL/PARTIAL（%r）"
                         % (idx, entry.get("result")))

    # 3A2 reconciliation: a drill written up in prose but never registered in the
    # frontmatter is the exact 2026-08-16 failure.  Catching it here means the
    # operator gets told once, with the line to paste, instead of staring at a
    # bogus "overdue" for a month.
    for prose_date in sorted(set(_DRILL_ROW_RE.findall(text))):
        if prose_date not in recorded_dates:
            warns.append(
                "敘述有 %s 的演練但 frontmatter 未登錄 —— 請於 restore_drills 補上："
                "`- date: %s` / `result: PASS`" % (prose_date, prose_date))

    if not passing:
        latest = max((d for d in (
            _parse_date(e.get("date")) for e in drills if isinstance(e, dict)) if d), default=None)
        detail = "無任何 PASS 的還原演練"
        if latest:
            detail += "（最近一筆 %s 非 PASS）" % latest.isoformat()
        return [(WARNING, "3A 還原演練", detail)] + \
               [(WARNING, "3A 還原演練", w) for w in warns]

    last_pass = max(passing)
    out = []
    if last_pass > today:
        # A typo'd year would otherwise buy 12 months of silence.
        out.append((WARNING, "3A 還原演練",
                    "最近一筆 PASS 日期 %s 在未來 —— 資料有誤，本輪不採信"
                    % last_pass.isoformat()))
    else:
        due = last_pass + timedelta(days=interval)
        if today > due:
            out.append((WARNING, "3A 還原演練",
                        "已逾期 —— 最近 PASS %s，應於 %s 前重驗（間隔 %d 天）"
                        % (last_pass.isoformat(), due.isoformat(), interval)))
        else:
            # Printing the computed due date on the happy path is not cosmetic:
            # it is how a human notices that the next deadline lands after some
            # external cliff (soulful's hosting dies 2026-11-12; 90 days from the
            # 08-16 drill is 11-14, i.e. two days too late).
            out.append((PASS, "3A 還原演練",
                        "最近 PASS %s，下次到期 %s（間隔 %d 天）"
                        % (last_pass.isoformat(), due.isoformat(), interval)))
    out.extend((WARNING, "3A 還原演練", w) for w in warns)
    return out


def check_backup_freshness(status_json, now_utc):
    """3B -- how long since a backup last SUCCEEDED."""
    last_success = (status_json or {}).get("last_success") or {}
    unix = last_success.get("unix_utc")
    if not isinstance(unix, (int, float)):
        return (WARNING, "3B 備份新鮮度", "JSON 缺 last_success.unix_utc —— 無真相來源")
    age = (now_utc - datetime.fromtimestamp(unix, tz=timezone.utc)).total_seconds() / 86400.0
    age_days = int(age // 1)
    iso = last_success.get("iso_utc") or "?"
    if age_days > BACKUP_STALE_DAYS:
        return (WARNING, "3B 備份新鮮度",
                "距上次成功 %d 天（%s），超過 %d 天門檻" % (age_days, iso, BACKUP_STALE_DAYS))
    return (PASS, "3B 備份新鮮度", "距上次成功 %d 天（%s）" % (age_days, iso))


def check_last_backup_outcome(status_json):
    """3C -- did the MOST RECENT attempt succeed?

    3B alone cannot see this.  soulful's backups failed on 08-03, 08-10 and
    08-24 while 3B stayed quiet or blamed staleness; a single success resets the
    clock and erases the pattern.  The JSON already carries last_failure and the
    recent history -- nobody was reading them.
    """
    js = status_json or {}
    succ = (js.get("last_success") or {}).get("unix_utc")
    fail = (js.get("last_failure") or {}).get("unix_utc")
    if not isinstance(fail, (int, float)):
        return (PASS, "3C 最近結果", "無失敗記錄")
    if isinstance(succ, (int, float)) and succ >= fail:
        return (PASS, "3C 最近結果", "最新一次成功")

    history = js.get("backup_history_since_last_sync")
    streak = 0
    total = 0
    failed = 0
    if isinstance(history, list):
        total = len(history)
        for item in history:
            if not isinstance(item, dict):
                continue
            if str(item.get("status", "")).lower() == "failed":
                failed += 1
        for item in history:  # history is newest-first
            if not isinstance(item, dict):
                break
            if str(item.get("status", "")).lower() == "failed":
                streak += 1
            else:
                break

    iso = (js.get("last_failure") or {}).get("iso_utc") or "?"
    detail = "最新一次備份失敗（%s）" % iso
    if streak > 1:
        detail += "，已連續失敗 %d 次" % streak
    if total:
        detail += "，近 %d 次中 %d 次失敗" % (total, failed)
    return (WARNING, "3C 最近結果", detail)


def check_truth_source_freshness(status_json, now_utc):
    """3D -- is the truth source itself still moving?

    Nuance that cost a design revision: the EU bridge rewrites the JSON ONLY when
    the backup task_id changes (mainwp-backup-merge.py:14-15,83-86, an explicit
    anti-churn decision from critic 2026-06-08).  So synced_at_utc marks the last
    CHANGE, not the last run, and during a healthy week it legitimately sits
    still for ~7 days.  A tight threshold here would have manufactured a fresh
    false alarm inside the very fix meant to remove one.  9 days = weekly cadence
    plus grace; past that, either backups stopped happening at all or the bridge
    is dead, and both deserve a look.
    """
    raw = (status_json or {}).get("synced_at_utc")
    if not raw:
        return (WARNING, "3D 真相來源", "JSON 缺 synced_at_utc —— 無法判斷資料是否還在更新")
    try:
        stamp = datetime.strptime(str(raw).strip(), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return (WARNING, "3D 真相來源", "synced_at_utc 格式無法解析（%s）" % raw)
    age_days = int(((now_utc - stamp).total_seconds() / 86400.0) // 1)
    if age_days > TRUTH_SOURCE_STALL_DAYS:
        return (WARNING, "3D 真相來源",
                "backup task 已 %d 天無變化（%s）—— 備份停擺或 EU sync 已死，3B/3C 本輪不可信"
                % (age_days, raw))
    return (PASS, "3D 真相來源", "%d 天前更新" % age_days)


def judge_backup_status(status_json, now_utc):
    """3B-3D on one tenant's backup status. Since 2026-10-25 the host runs it (sync-backup-status-from-mainwp.sh calls
    --judge-backup-json; state in /var/lib/awarewave/backup-status/): the status lives there, not in the repo."""
    return [check_backup_freshness(status_json, now_utc), check_last_backup_outcome(status_json),
            check_truth_source_freshness(status_json, now_utc)]


def check_tenant(repo, md_path, today, now_utc):
    slug = tenant_slug(repo, md_path)
    try:
        text = read_text(md_path)
    except OSError as exc:
        return WARNING, [(WARNING, slug, "無法讀取檔案：%s" % exc)]

    fm, err = parse_frontmatter(text)
    if fm is None:
        return WARNING, [(WARNING, slug, "frontmatter 無法解析：%s" % err)]

    status = fm.get("status")
    if status == "not-onboarded":
        return SKIP, [(SKIP, slug, "not-onboarded")]
    if status != "active":
        return WARNING, [(WARNING, slug, "status 欄位不是 active/not-onboarded（%r）" % status)]

    rows = list(check_restore_drills(fm, text, today))

    # 3B-3D need the live backup status, which stays on the host (judge_backup_status): its failure turns the
    # backup_status_sync row on /ops/schedules red and pushes. Restating it here would read a stale repo copy.
    rows.append((PASS, "3B-3D 備份", "由主機 backup_status_sync 判斷（/ops/schedules，失敗即推播）"))

    verdict = WARNING if any(r[0] == WARNING for r in rows) else PASS
    return verdict, [(lvl, "%s %s" % (slug, label), detail) for lvl, label, detail in rows]


def check_tenant_backups(repo, today, now_utc):
    proofs = find_tenant_proofs(repo)
    if not proofs:
        return {"status": SKIP, "detail": "找不到任何 BACKUP_RESTORE_PROOF.md（可疑）", "lines": []}

    lines = []
    any_warn = False
    for md in proofs:
        verdict, rows = check_tenant(repo, md, today, now_utc)
        if verdict == WARNING:
            any_warn = True
        lines.extend(rows)
    return {"status": WARNING if any_warn else PASS, "detail": "", "lines": lines}


# --------------------------------------------------------------------------
# CHECK 4 -- auto-reboot SSOT integrity
# --------------------------------------------------------------------------

def check_auto_reboot_ssot(repo):
    missing = [p for p in AUTO_REBOOT_SSOT if not os.path.isfile(os.path.join(repo, p))]
    if missing:
        return {"status": WARNING, "detail": "missing: " + "; ".join(missing), "lines": []}
    return {"status": PASS, "detail": "", "lines": []}


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------

CHECK_TITLES = [
    ("check1", "Check 1 重複修復"),
    ("check2", "Check 2 needs-human-review PR"),
    ("check3", "Check 3 租戶備份健康"),
    ("check4", "Check 4 VPS auto-reboot SSOT"),
]


def run_all(repo, now_utc=None):
    now_utc = now_utc or datetime.now(timezone.utc)
    today = now_utc.date()
    return {
        "check1": check_duplicate_repairs(),
        "check2": check_human_review_backlog(),
        "check3": check_tenant_backups(repo, today, now_utc),
        "check4": check_auto_reboot_ssot(repo),
    }


def overall(results):
    warns = sum(1 for k, _ in CHECK_TITLES if results[k]["status"] == WARNING)
    skips = sum(1 for k, _ in CHECK_TITLES if results[k]["status"] == SKIP)
    if warns == 0 and skips == 0:
        return "全PASS", warns, skips
    if skips == 0:
        return "%d 項需注意" % warns, warns, skips
    return "%d 項需注意, %d 項 SKIP" % (warns, skips), warns, skips


def render_report(results, timestamp, trigger):
    text, warns, skips = overall(results)
    prefix = "\u2705 " if (warns == 0 and skips == 0) else "\u26a0\ufe0f "
    out = ["# Repair Center Phase 4 週巡檢",
           "- 日期: %s TPE" % timestamp,
           "- 觸發: %s" % trigger]
    for key, title in CHECK_TITLES:
        res = results[key]
        line = "- %s: %s" % (title, res["status"])
        if res.get("detail"):
            line += " — %s" % res["detail"]
        out.append(line)
        # Sub-check lines are separate on purpose.  When the drill sub-check was
        # false and the backup sub-check was true they used to be concatenated
        # into one string; the real signal rode along with a known-bogus one for
        # four consecutive weeks and was skipped over.
        for lvl, label, detail in res.get("lines", []):
            out.append("  - %s: %s%s" % (label, lvl, (" — %s" % detail) if detail else ""))
    out.append("- 整體: %s%s" % (prefix, text))
    return "\n".join(out) + "\n"


def render_telegram(results, when):
    text, warns, skips = overall(results)
    emoji = "\u2705" if (warns == 0 and skips == 0) else "\u26a0\ufe0f"
    lines = ["%s Repair Center Phase 4 週巡檢 %s" % (emoji, when)]
    for key, title in CHECK_TITLES:
        lines.append("%s: %s" % (title, results[key]["status"]))
    for lvl, label, detail in results["check3"].get("lines", []):
        if lvl == WARNING:
            lines.append("  ! %s — %s" % (label, detail))
    if warns or skips:
        lines.append("")
        lines.append("詳細: reports/repair-center/phase4-LATEST.md")
    return "\n".join(lines)


def write_reports(repo, body, date_string):
    """Writes the two report files. Refuses to write anywhere else -- the cloud
    routine's standing rule is 'only write inside agency-os/reports/repair-center'
    and that rule should be enforced by the thing doing the writing, not only by
    the prompt asking nicely."""
    target_dir = os.path.abspath(os.path.join(repo, REPORT_DIR_REL))
    os.makedirs(target_dir, exist_ok=True)
    written = []
    for name in ("phase4-LATEST.md", "phase4-%s.md" % date_string):
        path = os.path.abspath(os.path.join(target_dir, name))
        if os.path.dirname(path) != target_dir:  # pragma: no cover - defence in depth
            raise RuntimeError("refusing to write outside %s" % REPORT_DIR_REL)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(body)
        written.append(path)
    return written


# --------------------------------------------------------------------------
# selftest
# --------------------------------------------------------------------------
# These build REAL files in a temp tree and drive the real check_tenant() path
# (discovery -> read -> frontmatter -> JSON), not the internal helpers.  A green
# in-memory unit test would have proved nothing about the encoding and file
# layout bugs that this repo actually keeps hitting.

def _fixture(tmp, slug, frontmatter, prose="", status_json=None):
    core = os.path.join(tmp, "agency-os", "tenants", slug, "core")
    os.makedirs(core, exist_ok=True)
    md = os.path.join(core, "BACKUP_RESTORE_PROOF.md")
    with open(md, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("---\n%s\n---\n\n# 備份與還原證明\n\n%s\n" % (frontmatter.strip("\n"), prose))
    if status_json is not None:
        with open(os.path.join(core, "BACKUP_AUTO_STATUS.json"), "w",
                  encoding="utf-8", newline="\n") as fh:
            json.dump(status_json, fh, ensure_ascii=False)
    return md


def selftest():
    now = datetime(2026, 8, 26, 12, 0, 0, tzinfo=timezone.utc)
    today = now.date()
    recent = int((now - timedelta(days=2)).timestamp())
    recent_iso = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    healthy_json = {
        "last_success": {"unix_utc": recent, "iso_utc": recent_iso},
        "synced_at_utc": recent_iso,
    }
    failures = []

    def expect(name, condition, got=""):
        if not condition:
            failures.append("%s -- got: %s" % (name, got))

    with tempfile.TemporaryDirectory(prefix="phase4-selftest-") as tmp:
        def verdict_of(md):
            return check_tenant(tmp, md, today, now)

        # 1. healthy active tenant, drill 10 days ago -> PASS
        md = _fixture(tmp, "t-healthy",
                      "status: active\nrestore_drill_interval_days: 90\n"
                      "restore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      prose="| Drill date | 2026-08-16 |\n", status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("healthy tenant is PASS", v == PASS, "%s %s" % (v, rows))

        # 2. genuinely overdue -> WARNING  (TASKS.md DoD: must still catch a real one)
        md = _fixture(tmp, "t-overdue",
                      "status: active\nrestore_drill_interval_days: 90\n"
                      "restore_drills:\n  - date: 2026-01-01\n    result: PASS\n",
                      status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("real overdue is WARNING", v == WARNING and any("逾期" in r[2] for r in rows),
               str(rows))

        # 3. key deleted entirely -> WARNING (old checker went silent here)
        md = _fixture(tmp, "t-nokey", "status: active\n", status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("missing restore_drills is WARNING", v == WARNING, str(rows))

        # 4. garbage date -> WARNING (old checker went silent here too)
        md = _fixture(tmp, "t-garbage",
                      "status: active\nrestore_drills:\n  - date: NOT-A-DATE\n    result: PASS\n",
                      status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("unparseable drill date is WARNING", v == WARNING, str(rows))

        # 5. future-dated drill cannot buy silence
        md = _fixture(tmp, "t-future",
                      "status: active\nrestore_drills:\n  - date: 2027-08-16\n    result: PASS\n",
                      status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("future drill date is WARNING", v == WARNING and any("未來" in r[2] for r in rows),
               str(rows))

        # 6. prose records a drill the frontmatter does not -> reconciliation WARNING
        #    (this is the exact 2026-08-16 failure, now caught mechanically)
        md = _fixture(tmp, "t-unregistered",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      prose="| Drill date | 2026-08-16 |\n\n| Drill date | 2026-08-20 |\n",
                      status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("unregistered prose drill is WARNING",
               v == WARNING and any("未登錄" in r[2] for r in rows), str(rows))

        # 7. only FAIL results -> WARNING
        md = _fixture(tmp, "t-failonly",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: FAIL\n",
                      status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("no passing drill is WARNING", v == WARNING, str(rows))

        # 8. not-onboarded stays silent
        md = _fixture(tmp, "t-new", "status: not-onboarded\nrestore_drills:\n")
        v, rows = verdict_of(md)
        expect("not-onboarded is SKIP", v == SKIP, str(rows))

        # 8b. `restore_drills: []` must mean "no drills yet", not "not a list"
        md = _fixture(tmp, "t-inline-empty",
                      "status: active\nrestore_drills: []\n", status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("inline empty list reads as empty, not as a type error",
               v == WARNING and any("尚無任何還原演練記錄" in r[2] for r in rows), str(rows))

        # 9. 3C: newest attempt failed even though last success is recent
        md = _fixture(tmp, "t-lastfail",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      status_json={
                          "last_success": {"unix_utc": int((now - timedelta(days=3)).timestamp()),
                                           "iso_utc": "2026-08-23T00:15:04Z"},
                          "last_failure": {"unix_utc": int((now - timedelta(days=2)).timestamp()),
                                           "iso_utc": "2026-08-24T00:15:10Z"},
                          "backup_history_since_last_sync": [
                              {"status": "Failed"}, {"status": "Succeeded"}, {"status": "Failed"}],
                          "synced_at_utc": recent_iso,
                      })
        rows = judge_backup_status(read_json(os.path.join(os.path.dirname(md), "BACKUP_AUTO_STATUS.json")), now)
        expect("last attempt failed is WARNING",
               any(r[0] == WARNING and "3C" in r[1] for r in rows), str(rows))

        # 10. 3D: truth source frozen -> WARNING; a 7-day-quiet week must NOT warn
        stale_iso = (now - timedelta(days=20)).strftime("%Y-%m-%dT%H:%M:%SZ")
        md = _fixture(tmp, "t-stalejson",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      status_json={"last_success": {"unix_utc": recent, "iso_utc": recent_iso},
                                   "synced_at_utc": stale_iso})
        rows = judge_backup_status(read_json(os.path.join(os.path.dirname(md), "BACKUP_AUTO_STATUS.json")), now)
        expect("frozen truth source is WARNING",
               any(r[0] == WARNING and "3D" in r[1] for r in rows), str(rows))

        quiet_iso = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        md = _fixture(tmp, "t-quietweek",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      status_json={"last_success": {"unix_utc": recent, "iso_utc": recent_iso},
                                   "synced_at_utc": quiet_iso})
        rows = judge_backup_status(read_json(os.path.join(os.path.dirname(md), "BACKUP_AUTO_STATUS.json")), now)
        expect("a quiet healthy week must NOT warn (anti-churn nuance)",
               not any(r[0] == WARNING and "3D" in r[1] for r in rows), str(rows))

        # 11. an empty status -> WARNING on the host, never a silent pass; the repo tenant no longer reads it
        expect("empty backup status is WARNING", any(r[0] == WARNING for r in judge_backup_status({}, now)), "")
        md = _fixture(tmp, "t-nojson",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n",
                      prose="| Drill date | 2026-08-16 |\n")
        v, rows = verdict_of(md)
        expect("tenant check does not read a repo status copy", v == PASS, str(rows))

        # 12. broken frontmatter -> WARNING
        core = os.path.join(tmp, "agency-os", "tenants", "t-broken", "core")
        os.makedirs(core, exist_ok=True)
        broken = os.path.join(core, "BACKUP_RESTORE_PROOF.md")
        with open(broken, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("no frontmatter here at all\n")
        v, rows = verdict_of(broken)
        expect("missing frontmatter is WARNING", v == WARNING, str(rows))

        # 13. CJK round-trip through a real file (cp950 trap regression guard)
        md = _fixture(tmp, "t-cjk",
                      "status: active\nrestore_drills:\n  - date: 2026-08-16\n    result: PASS\n"
                      "    note: \"還原演練：288 表、11,001 檔\"\n",
                      prose="| Drill date | 2026-08-16 |\n", status_json=healthy_json)
        v, rows = verdict_of(md)
        expect("CJK note parses and tenant is PASS", v == PASS, str(rows))

        # 14. templates are excluded from discovery
        tpl = os.path.join(tmp, "agency-os", "tenants", "templates", "core")
        os.makedirs(tpl, exist_ok=True)
        with open(os.path.join(tpl, "BACKUP_RESTORE_PROOF.md"), "w",
                  encoding="utf-8", newline="\n") as fh:
            fh.write("---\nstatus: active\n---\n")
        found = [tenant_slug(tmp, p) for p in find_tenant_proofs(tmp)]
        expect("template excluded from discovery", "templates" not in found, str(found))
        expect("real tenants still discovered", "t-healthy" in found, str(found))

        # 15. report rendering survives CJK and puts sub-checks on their own lines
        results = {
            "check1": {"status": PASS, "detail": "", "lines": []},
            "check2": {"status": PASS, "detail": "", "lines": []},
            "check3": check_tenant_backups(tmp, today, now),
            "check4": {"status": PASS, "detail": "", "lines": []},
        }
        body = render_report(results, "2026-08-26 12:00", "selftest")
        expect("report renders sub-check lines", "\n  - t-healthy 3A" in body, body[:200])
        expect("report ends with overall", "- 整體:" in body, body[-120:])

    if failures:
        for f in failures:
            print("SELFTEST FAIL: %s" % f)
        print("selftest: %d failed" % len(failures))
        return 1
    print("selftest: all cases passed")
    return 0


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main(argv=None):
    ap = argparse.ArgumentParser(description="Repair Center Phase 4 checks")
    ap.add_argument("--repo", default=None, help="repo root (default: git toplevel)")
    ap.add_argument("--format", choices=["report", "json", "telegram"], default="report")
    ap.add_argument("--timestamp", default=None, help='report header, e.g. "2026-08-28 14:01"')
    ap.add_argument("--trigger", default="manual", help="what invoked this run")
    ap.add_argument("--write", action="store_true",
                    help="write phase4-LATEST.md and phase4-<date>.md")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--judge-backup-json", metavar="PATH",
                    help="3B-3D on one backup status file; exit 1 on any WARNING (the host's backup_status_sync)")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    if args.judge_backup_json:
        try:
            rows = judge_backup_status(read_json(args.judge_backup_json), datetime.now(timezone.utc))
        except (OSError, ValueError) as exc:
            print("%s 3B 備份狀態無法讀取：%s" % (WARNING, exc))
            return 1
        for lvl, label, detail in rows:
            print("%s %s %s" % (lvl, label, detail))
        return 1 if any(r[0] == WARNING for r in rows) else 0

    repo = find_repo_root(args.repo)
    now_utc = datetime.now(timezone.utc)
    results = run_all(repo, now_utc)

    stamp = args.timestamp or (now_utc + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M")
    date_string = stamp.split(" ")[0]
    body = render_report(results, stamp, args.trigger)

    if args.write:
        for path in write_reports(repo, body, date_string):
            print("wrote %s" % path, file=sys.stderr)

    if args.format == "json":
        text, warns, skips = overall(results)
        # `telegram` ships inside the JSON on purpose: the .ps1 caller needs a
        # notification body, and if it built one itself we would be back to two
        # renderers of the same result drifting apart -- the exact failure this
        # file exists to end. One run, one render, both consumers.
        print(json.dumps({"results": results, "overall": text,
                          "warnings": warns, "skips": skips,
                          "timestamp": stamp, "trigger": args.trigger,
                          "report": body,
                          "telegram": render_telegram(results, stamp)},
                         ensure_ascii=False, indent=2))
    elif args.format == "telegram":
        print(render_telegram(results, stamp))
    else:
        print(body, end="")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 -- a crash must be loud and machine-visible
        print("phase4-checks: FATAL %s: %s" % (type(exc).__name__, exc), file=sys.stderr)
        sys.exit(2)
