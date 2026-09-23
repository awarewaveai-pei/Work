#!/bin/bash
# aw-autorepair-gate.sh -- SSH forced command for next-admin's Auto-Repair key (root on this host).
#
# root authorized_keys, one line:
#   restrict,from="172.16.0.0/12",command="/usr/bin/env -u BASH_ENV -u ENV /root/lobster-phase1/scripts/aw-autorepair-gate.sh" ssh-ed25519 AAAA... aw-autorepair@next-admin
# sg-deploy.sh step 1.8 rsyncs this file from git, so the allowlist ships with the next-admin code
# whose commands it mirrors. Contract test (fails if the two drift):
#   apps/next-admin/lib/repair-center/__tests__/autorepair-gate-contract.test.ts
#
# Only the exact strings below run; anything else exits 126, which next-admin reads as ssh_error /
# backup failed (fail-closed). Remediation (restart-unhealthy-container.ts) is deliberately absent.
#
# Modes:  (no args)  forced command: run SSH_ORIGINAL_COMMAND if allowed
#         --check    print ALLOW/DENY for SSH_ORIGINAL_COMMAND, exit 0/126, never executes
#         --list     print the allowed commands, one per line
#
# BASH_ENV/ENV: bash sources $BASH_ENV at interpreter startup, before running ANY line of a
# script it's given -- verified empirically 2026-09-23 (codex-review round 1, WORKLOG 續107) by
# poisoning it and observing the sourced file's side effects appear even before an `unset
# BASH_ENV` placed as this script's literal first statement. There is no in-script fix: the
# sourcing already happened by the time any line here can run, and the later `env -i` only
# governs the INNER exec of the allowed command, not the shell interpreting this file.
# Two layers of real control (round 2, same WORKLOG entry, after codex-review correctly rejected
# "AcceptEnv alone proves it" as too narrow):
#   1. authorized_keys' command= wraps this script in `env -u BASH_ENV -u ENV` (see the line
#      above) -- so even if BASH_ENV reaches the shell sshd spawns to interpret command=, it is
#      stripped before THIS script's own shebang-invoked bash starts, closing the one exposure a
#      wrapper actually can close (see round-2 analysis in WORKLOG for why it can't close the
#      outer one).
#   2. ks-aw-01 was fully audited 2026-09-23 for every source bash or sshd could pull BASH_ENV/ENV
#      from: `sshd -T` AcceptEnv=`LANG LC_*` only (no BASH_ENV/ENV), no SetEnv directive anywhere
#      in sshd_config(.d), PermitUserEnvironment=no (so ~/.ssh/environment and any authorized_keys
#      `environment=` option are ignored by sshd even if present -- and neither is present: no
#      ~/.ssh/environment file for root or ubuntu, no `environment=` on any authorized_keys line),
#      /etc/default/ssh and /etc/default/locale clean, ssh.service/ssh.socket systemd units carry
#      no Environment=, sshd's own master process environment carries no BASH_ENV/ENV, no profile
#      file exports it. All read-only checks, all clean. This is a point-in-time fact, not a
#      standing control -- if `AcceptEnv`, `PermitUserEnvironment`, or a systemd/PAM env source
#      ever changes, re-verify; nothing here detects that drift automatically.
set -u

CMDS=()
ENVS=()
# allow '<extra env, same as the cron line running that script>' '<exact command next-admin sends>'
allow() { ENVS+=("$1"); CMDS+=("$2"); }

# probes: app/api/ops/repairs/health/route.ts (statRemoteScript)
allow '' 'test -f /root/lobster-phase1/scripts/backup-phase1.sh && echo OK || echo MISSING'
allow '' 'test -f /root/scripts/backup-eu-stack.sh && echo OK || echo MISSING'
allow '' 'test -f /etc/apt/apt.conf.d/52awarewave-auto-reboot && echo OK || echo MISSING'
# pre-repair backups: lib/repair-center/backup.ts (runSshBackupGate). backup-eu-stack.sh defaults to
# BACKUP_DIR=/root/backups (the ks-aw-01 pipeline's dir) and its retention rm -rf's dated snapshot
# dirs there -- so the EU leg gets BACKUP_DIR from /etc/cron.d/ks-stack-backup, never the default.
allow '' 'cd /root/lobster-phase1 && ./scripts/backup-phase1.sh && ./scripts/verify-backup.sh'
allow 'BACKUP_DIR=/root/backups-stack' '/root/scripts/backup-eu-stack.sh && /root/scripts/verify-backup-eu.sh'
# evidence: lib/repair-center/evidence.ts (HOST_PROBE_COMMAND)
allow '' "docker ps -a --format '{{.Names}}|{{.Status}}' | head -30; echo ---; df -h / | tail -1; echo ---; free -m | head -2; echo ---; uptime"

MATCH_ENV=""
match() {
  local i
  for i in "${!CMDS[@]}"; do
    if [[ "$1" == "${CMDS[$i]}" ]]; then
      MATCH_ENV="${ENVS[$i]}"
      return 0
    fi
  done
  return 1
}

log() {
  # SSH_ORIGINAL_COMMAND is caller-controlled: strip non-printables so it cannot forge log lines.
  local msg="${2//[^[:print:]]/?}"
  command -v logger >/dev/null 2>&1 && logger -t aw-autorepair-gate -p "auth.$1" -- "${msg:0:240}"
  return 0
}

cmd="${SSH_ORIGINAL_COMMAND-}"

case "${1-}" in
  --check)
    if match "$cmd"; then
      echo "ALLOW${MATCH_ENV:+ env=$MATCH_ENV}"
      exit 0
    fi
    echo "DENY"
    exit 126
    ;;
  --list)
    printf '%s\n' "${CMDS[@]}"
    exit 0
    ;;
  "")
    ;;
  *)
    echo "aw-autorepair-gate: unknown argument" >&2
    exit 2
    ;;
esac

src="${SSH_CLIENT:-local}"
src="${src%% *}"
if ! match "$cmd"; then
  log warning "DENY from $src: $cmd"
  echo "aw-autorepair-gate: command not allowed" >&2
  exit 126
fi
log info "ALLOW from $src: $cmd"

# Same environment shape as cron (HOME/LOGNAME/SHELL/PATH + the cron line's own vars); env -i also
# drops BASH_ENV and anything the SSH client asked sshd to pass through.
run_env=(
  "HOME=${HOME:-/root}"
  "LOGNAME=${LOGNAME:-root}"
  "USER=${USER:-root}"
  "SHELL=/bin/bash"
  "PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin"
)
[[ -n "$MATCH_ENV" ]] && run_env+=("$MATCH_ENV")
exec env -i "${run_env[@]}" /bin/bash -c "$cmd"
