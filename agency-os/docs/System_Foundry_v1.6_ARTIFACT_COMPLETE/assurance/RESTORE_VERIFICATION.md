# Restore Verification Standard

A backup is unproven until a real restore has actually been performed from it — "the backup job exited 0" is evidence the backup ran, not evidence it is restorable.

Required: a maintained inventory of what is backed up and at what cadence, a restore rehearsal performed on a defined periodic cadence (not only after an incident forces it), integrity verification after restore (data is checked for correctness/completeness, not just "the restore command completed"), and recorded restore-time evidence compared against the stated RTO (`engineering/SRE_STANDARD.md`).

A restore rehearsal MUST target an environment isolated from production so the rehearsal itself cannot cause an incident. Any backup whose restore has never been rehearsed MUST be treated as unverified and reported as such, not silently assumed to work because the backup step succeeds.
