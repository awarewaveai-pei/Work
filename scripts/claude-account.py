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
import hashlib
import json
import os
import re
import subprocess
import time
import sys
import tempfile
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
    env["AWAREWAVE_HEADLESS_WORKER"] = "1"   # ao-resume-on-prompt.ps1 skips its per-new-session AO-RESUME
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
        # refreshTokenExpiresAt is absent on some logins (Wda Team seat, 2026-10-24): absent = no known expiry
        expires = oauth.get("refreshTokenExpiresAt")
        return bool(oauth.get("refreshToken")) and (expires is None or expires / 1000 > time.time())
    except (OSError, ValueError, KeyError, TypeError):
        return False


def trusted(account, folder):
    # Claude Code drops EVERY hook (all safety gates) in a folder the profile never trusted; a fresh profile trusts
    # nothing (2026-10-24: wda worker ran Bash with 0 hooks). Trust is the operator's consent: accepted by hand, once.
    cfg = PROFILES[account] / ".claude.json" if PROFILES[account] else HOME / ".claude.json"
    want = os.path.normcase(os.path.normpath(folder))
    try:
        projects = json.loads(cfg.read_text(encoding="utf-8")).get("projects", {})
    except (OSError, ValueError):
        return False
    return any(os.path.normcase(os.path.normpath(k)) == want and isinstance(v, dict) and v.get("hasTrustDialogAccepted")
               for k, v in projects.items())


def trust_steps(account, folder):
    setdir = "" if PROFILES[account] is None else f'$env:CLAUDE_CONFIG_DIR="{PROFILES[account]}"; '
    return (f"{account} has not trusted {folder}: hooks would be off. In PowerShell run once, accept the trust prompt, then /exit:"
            "\n"
            f'  cd {folder}; {clean_env_ps()}{setdir}& "{claude_exe()}"')


def cmd_show(_):
    acc = active()
    print(f"workers use: {acc} ({PROFILES[acc] or HOME / '.claude'})")
    for name in PROFILES:
        print(f"  {name}: {'logged in' if logged_in(name) else 'NOT logged in'}, "
              f"{'trusts' if trusted(name, str(ROOT)) else 'does NOT trust'} {ROOT}")
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


def headless(acc, prompt, cwd, model, turns, timeout_min, extra=()):
    # prompt goes in on stdin: Windows PowerShell 5.1 strips quotes inside native arguments
    cmd = [claude_exe(), "-p", "--output-format", "json", "--permission-mode", "bypassPermissions",
           "--max-turns", str(turns), "--model", model, *extra]
    proc = subprocess.run(cmd, input=prompt.encode("utf-8"), capture_output=True, cwd=cwd, env=worker_env(acc),
                          timeout=timeout_min * 60)
    out = proc.stdout.decode("utf-8", "replace").strip()
    try:
        result = json.loads(out.splitlines()[-1]) if out else {}
    except ValueError:
        result = {"is_error": True, "result": out[-2000:]}
    return proc, result


def hooks_marker(acc):
    return (PROFILES[acc] or HOME / ".claude") / ".hooks-verified"


def claude_version():
    return subprocess.run([claude_exe(), "--version"], capture_output=True).stdout.decode("utf-8", "replace").strip()


def gate_fingerprint(folder):
    # The proof is void when anything that decides the gates changes: CLI version, the settings file (hooks + deny),
    # the hook runner and its rule wiring (Codex review 2026-10-24 F1).
    h = hashlib.sha256(claude_version().encode())
    for p in (Path(folder) / ".claude" / "settings.json", HOME / ".claude" / "settings.json",
              HOME / ".claude" / "hooks" / "runner.js", HOME / ".claude" / "hooks" / "rules.manifest.json"):
        h.update(p.read_bytes() if p.is_file() else b"<missing>")
    return f"{os.path.normcase(folder)}|{h.hexdigest()}"


def hooks_proven(acc, folder):
    # Trust alone was not enough (2026-10-24: wda trusted D:/Work, still "Found 0 hook matchers"); verify-hooks is.
    try:
        return hooks_marker(acc).read_text(encoding="utf-8").strip() == gate_fingerprint(folder)
    except OSError:
        return False


def cmd_verify_hooks(a):
    acc = a.account or active()
    if not logged_in(acc) or not trusted(acc, a.cwd):
        print(trust_steps(acc, a.cwd) if logged_in(acc) else f"{acc} is not logged in")
        return 2
    token = os.urandom(6).hex()
    # Two proofs, both recorded by the CLI itself, not by anything the worker can write (Codex review F2/F3):
    # a deny rule refuses `sudo` (harmless here: Windows has no sudo), and the CLI's own hook debug log -- at a random
    # path the worker is never told -- shows a PreToolUse:Bash hook that ran. (A -p transcript records only SessionStart.)
    debug_file = Path(tempfile.gettempdir()) / f"claude-gate-{os.urandom(8).hex()}.log"
    proc, result = headless(acc, f"Use the Bash tool to run exactly: echo gate-{token}\nThen use the Bash tool to run "
                                 f"exactly: sudo echo gate-{token}\nThen reply done.", a.cwd, "claude-haiku-5-5", 6, 10,
                            extra=("--debug", "hooks", "--debug-file", str(debug_file)))
    denied = any("sudo" in json.dumps(d.get("tool_input", {})) for d in result.get("permission_denials") or [])
    try:
        log = debug_file.read_text(encoding="utf-8", errors="replace")
        hooked = re.search(r"Hook PreToolUse:Bash \(PreToolUse\) success", log) is not None
        debug_file.unlink()
    except OSError:
        hooked = False
    if denied and hooked:
        hooks_marker(acc).write_text(gate_fingerprint(a.cwd) + "\n", encoding="utf-8")
        print(f"{acc}: deny rules and gate hooks are active in {a.cwd}; workers may run")
        return 0
    hooks_marker(acc).unlink(missing_ok=True)
    print(f"{acc}: gates NOT proven in {a.cwd} (deny rule applied: {denied}, PreToolUse hook in transcript: {hooked}, "
          f"worker exit {proc.returncode}); workers stay blocked")
    return 2


def cmd_run(a):
    acc = a.account or active()
    if not logged_in(acc):
        print(json.dumps({"account": acc, "error": "not logged in"}))
        return 2
    if not trusted(acc, a.cwd):
        print(trust_steps(acc, a.cwd))
        print(json.dumps({"account": acc, "error": "folder not trusted (hooks off)"}))
        return 2
    if not hooks_proven(acc, a.cwd):
        print(f"no proof that hooks fire for {acc} in {a.cwd}: run `python scripts/claude-account.py verify-hooks --account {acc}`")
        print(json.dumps({"account": acc, "error": "hooks not proven"}))
        return 2
    prompt = a.task if a.task else sys.stdin.read()
    proc, result = headless(acc, prompt, a.cwd, a.model, a.turns, a.timeout_min)
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
    p = sub.add_parser("verify-hooks")
    p.add_argument("--account", choices=sorted(PROFILES))
    p.add_argument("--cwd", default=str(ROOT))
    p.set_defaults(fn=cmd_verify_hooks)
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
