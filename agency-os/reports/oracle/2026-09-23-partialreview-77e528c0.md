# codex-oracle review -- 2026-09-23 22:44:36 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/health/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/ssh-host-key-pinning.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/autorepair-gate-contract.test.ts, lobster-factory/infra/hetzner-phase1-core/scripts/aw-autorepair-gate.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Auto-Repair SSH host-key pinning (next-admin repair-center). Diagnosis WORKLOG 2026-09-23 續106: prod .env still targeted retired SG/EU hosts, the container key was unauthorized on ks-aw-01, and the released EU IP is now owned by a third party who answers SSH -- and connectSsh() accepted ANY host key. Change: SshTarget.hostKeyFingerprint (ssh2 hostHash sha256 hex, NOT ssh-keygen base64), connectSsh() pins via hostVerifier and rejects with HostKeyMismatchError; readSshTarget() (the one production entry point) now FAILS CLOSED: AUTO_REPAIR_<SG|EU>_SSH_HOST_KEY_SHA256 missing => target treated as unconfigured (null) with a stderr warning, never connects unpinned; route.ts health probes build their own target inline and apply the identical guard; new tests ssh-host-key-pinning.test.ts and autorepair-gate-contract.test.ts; scripts/aw-autorepair-gate.sh. The authoring session ran 4 companion rounds (last: no material findings) and 1558 tests green, then hit its usage limit; this is the landing review. Please attack: any caller of connectSsh that bypasses readSshTarget and still connects unpinned, the warn-and-proceed path in connectSsh being reachable from production code, hostVerifier being invoked before reject/resolve ordering issues (double settle), fingerprint normalisation (case, whitespace, base64 vs hex confusion), and test coverage of the fail-closed route path.
- exit: 0 | elapsed: 73662ms | answer: 30B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/health/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/autorepair-gate-contract.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/__tests__/ssh-host-key-pinning.test.ts, lobster-factory/infra/hetzner-phase1-core/scripts/aw-autorepair-gate.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
