#!/usr/bin/env python3
from pathlib import Path
import json,sys
from configurator_engine import ROOT,load,eval_condition

def main():
    errors=[]; catalog=load('questionnaires/catalog.json'); cats={c['id'] for c in catalog['categories']}; qids=[q['id'] for q in catalog['questions']]; qset=set(qids)
    if len(qids)!=len(qset): errors.append('duplicate question id')
    for q in catalog['questions']:
        if q['category'] not in cats: errors.append(q['id']+': unknown category')
        if q.get('answer_type')!='boolean': errors.append(q['id']+': non-binary answer type')
        def refs(c):
            if not c:return []
            if 'question'in c:return [c['question']]
            return sum((refs(x) for x in c.get('all',[])+c.get('any',[])),[])
        for r in refs(q.get('active_when')):
            if r not in qset: errors.append(q['id']+': active_when unknown '+r)
    caps={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}
    for c in caps.values():
        for r in c['requires']:
            if r not in caps: errors.append(c['id']+': missing dependency '+r)
    for rr in ['question-rules.json','derivation-rules.json']:
        for r in load('rules/'+rr)['rules']:
            for key in ['require','defer','derive']:
                for cid in r.get(key,[]):
                    if cid not in caps: errors.append(r['id']+': unknown capability '+cid)
            if 'when' in r and r['when'].get('question') not in qset: errors.append(r['id']+': unknown question')
            if 'when_capability' in r and r['when_capability'] not in caps: errors.append(r['id']+': unknown when capability')
    # capability graph cycle check
    visiting=set(); done=set()
    def dfs(cid):
        if cid in visiting: errors.append('capability cycle at '+cid); return
        if cid in done:return
        visiting.add(cid)
        for d in caps[cid]['requires']: dfs(d)
        visiting.remove(cid); done.add(cid)
    for cid in caps: dfs(cid)
    mods={m['id'] for m in load('generation/module-manifests.json')['modules']}
    for c in caps.values():
        if c.get('module') and c['module'] not in mods: errors.append(c['id']+': unknown module '+c['module'])
    if errors:
        print('CONFIGURATOR VALIDATION: FAIL'); [print('- '+e) for e in errors]; return 1
    print(f'CONFIGURATOR VALIDATION: PASS questions={len(qids)} capabilities={len(caps)} modules={len(mods)}'); return 0
if __name__=='__main__': sys.exit(main())
