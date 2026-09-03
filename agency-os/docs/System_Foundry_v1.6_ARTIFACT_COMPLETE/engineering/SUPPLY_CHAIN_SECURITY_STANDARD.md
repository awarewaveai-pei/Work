# Software Supply Chain Security Standard

Every build/release pipeline MUST protect source-to-artifact provenance.

Minimum controls by applicable profile:
- dependency lockfiles and reproducible dependency resolution
- dependency vulnerability and license scanning
- secret scanning
- SAST; DAST where externally reachable
- SBOM generation for releasable artifacts
- artifact checksum/signature and provenance attestation
- protected CI identities with least privilege and short-lived credentials
- pinned/verified CI actions and build images
- trusted artifact registry
- deploy only artifacts produced by approved CI
- emergency revocation and rebuild procedure
- dependency update and EOL policy

Critical releases fail closed on unresolved critical supply-chain findings unless an R4 exception is explicitly approved and legally/security permissible.
