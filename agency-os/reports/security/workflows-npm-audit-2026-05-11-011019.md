# Workflows npm audit report

- Generated UTC: 2026-05-11T01:10:19.203Z
- Path: `lobster-factory/packages/workflows`
- Total: 4
- Critical: 0
- High: 1
- Moderate: 3
- Low: 0

## Findings

- `express-rate-limit`: severity=`moderate`, direct=`false`, fixAvailable=`true`, via=ip-address
- `fast-uri`: severity=`high`, direct=`false`, fixAvailable=`true`, via=fast-uri (1117870), fast-uri (1117884)
- `hono`: severity=`moderate`, direct=`false`, fixAvailable=`true`, via=hono (1117763), hono (1117764), hono (1117915), hono (1117916), hono (1117919)
- `ip-address`: severity=`moderate`, direct=`false`, fixAvailable=`true`, via=ip-address (1117683)

## Decision template

- Upgrade available now? (yes/no)
- If no: acceptable risk window (date range)
- Next review trigger (new upstream version / weekly AO-RESUME check)
