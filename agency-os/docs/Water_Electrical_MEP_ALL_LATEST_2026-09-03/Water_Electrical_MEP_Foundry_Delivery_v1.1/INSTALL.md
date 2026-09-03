# Install / Validate Latest MEP Delivery

## Validate complete delivery
```bash
python scripts/validate_delivery.py
```
Expected: `DELIVERY VALIDATION: PASS`.

## Validate Phase 1 RWD/offline boundary
```bash
python project-instance/phase1-repo/water-electrical-ops/scripts/validate_rwd_boundary.py
```
Expected: `RWD/OFFLINE BOUNDARY: PASS`.

## Re-resolve MEP questionnaire if answers later change
```bash
python scripts/resolve_industry_pack.py --questionnaire project-instance/intake/prefilled-industry-questionnaire.json --through-phase P1 --out /tmp/mep-p1.json
```

The Industry Pack can be installed into a System Foundry checkout with `scripts/install_industry_pack.py`.
