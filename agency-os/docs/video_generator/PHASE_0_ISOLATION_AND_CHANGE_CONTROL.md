# Phase 0 — isolation, backup and change-control record

**Status:** ACTIVE — read-only baseline and isolated implementation workspace established
**Date:** 2026-09-06
**Scope:** Media Production LEGO Platform, beginning with the existing VideoStudio at `https://app.aware-wave.com/tools/video`
**Production change made by this record:** none

## 1. Safety decision

The existing VideoStudio is a live, multi-step production path. New work will therefore be built in an isolated Git worktree first and attached to the existing path only after contract tests, staging verification, rollback rehearsal and an explicit deployment decision.

This record does **not** create a website snapshot, invoke a render, write a database record, alter R2, call WordPress, call Postiz, apply a migration or deploy a container.

## 2. Immutable code baseline

| Item | Exact value | Expected result |
|---|---|---|
| Main workspace | `D:\\Work` | Left untouched because it contains unrelated uncommitted work. |
| Isolated implementation workspace | `D:\\Worktrees\\media-video-phase0` | Only this directory may receive media-platform source changes. |
| Isolated branch | `codex/media-video-phase0` | All implementation commits remain separately reviewable and reversible. |
| Baseline commit | `8570b74f07e3c7cd119d747c285f5055f3184742` | A known, reproducible rollback point before media-platform work. |
| Existing documentation location | `D:\\Work\\agency-os\\docs\\video_generator` | Plans, evidence, design decisions, test receipts and rollback instructions remain discoverable in one location. |

**Verification command**

```powershell
git -C D:\\Worktrees\\media-video-phase0 status --short
git -C D:\\Worktrees\\media-video-phase0 rev-parse HEAD
```

**Expected result:** no source changes before an approved change package; `HEAD` resolves to the baseline commit above.

## 3. Existing backup evidence

The current backup-health report is **PASS**, generated at `2026-09-06 01:30:17`. It records a verified backup from `2026-09-05` for each reported stack and a passing verification run:

| Protected stack in report | Latest backup | Latest verification | Source evidence |
|---|---|---|---|
| lobster | 2026-09-05 02:00:02 | PASS at 2026-09-05T02:30:16Z | `D:\\Work\\agency-os\\reports\\status\\backup-health-LATEST.md:3-14` |
| stack | 2026-09-05 02:33:09 | PASS at 2026-09-05T03:00:32Z | `D:\\Work\\agency-os\\reports\\status\\backup-health-LATEST.md:16-27` |
| ks-aw-01 | 2026-09-05 02:17:35 | PASS at 2026-09-05T02:45:21Z | `D:\\Work\\agency-os\\reports\\status\\backup-health-LATEST.md:29-40` |

This is infrastructure backup evidence, not permission to alter production. Before a future schema migration or production deployment, the release gate must record: the current backup timestamp, target service, migration checksum, restoration command, and a rollback owner. A production deployment is blocked if that record is missing or stale.

## 4. Verified service-boundary facts

| Finding | Evidence | Decision before implementation |
|---|---|---|
| Video service Compose publishes only to host loopback and its comments require `RENDER_AUTH_TOKEN`. | `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\video-service\\docker-compose.video.yml:1-8,24-50` | Preserve the loopback boundary. Verify deployed secret presence without exposing its value. |
| Quick Engine source accepts every request when `RENDER_AUTH_TOKEN` is empty. | `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\video-service\\server.py:50-51,81-85,518-519` | Treat as a fail-open defect. Do not change production until an authenticated staging test and a backwards-compatible fail-closed rollout plan exist. |
| Remotion Compose injects `RENDER_AUTH_TOKEN`, but Remotion source also accepts requests when it is empty. | `D:\\Worktrees\\media-video-phase0\\lobster-factory\\infra\\hetzner-phase1-core\\apps\\remotion-service\\docker-compose.remotion.yml:23-34`; `apps/remotion-service/src/server.ts:21,27-31` | Treat as the same fail-open class. Correct both services under one tested policy; do not create two incompatible authentication rules. |
| Current backup report passes. | `D:\\Work\\agency-os\\reports\\status\\backup-health-LATEST.md:1-40` | No additional production backup is needed for this read-only phase. A fresh release-specific backup is mandatory before any production data mutation. |

