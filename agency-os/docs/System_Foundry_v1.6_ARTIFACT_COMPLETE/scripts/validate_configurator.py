#!/usr/bin/env python3
from pathlib import Path
import json,sys
from configurator_engine import ROOT,load,eval_condition

def main():
    errors=[]; catalog=load('questionnaires/catalog.json'); cat_ids=[c['id'] for c in catalog['categories']]; cats=set(cat_ids); qids=[q['id'] for q in catalog['questions']]; qset=set(qids)
    if len(qids)!=len(qset): errors.append('duplicate question id')
    if len(cat_ids)!=len(cats): errors.append('duplicate category id')
    # category.groups sub-headers (app.js render()): every group needs a non-empty title and a
    # unique id, and every question's `group` must resolve to a group its own category declared --
    # a dangling/misspelled q.group silently degrades to "ungrouped" in the UI with no error (the
    # single actual defect a 2026-09-05 critic review found in this feature).
    group_ids_by_cat={}
    for c in catalog['categories']:
        gids=[g['id'] for g in c.get('groups',[])]
        if len(gids)!=len(set(gids)): errors.append(c['id']+': duplicate group id')
        for g in c.get('groups',[]):
            if not g.get('title','').strip(): errors.append(c['id']+': group '+g.get('id','?')+' missing title')
        group_ids_by_cat[c['id']]=set(gids)
    # render() in app.js does one top-to-bottom pass per category (categories in catalog.json
    # array order, questions within a category in catalog.json array order) and initializes
    # answers[q.id]=false only when it FIRST reaches a newly-active question. If an equals:false
    # active_when reference points to a question that renders LATER (later category, or later in
    # the same category), that referenced answer is still undefined on first paint --
    # undefined===false is false, so the referencing question is wrongly inactive until the next
    # click forces a re-render. (equals:true forward refs are unaffected: undefined===true is also
    # false, matching the eventual steady-state False, so there is no first-paint divergence.)
    # NOTE: this does not cover the separate hazard of a *backward* reference to a question that is
    # itself conditionally active and currently answered False -- render() also deletes that
    # question's answers[] entry, so it stays undefined regardless of render order. Not checked here.
    render_index={}; _pos=0
    for c in cat_ids:
        for q in catalog['questions']:
            if q['category']==c: render_index[q['id']]=_pos; _pos+=1
    for q in catalog['questions']:
        if q['category'] not in cats: errors.append(q['id']+': unknown category')
        if q.get('answer_type')!='boolean': errors.append(q['id']+': non-binary answer type')
        if q.get('group') and q['group'] not in group_ids_by_cat.get(q['category'],set()): errors.append(q['id']+': unknown group '+q['group'])
        def refs(c):
            if not c:return []
            if 'question'in c:return [(c['question'],c.get('equals'))]
            return sum((refs(x) for x in c.get('all',[])+c.get('any',[])),[])
        qi=render_index.get(q['id'])
        for r,eq in refs(q.get('active_when')):
            if r not in qset: errors.append(q['id']+': active_when unknown '+r)
            elif eq is False and qi is not None:
                if r==q['id']: errors.append(q['id']+': active_when self-references '+r+' (condition can never be satisfied)')
                elif render_index.get(r,_pos)>=qi: errors.append(q['id']+': active_when forward-references '+r+' (renders later, undefined on first paint)')
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
