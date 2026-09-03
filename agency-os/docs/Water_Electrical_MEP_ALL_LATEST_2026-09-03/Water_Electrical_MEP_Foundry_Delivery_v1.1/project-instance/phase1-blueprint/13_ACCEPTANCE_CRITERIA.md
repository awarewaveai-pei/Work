# Phase 1 Acceptance Criteria

## Online dispatch acceptance
All 11 source-defined steps in `sources/water_electrical_project_management_spec.md:1103-1128` must pass together: company source-of-truth save, company calendar, My Dispatch, Google event create/update, LINE notification, acknowledgement, status visibility, re-ack on amendment, no duplicate Google event, amendment notification and audit before/after.

## RWD acceptance
- same web application supports desktop/tablet/mobile browser widths;
- no native mobile application or separate mobile business logic;
- no installable PWA manifest requirement.

## Offline acceptance
- current/next dispatch + site summary previously synchronized are readable without network;
- dispatch acknowledgement can queue offline with stable idempotency key;
- reconnect sync re-authorizes user and checks dispatch revision;
- valid queued acknowledgement commits once; retry is idempotent;
- stale queued acknowledgement after a dispatch amendment is rejected/conflicted and requires current-version acknowledgement;
- provider side effects happen only after company-system commit and are independently retryable;
- cache/session isolation prevents cross-user data exposure;
- offline conflicts/backlog are observable and recoverable.