## 5. Change gates

No source change may bypass these gates:

1. **Contract gate:** define the capability input, output, tenancy rule, error taxonomy and rollback action before implementation.
2. **Compatibility gate:** identify every existing caller and prove the current Quick Engine path remains functional.
3. **Test gate:** add positive and negative tests, then run the narrow service tests and the relevant build/type checks in the isolated worktree.
4. **Staging gate:** run one disposable, non-publishing tenant test; retain only job ID, artifact ID, correlation ID and non-secret error/output facts in the receipt.
5. **Release gate:** before any production deploy or migration, capture a fresh backup reference, migration checksum, deployment version, health result and rollback command.
6. **Connection gate:** attach a new capability to VideoStudio behind a registered capability/feature state only after all prior gates pass. The existing path remains the fallback until the new path has evidence.

## 6. Next construction package

The next package is **Phase 0B: authenticated baseline verification and configuration reconciliation**. It is limited to read-only inspection plus an isolated, non-publishing smoke run. Its output will be a receipt that either proves the existing Quick Engine user journey or classifies the exact failing boundary. It will not add Timeline, Whisper, QA, Release, database tables, provider integrations or publishing behavior.

After that receipt, the first code package will be **Phase 1A: renderer authentication fail-closed design and tests**. It will be reviewed as one compatibility-preserving change across Quick Engine, Remotion, their callers and deployment manifests. No implementation begins from this record alone.

## 7. Live read-only observation — 2026-09-06

| Check | Result | Evidence | Consequence |
|---|---|---|---|
| Quick Engine public health | PASS | `curl.exe -fsS --max-time 10 https://video-svc.aware-wave.com/health` returned `ok: true` with native format, dimension and OpenAI TTS capabilities. | The public health endpoint is reachable; this does not authenticate rendering or prove tenant isolation. |
| Remotion public health | PASS | `curl.exe -fsS --max-time 10 https://remotion-svc.aware-wave.com/health` returned `ok: true, version: 1.0.0`. | The public health endpoint is reachable; this does not authenticate rendering or prove durable recovery. |
| SSH alias target | UNVERIFIED | Read-only `ssh hetzner ...` to `5.223.93.113:22` timed out on 2026-09-06. | No deployment-container or token-state assertion can use this alias. |
| Operator-confirmed current host | PASS | User confirmed 145.239.195.47:58122 with ubuntu and sudo; strict-key read-only SSH verified hostname ns31414856 and Docker inventory on 2026-09-06. | This is the only approved deployment-inspection path. It may be used for read-only evidence and controlled staging work; deployment remains gated by the change package. |

**Connection gate update:** authenticated staging rendering, production deployment, authentication-policy changes and any schema migration remain blocked until an operator path can read the active deployment state without exposing secrets. The available health checks are retained as availability evidence only.

## 8. SSH host-identity safety gate — 2026-09-06

| Check | Result | Evidence | Required action |
|---|---|---|---|
| Credential document target | `root@204.168.175.41` is the documented EU SSH target. | `C:\\Users\\user1115\\AWARE_WAVE_CREDENTIALS.md:18-37` (read without exposing credentials). | Use this path only after host identity is verified. |
| SSH host identity | BLOCKED | The remote presented an ED25519 host key that does not match the existing trusted key material for `204.168.175.41` in `C:\\Users\\user1115\\.ssh\\known_hosts`; SSH strict host checking rejected the connection. | Do not delete or replace `known_hosts`, disable strict checking, or accept the new key from this network path. |
| Trusted replacement evidence | NOT FOUND | Credential and migration/runbook search found no approved new host-key fingerprint or completed host-switch record for this endpoint. | Obtain the new fingerprint from an independently authenticated console/runbook or the operator who performed the host rebuild, then record the verification source and update the known-host entry through the approved procedure. |

The key mismatch is a security control, not evidence of a service outage. Public renderer health checks remain availability evidence only; they do not authorize deployment inspection.
