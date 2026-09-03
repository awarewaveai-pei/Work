#!/usr/bin/env python3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
errors=[]
for rel in ['apps/mobile','capacitor.config.ts','cordova.xml','manifest.webmanifest','public/manifest.webmanifest']:
    if (root/rel).exists(): errors.append('forbidden: '+rel)
for p in root.rglob('*'):
    if p.is_file() and p.suffix.lower()=='.webmanifest': errors.append('forbidden installable-PWA manifest: '+str(p.relative_to(root)))
required=['apps/web/RWD_CONTRACT.md','apps/web/OFFLINE_WEB_CONTRACT.md','packages/offline-sync/README.md','packages/offline-sync/OFFLINE_SCOPE.json','tests/contract/offline/README.md','docs/LABOR_TIME_BOUNDARY.md','docs/ACCOUNTING_INTEGRATION_BOUNDARY.md']
for rel in required:
    if not (root/rel).exists(): errors.append('missing: '+rel)
if errors:
    print('RWD/OFFLINE BOUNDARY: FAIL')
    for e in errors: print('-',e)
    raise SystemExit(1)
print('RWD/OFFLINE BOUNDARY: PASS')
