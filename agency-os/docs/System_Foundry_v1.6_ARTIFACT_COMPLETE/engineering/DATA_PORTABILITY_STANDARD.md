# Data Portability Standard

Customers own their data (`commercial/CUSTOMER_DATA_OWNERSHIP.md`) and MUST be able to get it out in a usable form on demand.

Required: a documented export format (machine-readable, e.g. structured JSON/CSV, not a rendered PDF only), completeness guarantee (export covers all customer-owned data, not a curated subset), checksums or equivalent integrity verification on exported bundles, attachment/binary-asset inclusion (not just metadata rows), a defined procedure for exporting across a version migration so old exports remain interpretable, and a defined procedure for exporting a specific tenant's slice out of a shared multi-tenant store without leaking other tenants' data.

An export request MUST have a stated maximum turnaround time. A "we can technically query the database" capability is not portability; portability requires a self-service or support-initiated export path that a non-engineer can trigger and verify.
