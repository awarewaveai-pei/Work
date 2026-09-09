# Video LEGO platform

## Current production baseline

- VideoStudio: Quick Engine, R2, native 16:9/9:16/4:5, Remotion, WordPress and Postiz adapters are live.
- `media_qa_reports`, `media_releases`, `media_delivery_attempts`, billing and real-footage tables are active from migrations 0065–0067.
- Footage audio/caption canary passed; ks-aw-01 has no GPU.
- Existing meeting transcription service is outside this platform and must not be changed for video work.

## Current hardening change (pending deploy)

- Release and preflight resolve QA only from server-owned, checksum-matched DB rows; browser QA JSON is retired.
- Only owner/admin can approve a Release.
- Postiz/WordPress must atomically claim a delivery receipt before their first external write. Migration `0068_media_delivery_dispatch_guard.sql` adds this guard. A stuck `dispatching` receipt requires reconciliation, never blind replay.
- Billing/BYO configuration is owner/admin only; callers cannot supply a Vault reference.

## External work still required

1. Create a dedicated Cloudflare Tunnel hostname for a **new video-only GPU worker** on the RTX laptop. It must expose only its authenticated video endpoint. Do not expose or modify meeting-service endpoints.
2. Add Stripe test/live prices and webhook credentials if paid subscriptions are required. The code stays fail-closed without them.
3. Connect Postiz/platform analytics credentials and schedule authenticated 24h/7d/30d outcome imports.

## Canonical references

- `CURRENT_BASELINE_AND_GAP_AUDIT.md`: historical verified baseline.
- `VIDEO_SYSTEM_GAP_AUDIT_2026-09-09.md`: live evidence and remaining gaps.
- `MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md`: four LEGO domains and contracts.
- `MEDIA_PRODUCTION_LEGO_PHASED_DELIVERY_PLAN.md`: rollout order and acceptance gates.
- `PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md`, `PHASE_4_MEDIA_QA_AND_RELEASE_GATE_CONTRACT.md`, `PHASE_5_SHORT_DRAMA_AND_FOOTAGE_EDIT_CONTRACT.md`, `PHASE_6_DELIVERY_OUTCOMES_AND_COMMERCIAL_CONTRACT.md`: detailed contracts.

Historical material is in `_archive_legacy_p7_2026-09-06/`; it is not an execution source.
