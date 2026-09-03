#!/usr/bin/env python3
from pathlib import Path
import argparse, hashlib, json
ROOT=Path(__file__).resolve().parents[1]; VERSION='1.6.0'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    ap=argparse.ArgumentParser(description='Regenerate kernel and package integrity metadata after an approved Foundry change.'); ap.add_argument('--write',action='store_true'); a=ap.parse_args()
    kfiles=sorted(str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'kernel').glob('*.md'))
    items=[{'path':r,'sha256':sha(ROOT/r)} for r in kfiles]
    kd=hashlib.sha256(json.dumps(items,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if not a.write:
        print('dry-run kernel_digest='+kd); print('Use --write only after approved change + tests.'); return 0
    kr={'version':VERSION,'mode':'non_overridable_monotonic','files':items,'kernel_digest':kd}
    # newline='\n' pinned everywhere below: Path.write_text() otherwise applies the
    # platform default newline translation (CRLF on Windows), which changes the raw
    # bytes sha() hashes on the very next run and made this tool non-idempotent
    # (observed: two consecutive `make verify` runs on Windows produced a spurious
    # "hash drift: registries/kernel.yaml / runtime/agent-roles.yaml" with zero real
    # content difference -- git diff --ignore-all-space confirmed).
    (ROOT/'registries/kernel.yaml').write_text(json.dumps(kr,indent=2)+'\n',encoding='utf-8',newline='\n')
    roles=json.loads((ROOT/'runtime/agent-roles.yaml').read_text(encoding='utf-8')); roles['inheritance']['kernel_digest']=kd; roles['inheritance']['kernel_version']=VERSION; (ROOT/'runtime/agent-roles.yaml').write_text(json.dumps(roles,indent=2)+'\n',encoding='utf-8',newline='\n')
    files=sorted(str(p.relative_to(ROOT)).replace('\\','/') for p in ROOT.rglob('*') if p.is_file() and p.name!='manifest.json' and '__pycache__' not in p.parts)
    m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8')); m['kernel_digest']=kd; m['files']=files; m['file_count']=len(files)+1; m['file_hashes']={r:sha(ROOT/r) for r in files}; (ROOT/'manifest.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('integrity metadata regenerated')
if __name__=='__main__': raise SystemExit(main())
