#!/usr/bin/env python3
from pathlib import Path
import sys
from configurator_engine import ROOT,load

def main():
    errors=[]
    mods={m['id']:m for m in load('generation/module-manifests.json')['modules']}
    obs=load('generation/module-obligations.json')['modules']
    if set(mods)!=set(obs): errors.append('module obligations set != generation module set')
    for mid,o in obs.items():
        for key in ['purpose','invariants','security','tests','operations','recovery']:
            if not o.get(key): errors.append(f'{mid}: empty obligation {key}')
    caps={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}
    for cid,c in caps.items():
        mid=c.get('module')
        if mid:
            if mid not in mods: errors.append(f'{cid}: missing module {mid}')
            elif cid not in mods[mid].get('activated_by',[]): errors.append(f'{cid}: absent from module activated_by {mid}')
    for mid,m in mods.items():
        extra=set(m.get('activated_by',[]))-set(caps)
        if extra: errors.append(f'{mid}: unknown activated_by {sorted(extra)}')
    bmap=load('generation/blueprint-map.json')['documents']
    template={p.name for p in (ROOT/'templates/TOP_TIER_SYSTEM_BLUEPRINT').glob('*.md')}
    mapped=[x['file'] for x in bmap]
    if set(mapped)!=template or len(mapped)!=len(template): errors.append('blueprint map does not exactly cover templates')
    if len(template)!=73: errors.append(f'expected 73 blueprint templates, got {len(template)}')
    qids={q['id'] for q in load('questionnaires/catalog.json')['questions']}
    rqs=[r.get('when',{}).get('question') for r in load('rules/question-rules.json')['rules']]
    if set(rqs)!=qids or len(rqs)!=len(qids): errors.append('question rule coverage is not exactly 1:1')
    if errors:
        print('ARTIFACT GENERATION STATIC VALIDATION: FAIL'); [print('- '+x) for x in errors]; return 1
    print(f'ARTIFACT GENERATION STATIC VALIDATION: PASS modules={len(mods)} blueprints={len(template)} questions={len(qids)} capabilities={len(caps)}')
    return 0
if __name__=='__main__': raise SystemExit(main())
