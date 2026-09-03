#!/usr/bin/env python3
from pathlib import Path
import json, sys
from semantic import *
ROOT=Path(__file__).resolve().parents[1]
VERSION='1.6.0'

def main():
    e=[]
    try:
        statuses=load_jsonish(ROOT/'registries/status-codes.yaml')['codes']
        gates=load_jsonish(ROOT/'runtime/stage-gates.yaml')
        orch=load_jsonish(ROOT/'runtime/orchestration.yaml')
        validate_dag(orch['stages'])
        gate_ids=set(gates['gates'])
        for s in orch['stages']:
            if s.get('gate') and s['gate'] not in gate_ids: e.append(f"orchestration stage {s['id']} references missing gate {s['gate']}")
        for gid,g in gates['gates'].items():
            for code in g.get('stop_on',[]):
                if code not in statuses: e.append(f'{gid}: unknown status code {code}')
        for p in (ROOT/'profiles').glob('*.yaml'):
            d=load_jsonish(p)
            if d.get('version')!=VERSION: e.append(f'{p.relative_to(ROOT)} version drift')
            refs=d.get('required_gates')
            if refs!='ALL':
                for x in refs:
                    if x not in gate_ids: e.append(f'{p.relative_to(ROOT)} missing gate ref {x}')
            for x in d.get('conditional_gates',[]):
                if x not in gate_ids: e.append(f'{p.relative_to(ROOT)} missing conditional gate ref {x}')
        # recipe registry consistency
        reg=set(load_jsonish(ROOT/'registries/workflow-stages.yaml')['stages'])
        recipe=load_jsonish(ROOT/'recipes/build-universal-system.yaml')
        if set(recipe['stages'])-reg: e.append('recipe contains unregistered stages')
        # kernel inheritance + digest
        kr=load_jsonish(ROOT/'registries/kernel.yaml')
        roles=load_jsonish(ROOT/'runtime/agent-roles.yaml')
        if roles['inheritance']['kernel_digest']!=kr['kernel_digest']: e.append('agent roles kernel digest drift')
        calc=[]
        for x in kr['files']:
            p=ROOT/x['path']
            if not p.is_file(): e.append('kernel file missing: '+x['path']); continue
            h=sha256_file(p)
            if h!=x['sha256']: e.append('kernel hash drift: '+x['path'])
            calc.append({'path':x['path'],'sha256':h})
        import hashlib
        digest=hashlib.sha256(json.dumps(calc,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        if digest!=kr['kernel_digest']: e.append('kernel registry digest invalid')
        # agent schema version aligns
        ag=json.loads((ROOT/'schemas/agent-contract.schema.json').read_text())
        if ag['properties']['kernel_version'].get('const')!=VERSION: e.append('agent contract kernel version drift')
        # machine runtime version consistency
        for rel in ['runtime/stage-gates.yaml','runtime/orchestration.yaml','runtime/agent-roles.yaml','runtime/enforcement.yaml','runtime/execution-state-machine.yaml','recipes/build-universal-system.yaml']:
            if load_jsonish(ROOT/rel).get('version')!=VERSION: e.append(rel+' version drift')
    except Exception as x:
        e.append('semantic validator exception: '+repr(x))
    if e:
        print('SEMANTIC VALIDATION: FAIL'); [print('- '+x) for x in e]; return 1
    print('SEMANTIC VALIDATION: PASS'); return 0
if __name__=='__main__': sys.exit(main())
