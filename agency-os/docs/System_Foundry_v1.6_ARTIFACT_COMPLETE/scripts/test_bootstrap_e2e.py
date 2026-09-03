#!/usr/bin/env python3
from pathlib import Path
import tempfile, subprocess, sys, json
ROOT=Path(__file__).resolve().parents[1]
def main():
    with tempfile.TemporaryDirectory() as td:
        r=subprocess.run([sys.executable,str(ROOT/'scripts/foundry_new.py'),'demo-system','--out',td,'--profile','standard','--archetype','web_application'],capture_output=True,text=True)
        if r.returncode: print(r.stdout+r.stderr); return 1
        p=Path(td)/'demo-system'
        req=['README.md','src','tests/unit','tests/integration','tests/contract','tests/e2e','infra','docs','.foundry/foundry-lock.json','.foundry/control-plane-version.json','.foundry/artifact-index.json','.foundry/project-profile.json','.foundry/evidence-register.json','.foundry/migration-history']
        missing=[x for x in req if not (p/x).exists()]
        if missing: print('BOOTSTRAP E2E: FAIL',missing); return 1
        lock=json.loads((p/'.foundry/foundry-lock.json').read_text())
        if lock['foundry_version']!='1.6.0' or len(lock['kernel_digest'])!=64: print('BOOTSTRAP E2E: FAIL lock'); return 1
    print('BOOTSTRAP E2E: PASS'); return 0
if __name__=='__main__': sys.exit(main())
