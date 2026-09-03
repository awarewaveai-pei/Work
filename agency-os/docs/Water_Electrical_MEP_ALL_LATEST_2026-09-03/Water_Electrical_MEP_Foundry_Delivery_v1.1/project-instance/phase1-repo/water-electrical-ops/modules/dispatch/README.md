# Dispatch Module

Owns planned company work assignment, multi-person/crew membership, revisions and acknowledgement lifecycle.

Invariants:
- one work assignment is one Dispatch regardless of member count;
- acknowledgement binds to a Dispatch revision;
- material amendment invalidates old acknowledgement;
- Dispatch time is planned assignment time, **not actual attendance or approved labor time**;
- offline acknowledgement is a queued intent and must be re-authorized/version-checked by server before commit.
