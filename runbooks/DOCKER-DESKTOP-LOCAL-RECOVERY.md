# Docker Desktop Local Runtime Socket Recovery

Use this runbook only for a local Windows Docker Desktop startup failure that
mentions an inaccessible `*.sock`, a `*.sock.stale` rename, or a listener under
`%LOCALAPPDATA%\Docker\run`.

## Data safety invariant

Never use Docker Desktop factory reset, `docker system prune --volumes`, volume
removal, or any operation on `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`.
The recovery preflight only renames stale runtime directories; it preserves a
timestamped archive so every action is reversible.

## Normal protection

The scheduled task **Docker Desktop Runtime Preflight** runs at user logon and
starts Docker after the guard completes. **Docker Desktop Runtime Watchdog**
then checks every two seconds during the login session. It exits without
changes while Docker is active and cleans stale runtime sockets once it stops.
The tasks use `D:\Work\scripts\docker-desktop-runtime-preflight.ps1` and
`D:\Work\scripts\watch-docker-desktop-runtime.ps1`.

Later restarts can use the normal Docker Desktop icon because the watchdog has
already cleaned stale sockets. This command remains available for an immediate
manual recovery:

```powershell
& 'D:\Work\scripts\docker-desktop-runtime-preflight.ps1' -StartDesktop
```

## Recovery procedure

1. Confirm Docker Desktop and `com.docker.backend` are not running.
2. Run the safe launch entrypoint from an elevated PowerShell session:

   ```powershell
   & 'D:\Work\scripts\docker-desktop-runtime-preflight.ps1' -StartDesktop
   ```

   Expected result: `QUARANTINED:` for a stale runtime directory, or `CLEAN:`
   when no stale reparse-point socket exists, followed by Desktop launch.
3. Wait for `docker version --format '{{.Server.Version}}'` to return a
   version.
4. Verify the VHDX exists, required volumes remain listed, and dependent
   services are healthy.

## If the preflight task failed

Inspect, do not reset:

```powershell
Get-ScheduledTaskInfo -TaskName 'Docker Desktop Runtime Preflight' |
  Select-Object LastRunTime, LastTaskResult
```

`LastTaskResult = 0` is success. A non-zero result requires running the script
interactively to capture its precise PowerShell error, then fixing the script
and re-running the scheduled task before restarting Docker Desktop.
