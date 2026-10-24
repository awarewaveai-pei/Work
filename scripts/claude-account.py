#!/usr/bin/env python3
"""Pick which Claude subscription background workers bill, and run a worker on it.

  python scripts/claude-account.py show                 # which account workers use now
  python scripts/claude-account.py use wda|me           # switch (the operator types /account wda)
  python scripts/claude-account.py init-wda             # create the Wda Gov profile once, then log in by hand
  python scripts/claude-account.py run "<task>"         # one headless worker (`claude -p`) on the active account
  python scripts/claude-account.py resume-cmd <id>      # the command that continues a session on the active account

Accounts: `me` = the default config dir (~/.claude, the operator's own plan); `wda` = ~/.claude-wda (the unit's
Team seat). Switching is manual by design (operator, 2026-10-24): nothing here reads usage or switches by itself.
Why the Wda profile needs no copied settings: D:/Work/.claude is a junction to ~/.claude, so hooks, commands and
agents load as PROJECT settings under any account. Only the login is separate; `projects/` is a junction so
transcripts and auto-memory are shared and `--resume <id>` works across accounts.
cc.py (API key, pay per use) is a separate, last fallback and is not touched here.
"""
import argparse
import json
import os
import re
import subprocess
import time
import sys
from pathlib import Path

HOME = Path(os.environ["USERPROFILE"] if os.name == "nt" else os.environ["HOME"])
ROOT = Path(__file__).resolve().parents[1]
STATE = HOME / ".claude-active-account"
PROFILES = {"me": None, "wda": HOME / ".claude-wda"}
# Only the CLI's own error result counts as a quota stop, never text the worker read (AGENTS.md mentions "429").
LIMIT = re.compile(r"(usage limit|weekly limit|session limit|rate limit|\b429\b|try again at)", re.I)


def active():
    try:
        name = STATE.read_text(encoding="utf-8").strip()
    except OSError:
        return "me"
    return name if name in PROFILES else "me"


def worker_env(account):
    # Inside a Claude Code session the parent's CLAUDE*/ANTHROPIC* markers (host auth token, account uuid) would make
    # the child bill the parent's login instead of the chosen profile (same trap as cc.py, 2026-10-21): drop them all.
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("CLAUDE", "ANTHROPIC"))}
    if PROFILES[account] is not None:
        env["CLAUDE_CONFIG_DIR"] = str(PROFILES[account])
    return env


def clean_env_ps():
    # A shell started from the desktop app inherits its CLAUDE*/ANTHROPIC* auth markers; the printed commands drop
    # them first, or `--resume` on wda could still run on the parent's login (Codex review 2026-10-24 F5).
    return "Get-ChildItem Env: | Where-Object Name -match '^(CLAUDE|ANTHROPIC)' | Remove-Item; "


def claude_exe():
    for cand in (HOME / ".local" / "bin" / "claude.exe", HOME / ".local" / "bin" / "claude"):
        if cand.is_file():
            return str(cand)
    return "claude"


def logged_in(account):
    # The desktop app signs in on its own; the CLI's file login can lapse unseen (refresh token expired 2026-10-22,
    # every `run` 401). So "logged in" = a refresh token that is still valid, not just a file.
    folder = PROFILES[account] or HOME / ".claude"
    try:
        oauth = json.loads((folder / ".credentials.json").read_text(encoding="utf-8"))["claudeAiOauth"]
        return bool(oauth.get("refreshToken")) and oauth.get("refreshTokenExpiresAt", 0) / 1000 > time.time()
    except (OSError, ValueError, KeyError, TypeError):
        return False


def cmd_show(_):
    acc = active()
    print(f"workers use: {acc} ({PROFILES[acc] or HOME / '.claude'})")
    for name in PROFILES:
        print(f"  {name}: {'logged in' if logged_in(name) else 'NOT logged in'}")
    return 0


def cmd_use(a):
    if a.account == "wda" and not logged_in("wda"):
        print("wda is not logged in yet (or its login expired): run `python scripts/claude-account.py init-wda` and log in")
        return 2
    STATE.write_text(a.account + "\n", encoding="utf-8")
    print(f"workers now use: {a.account}")
    print("to continue THIS conversation on it, run in a terminal:")
    print("  python scripts/claude-account.py resume-cmd <session id>")
    return 0


