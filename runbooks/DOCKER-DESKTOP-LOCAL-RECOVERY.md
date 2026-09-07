# Docker Desktop Local Runtime Socket Recovery

Scope: local Windows Docker Desktop (laptop) startup failure mentioning an
inaccessible `*.sock`, a `*.sock.stale` rename, or a listener under
`%LOCALAPPDATA%\Docker\run`.

## Cause (verified 2026-09-07, 4 days of logs)

Every Docker backend death coincided to the second with the laptop entering
sleep (Kernel-Power event 42): WSL `vpnkit-bridge` is terminated
(`0x40010004`) → backend dies → AF_UNIX sockets are left behind → the next
start crashes on `rename engine.sock -> engine.sock.stale: The file cannot be
accessed`. Upstream Docker Desktop bug since 4.77, still open at 4.89
(docker/desktop-feedback#460); renaming the runtime directory is the
community workaround. No death was observed outside a sleep transition.

## Data safety invariant

Never use Docker Desktop factory reset, `docker system prune --volumes`,
volume removal, or anything touching `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`.
The guard only **renames** two runtime directories that hold 0-byte sockets
(`Docker\run`, `docker-secrets-engine`) to timestamped archives; it never
deletes. Every harness scenario asserts a VHDX sentinel hash.

## Normal protection (launch-guard only, no background task)

SSOT: `scripts/register-docker-desktop-runtime-tasks.ps1` (idempotent,
unelevated; `-Show` prints live state; `-RetargetShortcuts` guards the
Desktop/Start Menu shortcuts; run once on a new machine).

- **Docker Desktop Runtime Preflight** — the only scheduled task: at logon,
  guard then launch. Sole logon launch owner. The `HKCU\...\Run\Docker
  Desktop` value (direct launch, bypasses the guard) was removed; enabling
  "Start Docker Desktop when you sign in" in the Docker UI would re-add it
  and is unnecessary.
- **Shortcuts** — Desktop and Start Menu `Docker Desktop.lnk` point at the
  guarded launcher (same icon), so a manual launch after a crash also gets
  the preflight. The **all-users** Start Menu copy
  (`%ProgramData%\Microsoft\Windows\Start Menu\Docker Desktop.lnk`) launches
  Docker directly and bypasses the guard; retargeting it needs an elevated
  session (`-RetargetShortcuts` only touches the per-user copies) — from an
  elevated PowerShell:
  ```powershell
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut('C:\ProgramData\Microsoft\Windows\Start Menu\Docker Desktop.lnk')
  $s.TargetPath = 'C:\Windows\System32\wscript.exe'
  $s.Arguments = '//B //Nologo "D:\Work\scripts\docker-desktop-runtime-hidden-launch.vbs" "D:\Work\scripts\docker-desktop-runtime-preflight.ps1" -StartDesktop'
  $s.IconLocation = 'C:\Program Files\Docker\Docker\Docker Desktop.exe,0'
  $s.Save()
  ```
  `-Show` reports this shortcut's guard state on every check.
- All actions run through `docker-desktop-runtime-hidden-launch.vbs` (each
  argument individually quoted): no console window is ever created
  (`powershell.exe -WindowStyle Hidden` flashes one per run — seen on screen
  2026-09-07, the reason this exists).
- Guard safety: liveness = process names + Docker Desktop named pipes, fails
  closed; one quarantine at a time (named mutex); a rename that lands on a
  Docker that just came alive is rolled back.
- **No auto-relaunch after a crash.** A scheduled "Watchdog" task was tried
  twice and removed both times (2026-09-07): first polling every 1–5
  minutes (visibly flashed a window on screen, and polling was overkill for
  a failure that only happens on sleep); then triggered on
  Kernel-Power EventID 107 ("resume from sleep") — proved wrong by
  EventRecordId ordering in the System log: 107 fires seconds AFTER sleep is
  *entered* here, not on resume, so the trigger had never actually fired
  once since registration, and a dead trigger fails silently. Docker Desktop
  is also not a well-behaved single-instance app: launching it again while
  it is already running (tried live) leaves a second, resident ~130MB
  process behind rather than focusing the existing one — ruling out
  "just launch it again" as a way to give a shortcut click feedback while
  Docker is already up. Net: guard every launch path instead of trying to
  detect a crash and react to it; a crash during sleep needs a human at the
  keyboard to resume the interrupted work anyway.

`scripts/check-smoke-tests.ps1` (every AO-RESUME) reports `docker_watchdog`:
`ok:guarded` iff the Preflight task is enabled, its last run did not fail, no
Run-key bypass exists, and the per-user shortcuts are guarded.

Change gate: `powershell.exe -File scripts/test-docker-desktop-runtime-preflight.ps1`
(Windows PowerShell 5.1, 7 scenarios, real filesystem, no Docker calls, no
registry writes) must pass before editing any of the scripts.

## Manual recovery (only if the guard itself is broken)

1. Confirm Docker Desktop is stopped: `Get-Process 'Docker Desktop','com.docker.backend','com.docker.build','docker-agent'` returns nothing.
2. From a normal (not elevated) PowerShell — elevation would launch Docker elevated:

   ```powershell
   & 'D:\Work\scripts\docker-desktop-runtime-preflight.ps1' -StartDesktop
   ```

   Expected: `QUARANTINED:` / `CLEAN:` lines, then Desktop launches. Never
   start `Docker Desktop.exe` directly while sockets may be stale.
3. Wait for `docker version --format '{{.Server.Version}}'`.
4. Then fix the guard itself: `powershell -File scripts\register-docker-desktop-runtime-tasks.ps1 -Show`;
   a non-zero `LastResult` or an unguarded shortcut means the task/shortcuts
   need re-registering (`-RetargetShortcuts`).

## Restoring an archive / reverting

Archives are the original directories, renamed: with Docker stopped,
`Rename-Item '%LOCALAPPDATA%\Docker\run.socket-archive-<stamp>' 'run'`.
Archives are not pruned automatically (rename-only policy). Original
shortcut targets (2026-09-07): Desktop → `C:\Program Files\Docker\Docker\Docker Desktop.exe`,
Start Menu → `C:\Program Files\Docker\Docker\frontend\Docker Desktop.exe`.
