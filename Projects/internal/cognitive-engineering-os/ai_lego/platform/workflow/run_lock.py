"""Run lock: at most one runner executes one (tenant, run_id), across every process on the host (plan P-k).

The journal says what a run has done; it cannot say whether its runner is still alive, so a RUNNING journal
whose process died stayed RUNNING forever (the executor refuses to resume RUNNING) and a process-local
in-flight set could not stop a second worker (Codex oracle 2026-09-28 r3). The missing fact is an OS
advisory lock on ``<run_id>.lock`` next to the journal, held for the whole run:

- the kernel is the only arbiter and releases it when the holding process dies -- no TTL, heartbeat, clock or
  takeover step (a file-based TTL lease had a check-then-take race: critic 2026-09-28);
- POSIX ``fcntl.flock`` / Windows ``msvcrt.locking`` (byte 0) both conflict between two open handles of the
  SAME process too, so threads in one worker are covered;
- the file exists only for an ACCEPTED run (callers refuse before acquiring) and is never deleted, not by
  retention or erasure either: unlinking it lets a second opener lock a fresh inode while the first still
  holds the old one. Bytes from offset 1 carry a tag (the recipe id) so status can tell whose run it is.

Limits: advisory and host-local (a network filesystem shared by several hosts is out of scope; multi-host =
swap this module for a session-bound DB lock, same three functions). A runner stuck inside a step holds the
lock until its process is restarted. Probes: POSIX probes take a shared lock (they never collide with each
other); Windows has no shared mode here, so two simultaneous probes of an idle run can flicker to "held", and
Windows may release a dead process's lock a moment late. A probe racing a submission can make that submission
get a 409 -- never a second runner.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

if os.name == "nt":
    import msvcrt
else:
    import fcntl

_TAG_OFFSET = 1  # byte 0 is the locked byte (Windows locks are mandatory for the locked range)


def lock_path_for(journal_path: Path) -> Path:
    """``<run_id>.journal.json`` -> ``<run_id>.lock`` in the same tenant directory."""
    name = journal_path.name
    stem = name[: -len(".journal.json")] if name.endswith(".journal.json") else name
    return journal_path.with_name(f"{stem}.lock")


def _try_lock(fd: int, *, shared: bool = False) -> bool:
    try:
        if os.name == "nt":
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(fd, (fcntl.LOCK_SH if shared else fcntl.LOCK_EX) | fcntl.LOCK_NB)
        return True
    except OSError:
        return False


def _unlock_and_close(fd: int) -> None:
    try:
        if os.name == "nt":
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(fd, fcntl.LOCK_UN)
    except OSError:
        pass
    finally:
        os.close(fd)


class RunLock:
    """A held run lock; ``release`` is idempotent and never raises (a run's own result must not be replaced by
    an unlock error -- closing the handle releases the lock anyway)."""

    def __init__(self, path: Path, fd: int) -> None:
        self.path = path
        self._fd: int | None = fd

    def release(self) -> None:
        fd, self._fd = self._fd, None
        if fd is not None:
            _unlock_and_close(fd)


def acquire_run_lock(path: Path, *, tag: str = "") -> RunLock | None:
    """The lock, or None while any other handle (this process or another) holds it. Never blocks. ``tag`` is
    written while holding it (the previous holder's tag is replaced)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    if not _try_lock(fd):
        os.close(fd)
        return None
    try:
        os.lseek(fd, _TAG_OFFSET, os.SEEK_SET)
        os.write(fd, tag.encode("utf-8"))
        os.ftruncate(fd, _TAG_OFFSET + len(tag.encode("utf-8")))
    except BaseException:
        _unlock_and_close(fd)
        raise
    return RunLock(path, fd)


def run_lock_state(path: Path) -> Literal["held", "free", "absent"]:
    """``held`` = a runner is executing; ``free`` = a run was accepted here and nobody runs it now; ``absent`` =
    never accepted. Read-only apart from the instant probe lock."""
    try:
        fd = os.open(path, os.O_RDWR)
    except FileNotFoundError:
        return "absent"
    if not _try_lock(fd, shared=True):
        os.close(fd)
        return "held"
    _unlock_and_close(fd)
    return "free"


def run_lock_tag(path: Path) -> str:
    """The tag its latest holder wrote ("" if none or unreadable)."""
    try:
        with open(path, "rb") as handle:
            handle.seek(_TAG_OFFSET)
            return handle.read().decode("utf-8", "replace")
    except OSError:
        return ""
