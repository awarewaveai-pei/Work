# VPS auto-reboot health

- Generated: 2026-08-28 10:30:07 UTC
- **Verdict: [YELLOW] topology-retired**

SG/EU were consolidated onto ks-aw-01 on 2026-08-28 and are pending deletion.
The auto-reboot system existed only on those machines. ks-aw-01 has NO
auto-reboot **by design pending an operator decision** (daily reboot of the
single consolidated host = daily full-stack outage window).

AO-RESUME reading this: reboot signals for ks-aw-01 are always manual +
High-risk go-ahead; there is no 16h auto-window any more.
