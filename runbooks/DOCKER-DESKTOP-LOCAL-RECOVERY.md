# Docker Desktop Local Runtime Socket Recovery

Scope: local Windows Docker Desktop (laptop) startup failure mentioning an
inaccessible `*.sock`, a `*.sock.stale` rename, or a listener under
`%LOCALAPPDATA%\Docker\run`. Upstream cause (Docker Desktop 4.89 + Windows
AF_UNIX): WSL `vpnkit-bridge` terminated (`0x40010004`) → backend dies →
sockets left behind → next start crashes on
`rename engine.sock -> engine.sock.stale: The file cannot be accessed`.

## Data safety invariant

Never use Docker Desktop factory reset, `docker system prune --volumes`,
volume removal, or anything touching `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`.
The automation only **renames** two runtime directories that hold 0-byte
sockets (`Docker\run`, `docker-secrets-engine`) to timestamped archives; it
never deletes. Every scenario in the harness asserts a VHDX sentinel hash.

## Normal protection (automatic since 2026-09-07)

SSOT for both user-scoped scheduled tasks:
`scripts/register-docker-desktop-runtime-tasks.ps1` (idempotent, unelevated,
`-Show` prints live state; run once on a new machine).

- **Docker Desktop Runtime Preflight** — at logon: guard, then launch. Sole
  logon launch owner. A `HKCU\...\Run\Docker Desktop` value (direct launch,
  bypasses the guard) is removed and kept removed by the watchdog — enabling
  "Start Docker Desktop when you sign in" in the Docker UI will be reverted;
  the task already does that, guarded.
- **Docker Desktop Runtime Watchdog** — every 1 minute, indefinitely, one
  short reconcile pass (`watch-docker-desktop-runtime.ps1 -Once`, 2-min
  limit, no immortal process). Docker alive → no-op. Docker stopped + stale
  sockets → quarantine, mark `watchdog.relaunch-pending`, **auto-relaunch**;
  keeps retrying until Docker is seen alive (10-min cooldown between
  attempts; `-NoRelaunch` switch or a `%LOCALAPPDATA%\Docker\watchdog.paused`
  file disables relaunch).
- Guard safety: liveness = process names + Docker Desktop named pipes, fails
  closed; one quarantine at a time (named mutex); a rename that lands on a
  Docker that just came alive is rolled back immediately.

State files in `%LOCALAPPDATA%\Docker` (UTF-8 no BOM — read with
`Get-Content -Encoding UTF8`): `watchdog.heartbeat` (last pass),
`watchdog.log` (actions only, rotates at 1 MB), `watchdog-last-relaunch.txt`
(age = cooldown), `watchdog.relaunch-pending`, `watchdog.paused`.

Liveness is surfaced by `scripts/check-smoke-tests.ps1` at every AO-RESUME
(`docker_watchdog`, critical: heartbeat older than 5 min = WARN + blind spot).

Change gate: `powershell.exe -File scripts/test-docker-desktop-runtime-preflight.ps1`
(Windows PowerShell 5.1, real filesystem + sandbox registry key, no Docker
calls) must pass before editing any of the four scripts.

Why not the 2026-09-05 design (one 2-second poller): it died once
(`LastTaskResult=0xC000013A`, `RestartCount=0`, logon-only trigger) and stayed
dead until the next logon — 2026-09-06 needed manual recovery twice.

## Manual recovery (only if the watchdog itself is dead)

1. Confirm Docker Desktop is stopped: `Get-Process 'Docker Desktop','com.docker.backend','com.docker.build','docker-agent'` returns nothing.
2. From a normal (not elevated) PowerShell — elevation would launch Docker elevated:

   ```powershell
   & 'D:\Work\scripts\docker-desktop-runtime-preflight.ps1' -StartDesktop
   ```

   Expected: `QUARANTINED:` / `CLEAN:` lines, then Desktop launches. Never
   start `Docker Desktop.exe` directly while sockets may be stale.
3. Wait for `docker version --format '{{.Server.Version}}'`.
4. Then fix the watchdog: `register-docker-desktop-runtime-tasks.ps1 -Show`;
   a non-zero `LastResult` → run `watch-docker-desktop-runtime.ps1 -Once`
   interactively to see the error.

## Restoring an archive

Archives are the original directories, renamed. To restore (Docker stopped):
`Rename-Item '%LOCALAPPDATA%\Docker\run.socket-archive-<stamp>' 'run'`. There
is normally no reason to: Docker recreates the sockets on start. Archives are
not pruned automatically (rename-only policy); delete old ones by hand if
they clutter.
