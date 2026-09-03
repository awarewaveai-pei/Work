#!/usr/bin/env python3
from pathlib import Path
import json, sys
from schema_runtime import validate, SchemaViolation
ROOT=Path(__file__).resolve().parents[1]
def main():
    base=ROOT/'tests/fixtures/contracts'; errors=[]; total=0
    for kind,should_pass in [('valid',True),('invalid',False)]:
        for p in sorted((base/kind).glob('*.json')):
            total+=1; data=json.loads(p.read_text()); schema=json.loads((ROOT/'schemas'/data.pop('_schema')).read_text())
            try: validate(data,schema); passed=True
            except SchemaViolation: passed=False
            if passed!=should_pass: errors.append(f'{kind}/{p.name}: expected {should_pass}, got {passed}')
    if not total: errors.append('no contract fixtures found')
    if errors:
        print('CONTRACT FIXTURE VALIDATION: FAIL'); [print('- '+x) for x in errors]; return 1
    print(f'CONTRACT FIXTURE VALIDATION: PASS ({total} fixtures)'); return 0
if __name__=='__main__': sys.exit(main())
