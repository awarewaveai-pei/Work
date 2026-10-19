#!/usr/bin/env python3
# Non-blocking by design (V17-2): makes missing capability acceptance visible in `make verify`; always exits 0.
from collections import Counter
from configurator_engine import load

def main():
    caps=load('capabilities/catalog.json')['capabilities']
    missing=[c for c in caps if not c.get('acceptance')]
    print(f'ACCEPTANCE GAP: {len(missing)} of {len(caps)} capabilities have no acceptance')
    for mid,n in sorted(Counter(c['module'] or '(no module)' for c in missing).items(),key=lambda x:(-x[1],x[0]))[:10]:
        print(f'  {mid}: {n}')
    return 0
if __name__=='__main__': raise SystemExit(main())
