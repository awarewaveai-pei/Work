#!/usr/bin/env python3
from pathlib import Path
import json, hashlib, sys
ROOT=Path(__file__).resolve().parents[1]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    m=json.loads((ROOT/'manifest.json').read_text())
    actual=sorted(str(p.relative_to(ROOT)).replace('\\','/') for p in ROOT.rglob('*') if p.is_file() and p.name!='manifest.json' and '__pycache__' not in p.parts)
    expected=m.get('files',[])
    e=[]
    if actual!=expected: e.append('file inventory drift')
    if m.get('file_count')!=len(actual)+1: e.append('file_count drift')
    hashes=m.get('file_hashes',{})
    if set(hashes)!=set(actual): e.append('manifest hash inventory drift')
    for rel in actual:
        if hashes.get(rel)!=sha(ROOT/rel): e.append('hash drift: '+rel)
    if e:
        print('MANIFEST VALIDATION: FAIL'); [print('- '+x) for x in e]; return 1
    print('MANIFEST VALIDATION: PASS'); return 0
if __name__=='__main__': sys.exit(main())
