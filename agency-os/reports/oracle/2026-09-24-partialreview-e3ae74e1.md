# codex-oracle review -- 2026-09-24 02:55:11 +08:00

- mode: `review`
- scope: -Path scripts/fetch-ssh-host-key-fingerprint.mjs, tests/scripts/fetch-ssh-host-key-fingerprint.test.mjs, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, agency-os/config/released-addresses.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Decision: next-admin Auto-Repair SSH targets are pinned to a host key (AUTO_REPAIR_<SG|EU>_SSH_HOST_KEY_SHA256 = ssh2 hostHash sha256 hex). New scripts/fetch-ssh-host-key-fingerprint.mjs computes that value from ssh-keyscan output (hex sha256 over the raw key blob, plus the ssh-keygen -lf base64 form for cross-checking) and marks the key ssh2 negotiates by default. Compose now passes the two *_HOST_KEY_SHA256 vars into the container and SG_SSH_HOST no longer defaults to a retired address (empty -> provision-staging code default); the matching knownViolations entry was removed from released-addresses.json.
Constraints: Node 24, no new dependencies, tests offline (fixture = public ks-aw-01 host key; expected values came from two other tool chains: ssh-keyscan|base64 -d|sha256sum on the host, and ssh-keygen -lf).
Acceptance: the script's digest matches ssh2's hostHash for every key type; pickNegotiated mirrors ssh2 DEFAULT_SERVER_HOST_KEY order (ssh-ed25519 first when eddsaSupported); CLI exit codes 0/1/2; importing the module has no side effects.
Review for correctness bugs, wrong assumptions about ssh2 or ssh-keyscan output, and test gaps only.
- exit: 0 | elapsed: 87218ms | answer: 11B
- files-reviewed: agency-os/config/released-addresses.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/ssh.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, scripts/fetch-ssh-host-key-fingerprint.mjs, tests/scripts/fetch-ssh-host-key-fingerprint.test.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
