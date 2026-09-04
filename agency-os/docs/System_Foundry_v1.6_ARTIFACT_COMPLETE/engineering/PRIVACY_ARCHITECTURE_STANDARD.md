# Privacy Architecture Standard

Personal data MUST be inventoried and classified before it is architecturally acceptable to collect it, not discovered after the fact during an incident or audit.

Required: a maintained data inventory mapping each personal-data field to its purpose, retention period, and legal basis; purpose limitation (data collected for one purpose is not silently reused for another without re-evaluation); a technically implemented right-to-erasure path, not just a policy document, consistent with `commercial/CUSTOMER_EXIT_STANDARD.md`; a defined process for Data Subject Access Requests (DSAR) with a stated turnaround time; explicit handling of cross-border data transfer constraints; and a disclosed, current list of subprocessors with access to personal data.

Data minimization applies by default: a field MUST NOT be collected because it might be useful later without a stated purpose now. Encryption at rest and in transit is a baseline, not an enhancement (`engineering/SECURITY_ARCHITECTURE_STANDARD.md`).
