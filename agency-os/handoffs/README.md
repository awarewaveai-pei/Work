# agency-os/handoffs/

Carry-over packets written by `/tomo`. Each file captures unfinished work so the next
session's AO-RESUME can pick it up without re-deriving context from chat history.

## Naming Convention

```
YYYY-MM-DD-HHmm-<slug>.md
```

- `YYYY-MM-DD-HHmm` — local time when `/tomo` was invoked
- `<slug>` — kebab-case derived from the hint (first 3-4 meaningful words)

Example: `2026-05-24-0030-tomo-feature-v2.md`

## Packet Format

See [SCHEMA.md](SCHEMA.md) — single source of truth for frontmatter + 6-segment body.

## Pending vs Consumed

State is determined by `agency-os/TASKS.md`, not by the packet file itself:

| TASKS.md row | Meaning |
|-------------|---------|
| `- [ ] … → handoffs/<file>` | pending — AI should inline at AO-RESUME |
| `- [x] … → handoffs/<file>` | consumed — skip at AO-RESUME |

No `consumed` field in packet frontmatter — TASKS.md row state is the only SSOT.

## Prune Policy

Packets older than **90 days** are deleted during AO-RESUME Step 3,
regardless of consumed status. `SCHEMA.md` and `README.md` are never pruned.
