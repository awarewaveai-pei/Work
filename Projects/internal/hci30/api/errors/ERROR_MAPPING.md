# HCI API Error Mapping (P0-06)

New artifact. Maps existing `H1xxx` SQLSTATEs to HTTP status. Meanings are defined once in `database/ERROR_CODE_REGISTRY.md` (SSOT) — not redefined here; this table only adds the HTTP-status axis. Update this table in the same commit that adds a row there (same discipline as that file's own maintenance rule).

| SQLSTATE | HTTP | Registry meaning (see ERROR_CODE_REGISTRY.md for full text) |
|---|---|---|
| H1001 | 403 | tenant authorization not ACTIVE |
| H1002 | 409 | DSR lifecycle transition rejected |
| H1003 | 409 | append-only mutation rejected |
| H1004 | 422 | MATCH_CONFIRMED requires deterministic/human evidence |
| H1005 | 409 | last supporting evidence for confirmed identity protected |
| H1006 | 403 | tenant_id immutable |
| H1007 | 409 | field immutable in row's current state |
| H1008 | 409 | predecessor already superseded — concurrency collision, see `../API_CONTRACT_STANDARD.md#concurrency` |
| H1009 | 410 | record already erased (tombstoned) |
| H1010 | 409 | case lifecycle transition rejected |
| H1011 | 409 | case not OPEN/ACTIVE |
| H1012 | n/a | reserved, not raised — real path is `23514` -> 400 |
| H1013 | 403 | author_class policy violation |
| H1014 | 422 | Claim admitted without approved human spot-check |
| H1015 | 409 | reaudit_required Claim linked to a terminal Decision |
| H1016 | 422 | Claim linked is not an approved Assessment Candidate |
| H1017 | 409 | risk_tier elevation retroactively flags an already-linked Claim |
| H1018 | n/a | reserved, not raised — currently unreachable |
| H1019 | 403 | epistemic promotion to SOURCE_FACT without a human verifier |

Generic Postgres codes not in the H1xxx registry: `23505` (unique violation) -> 409; `23514` (check violation) -> 400.
