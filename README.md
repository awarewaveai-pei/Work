# aware-wave-wp-bridge

A self-healing REST control plane that lets an AI agent operate an entire WordPress /
Kadence / WooCommerce site **safely, completely, and provably** — and prove every write
took effect before reporting success.

> **Positioning.** Most "let Claude edit WordPress" bridges are remote controls: they fire a
> write and hope. This one is a *control system with a feedback loop* — every mutation is a
> transaction that snapshots, applies, **re-renders the live page to verify the change took**,
> and **auto-rolls-back if it didn't**. A write is not "done" until the bridge has independently
> re-observed it.

## Why this exists / what makes it different

| Capability | Typical WP bridge | aware-wave-wp-bridge |
|---|---|---|
| Auth | HTTP Basic / static key, key acceptable in `?query=` (logged) | **Ed25519-signed requests**, header-only, timestamp + single-use nonce (replay-proof) |
| Secret at rest | plaintext credentials file on disk | site stores **only the public key** — a breach of the site cannot forge writes |
| Write safety | fire-and-hope | **snapshot → apply → render-verify → auto-rollback** transaction |
| Authorization | none on write endpoints | scope (read/write) + underlying **WP capability** assertion per route |
| Cache flush | single host (e.g. LiteSpeed), `shell_exec` | pluggable: LiteSpeed hook + Redis + Cloudflare purge-by-URL (no `shell_exec`) |
| Backend coverage | curated endpoints only | L1 generic option/meta/CPT + L2 typed adapters + L3 plugin lifecycle + L4 gated WP-CLI |
| Correctness | untested | PHPUnit + CI, incl. an auto-rollback integration proof |
| Block safety | manual `kbVersion:2` discipline | server-side `KadenceValidator` rejects malformed blocks **before** write |

## Design principles
1. **Verify, never assume.** The `/render` endpoint returns cache-bypassed HTML; it is the
   source of truth, not the browser.
2. **Reversible by construction.** Every write snapshots first; failed verification auto-restores.
3. **Least authority.** Read keys cannot write. Write keys still assert the WP capability the
   operation requires.
4. **Fail closed.** If the replay/nonce store is unavailable or verification is uncertain, the
   operation is rejected or rolled back — never silently allowed.

## Provenance & licensing
This is an **independent, clean-room implementation**. It was written from first principles and
from the documented behaviour of the WordPress REST and Kadence/WooCommerce data models; it does
**not** incorporate or derive from any third-party plugin's source code. The proprietary control
plane, generators, and SDK that consume this bridge are licensed separately and are not shipped to
customer servers.

## Status
🚧 Phase A (local sandbox). Building the security spine first. Not production-ready.

## Layout
```
aware-wave-wp-bridge.php     bootstrap (plugin header, autoload, route registration)
includes/
  Auth/SignatureVerifier.php HMAC canonical-request signing + timestamp/nonce checks (pure, unit-tested)
  Auth/KeyStore.php          scoped, hashed key records; issuance/rotation
  ...                        (Http/, Write/, Validate/, Cache/, Audit/ — see plan)
tests/                       PHPUnit (unit + wp-env integration)
openapi/                     OpenAPI 3.1 contract (source of truth for the typed client)
```

## Related Documents (Auto-Synced)
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/overview/EXECUTION_DASHBOARD.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `README.md`

_Last synced: 2026-10-27 06:08:42 UTC_

