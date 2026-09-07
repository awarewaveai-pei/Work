# Threat Model — File Ingestion

P0-08 / 2 of 4. Named threats (`21_HCI_TOP_TIER_GAP_ANALYSIS.md` P0-08):
malware, decompression bombs, malicious MIME.

## Status: blocked on a nonexistent product feature — genuinely OPEN, not invented

Checked (grep across the full V2 blueprint, the research-review corpus, and
this repository's `Projects/internal/hci30/`) for any of: user file upload,
document upload, attachment upload, malware scanning, antivirus, ClamAV, MIME
type validation. **Zero matches outside this gap-analysis line itself.**
HCI30's only content-ingestion path is the Public Intelligence pipeline's
*outbound* web fetch (`06_HCI30_PUBLIC_INTELLIGENCE.md` — HCI fetches URLs it
chooses; a Subject or tenant does not upload files to HCI). No document
anywhere in the corpus describes a user-facing file-upload feature, an
accepted file-type list, a storage path for uploaded bytes, or a scanning
step.

This means malware / decompression-bomb / malicious-MIME threats have no
feature to threat-model yet — writing mitigations for an undesigned upload
pipeline would be inventing product scope this session has no authority to
decide, the same discipline already applied to P0-04's three genuinely-open
specs (`docs/intelligence/{HCI_PERMISSION_SPEC,HCI_CONTRADICTION_SPEC,
HCI_TIME_DECAY_SPEC}.md`) and P0-03's hash-chain item: describing precisely
why something is blocked, rather than a speculative mechanism dressed up to
look complete.

## What would unblock this

A product decision that HCI accepts user-uploaded files (evidence
attachments, case documents, etc.) — which entity they attach to (Evidence?
a new Attachment table?), and where the bytes are stored (this repo's
existing `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` §Raw content storage
pattern — object storage with a hash+metadata pointer in Postgres, per
`06_HCI30_PUBLIC_INTELLIGENCE.md` §Raw content storage — is the established
precedent this feature would presumably follow, but that is a design
suggestion, not a decision recorded anywhere today). Until that
product decision exists, this file cannot honestly contain more than this
status note.

## Related

[TM_PUBLIC_INTELLIGENCE.md](TM_PUBLIC_INTELLIGENCE.md) — the only content-
ingestion path that does exist today, and its own SSRF/injection threats
(different shape: outbound fetch of attacker-influenced URLs, not inbound
user-uploaded bytes).
