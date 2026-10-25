#!/usr/bin/env python3
"""
mainwp-backup-merge.py

Companion to scripts/sync-backup-status-from-mainwp.sh (host-side backup status; state in /var/lib/awarewave/backup-status/).
Merges the parsed MainWP backup truth (from mainwp-report-parse.php) into a tenant's
BACKUP_AUTO_STATUS.json, preserving all static metadata and rewriting only the dynamic
backup fields.

Usage:
    PARSED='<json from php>' NOW_UTC='2026-06-08T06:20:00Z' \
        python3 mainwp-backup-merge.py <path-to-BACKUP_AUTO_STATUS.json> [--dry-run]

Change detection (anti-churn): the file is rewritten ONLY when last_success.task_id OR
last_failure.task_id differs from what is already on disk. A changed synced_at_utc alone
never triggers a write, so a daily cron that finds no new backup produces no git churn.

Output (stdout, single token): CHANGED | NOCHANGE | ERROR:<reason>
Exit codes: 0 ok (CHANGED or NOCHANGE) · 1 error.

Pure-ASCII I/O; the JSON content this writes stays ASCII so it is locale-safe through cron.
"""
import json
import os
import sys


def fail(reason: str) -> "NoReturn":
    print(f"ERROR:{reason}")
    sys.exit(1)


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv[1:]
    if not args:
        fail("no json path arg")
    json_path = args[0]

    parsed_raw = os.environ.get("PARSED", "")
    if not parsed_raw:
        fail("empty PARSED env")
    try:
        parsed = json.loads(parsed_raw)
    except json.JSONDecodeError as e:
        fail(f"bad PARSED json: {e}")

    now_utc = os.environ.get("NOW_UTC", "").strip()
    if not now_utc:
        fail("empty NOW_UTC env")

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except FileNotFoundError:
        fail(f"json file missing: {json_path}")
    except json.JSONDecodeError as e:
        fail(f"existing json invalid: {e}")

    new_succ = parsed.get("last_success")
    new_fail = parsed.get("last_failure")
    if new_succ is None and new_fail is None:
        fail("parsed has neither success nor failure")

    def ident(obj):
        # Composite identity (task_id, unix_utc). task_id alone is the natural key, but
        # WPvivid could in theory emit a row with no task_id (php defaults it to ""); the
        # unix_utc then disambiguates two distinct backups so a real new one is never
        # missed as NOCHANGE (critic 2026-06-08 defense-in-depth).
        if not isinstance(obj, dict):
            return None
        return (obj.get("task_id") or "", obj.get("unix_utc"))

    old_succ_id = ident(existing.get("last_success"))
    old_fail_id = ident(existing.get("last_failure"))
    new_succ_id = ident(new_succ)
    new_fail_id = ident(new_fail)

    # Anti-churn: compare against the value the merge will ACTUALLY write, not the raw
    # parse. The update guards below preserve the on-disk value when the parse yields None
    # (a Succeeded/Failed task that aged out of the bounded report_addon history). So a
    # None parse must NOT count as a change, or the file would be rewritten with only a
    # fresh synced_at_utc on every run forever (critic 2026-06-08 finding #1).
    succ_changed = new_succ is not None and new_succ_id != old_succ_id
    fail_changed = new_fail is not None and new_fail_id != old_fail_id
    if not succ_changed and not fail_changed:
        print("NOCHANGE")
        return

    # Build history (newest first, bounded) from php output.
    history = []
    for h in parsed.get("history", []) or []:
        entry = {"iso_utc": h.get("iso_utc"), "status": h.get("status")}
        if h.get("reason"):
            entry["reason"] = h["reason"]
        history.append(entry)

    # Update only the dynamic fields; preserve every other key as-is.
    if new_succ is not None:
        existing["last_success"] = new_succ
    if new_fail is not None:
        existing["last_failure"] = new_fail
    existing["synced_at_utc"] = now_utc
    existing["synced_by"] = (
        "auto -- sync-backup-status-from-mainwp.sh (ks-aw-01 host cron) "
        "from MainWP DB report_addon truth source"
    )
    existing["backup_history_since_last_sync"] = history

    if dry_run:
        print("CHANGED")
        return

    # Atomic write: tmp + replace. Trailing newline, 2-space indent (matches repo style).
    # pid-suffixed tmp avoids collision between concurrent runs; try/finally removes a
    # half-written tmp on crash so a stray *.tmp never trips the orchestrator's dirty-tree
    # guard and wedges every future run (critic 2026-06-08 finding #2).
    tmp_path = "{}.tmp.{}".format(json_path, os.getpid())
    try:
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, json_path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    print("CHANGED")


if __name__ == "__main__":
    main()
