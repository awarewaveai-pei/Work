# License Architecture Standard

## Purpose
Define how a signed license (distinct from an online entitlement check) is issued, validated, and revoked — this matters specifically where a deployment cannot always phone home (`commercial/PRIVATE_DEPLOYMENT_STANDARD.md`).

## License vs. Entitlement
1. A license and an entitlement are distinct: a license is a portable, cryptographically verifiable grant that can be validated without a live connection to the issuer; an entitlement (`commercial/ENTITLEMENT_STANDARD.md`) is a live authoritative-store record. A system MUST NOT conflate them — where both exist, the license is the offline fallback, not a second source of truth that can silently diverge.
2. A license MUST encode: subject (customer/deployment), granted capabilities/seats, issue time, expiry, and a signature verifiable against a published public key. It MUST NOT embed secrets that, if extracted, grant capability beyond what the license itself represents.

## Issuance and Revocation
3. License issuance MUST be traceable to an authorized commercial event (new contract, renewal, seat change) per `governance/AUTHORITY_MODEL.md` — licenses MUST NOT be manually hand-crafted outside the issuance path except through a documented, audited break-glass procedure.
4. Revocation MUST be possible even for offline licenses: either a bounded validity window forcing re-issuance, or a revocation list checked opportunistically when connectivity is available. A license architecture with no revocation path for a compromised license is not acceptable.

## Offline and Grace Behavior
5. Offline/air-gapped deployments MUST define a maximum offline validity period after which the license enters a degraded/grace state, not a silent indefinite-valid state. The grace behavior (read-only, warning banner, hard stop) MUST be explicit per `commercial/PRIVATE_DEPLOYMENT_STANDARD.md`.
6. License expiry MUST NOT cause silent data loss. On expiry, access to already-stored data MUST degrade to at most read-only/export, consistent with `commercial/CUSTOMER_DATA_OWNERSHIP.md`'s rule that export MUST NOT be withheld as commercial leverage outside a fully terminal state.

## Seats and Enforcement
7. Seat-based licenses MUST define enforcement point and behavior on over-seat conditions (block new seat vs. flag for reconciliation) — silent unenforced seat counts are prohibited once seats are a licensed dimension.

## Verification
8. License validation logic MUST be testable offline with golden valid/expired/tampered/revoked fixtures (mirrors `assurance/GOLDEN_TEST_STANDARD.md`'s requirement that negative fixtures name the exact rule they violate).