def cmd_init_wda(_):
    prof = PROFILES["wda"]
    prof.mkdir(exist_ok=True)
    link = prof / "projects"
    target = HOME / ".claude" / "projects"
    if not os.path.lexists(link):
        if os.name == "nt":
            subprocess.run(["cmd.exe", "/c", "mklink", "/J", str(link), str(target)], check=True, capture_output=True)
        else:
            link.symlink_to(target, target_is_directory=True)
    # a plain folder here would keep Wda transcripts apart and `--resume <id>` would not find this session
    if os.path.realpath(link) != os.path.realpath(target):
        print(f"{link} exists but is not a link to {target}: move it away, then run init-wda again")
        return 2
    print(f"profile ready: {prof} (projects -> {target})")
    if not logged_in("wda"):
        print("log in once by hand (pick the Wda Gov organization), in PowerShell:")
        # full path: the installer does not put claude.exe on PowerShell's PATH (2026-10-24)
        print(f'  {clean_env_ps()}$env:CLAUDE_CONFIG_DIR="{prof}"; & "{claude_exe()}"')
        print("  then type /login, finish in the browser, type /exit")
    return 0


def cmd_run(a):
    acc = a.account or active()
    if not logged_in(acc):
        print(json.dumps({"account": acc, "error": "not logged in"}))
        return 2
    prompt = a.task if a.task else sys.stdin.read()
    # prompt goes in on stdin: Windows PowerShell 5.1 strips quotes inside native arguments
    cmd = [claude_exe(), "-p", "--output-format", "json", "--permission-mode", "bypassPermissions",
           "--max-turns", str(a.turns), "--model", a.model]
    proc = subprocess.run(cmd, input=prompt.encode("utf-8"), capture_output=True, cwd=a.cwd, env=worker_env(acc),
                          timeout=a.timeout_min * 60)
    out = proc.stdout.decode("utf-8", "replace").strip()
    try:
        result = json.loads(out.splitlines()[-1]) if out else {}
    except ValueError:
        result = {"is_error": True, "result": out[-2000:]}
    text = str(result.get("result", "")) or proc.stderr.decode("utf-8", "replace")[-2000:]
    summary = {"account": acc, "session_id": result.get("session_id"), "is_error": bool(result.get("is_error")) or proc.returncode != 0,
               "turns": result.get("num_turns"), "exit": proc.returncode}
    if summary["is_error"] and LIMIT.search(text):
        summary["limit"] = True
        other = "wda" if acc == "me" else "me"
        print(f"{acc} hit its usage limit. Type /account {other} to switch, then rerun.")
    print(text)
    print("RESULT " + json.dumps(summary))
    return 3 if summary.get("limit") else (1 if summary["is_error"] else 0)


def cmd_resume_cmd(a):
    acc = active()
    exe = claude_exe()
    setdir = "" if PROFILES[acc] is None else f'$env:CLAUDE_CONFIG_DIR="{PROFILES[acc]}"; '
    print(f'cd {ROOT}; {clean_env_ps()}{setdir}& "{exe}" --resume {a.session_id}')
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("show").set_defaults(fn=cmd_show)
    p = sub.add_parser("use")
    p.add_argument("account", choices=sorted(PROFILES))
    p.set_defaults(fn=cmd_use)
    sub.add_parser("init-wda").set_defaults(fn=cmd_init_wda)
    p = sub.add_parser("run")
    p.add_argument("task", nargs="?", help="task text; omit to read stdin")
    p.add_argument("--account", choices=sorted(PROFILES), help="override the active account for this run")
    p.add_argument("--cwd", default=str(ROOT))
    p.add_argument("--model", default="claude-opus-5-5")
    p.add_argument("--turns", type=int, default=80)
    p.add_argument("--timeout-min", type=int, default=120)
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("resume-cmd")
    p.add_argument("session_id", nargs="?", default=os.environ.get("CLAUDE_CODE_SESSION_ID"),
                   help="default: the calling session (CLAUDE_CODE_SESSION_ID)")
    p.set_defaults(fn=cmd_resume_cmd)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
