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
    # Used by the active_when forward-reference check below, which allows full {all:[...]}/
    # {any:[...]} nesting (matching eval_condition()'s general condition shape). The separate
    # conflict-rules.json check further down does NOT call this -- it restricts if_all entries to
    # flat {question,equals} instead (see that check's comment for why). Returns [] for an
    # unrecognized shape (wrong key name, empty dict, non-dict, ...) so callers can treat "no refs
    # found" as its own error rather than silently accepting a condition that eval_condition()
    # would later raise on at runtime.
    def refs(c):
        if not c or not isinstance(c,dict):return []
        if 'question'in c:return [(c['question'],c.get('equals'))]
        return sum((refs(x) for x in c.get('all',[])+c.get('any',[])),[])
    def branch_keys(c):
        return [k for k in ('question','all','any') if isinstance(c,dict) and k in c]
    # eval_condition() (configurator_engine.py) checks 'question'/'all'/'any' as separate `if`
    # statements, each returning immediately -- so a condition dict carrying more than one of
    # those keys silently evaluates only the first and drops the rest (a 2026-09-05 critic review
    # measured this directly: {"all":[...true...],"any":[...references an unknown question...]}
    # evaluates fine and the unknown question is never touched). refs() above walks 'all' AND
    # 'any' together, so it would report the unknown question as a real error on a condition
    # eval_condition never actually looks at -- flagging the ambiguous shape itself, wherever it
    # appears in the tree, is more useful than either silently trusting or silently distrusting it.
    def shape_errors(c):
        if not c or not isinstance(c,dict):return []
        bk=branch_keys(c); out=[]
        if len(bk)>1: out.append('condition has multiple branch keys '+str(bk)+'; eval_condition only evaluates the first')
        if 'question' not in c:
            for x in c.get('all',[])+c.get('any',[]): out+=shape_errors(x)
        return out
    render_index={}; _pos=0
    for c in cat_ids:
        for q in catalog['questions']:
            if q['category']==c: render_index[q['id']]=_pos; _pos+=1
    for q in catalog['questions']:
        if q['category'] not in cats: errors.append(q['id']+': unknown category')
        if q.get('answer_type')!='boolean': errors.append(q['id']+': non-binary answer type')
        if q.get('group') and q['group'] not in group_ids_by_cat.get(q['category'],set()): errors.append(q['id']+': unknown group '+q['group'])
        qi=render_index.get(q['id'])
        for se in shape_errors(q.get('active_when')): errors.append(q['id']+': active_when '+se)
        for qref,eq in refs(q.get('active_when')):
            if qref not in qset: errors.append(q['id']+': active_when unknown '+qref)
            elif eq is False and qi is not None:
                if qref==q['id']: errors.append(q['id']+': active_when self-references '+qref+' (condition can never be satisfied)')
                elif render_index.get(qref,_pos)>=qi: errors.append(q['id']+': active_when forward-references '+qref+' (renders later, undefined on first paint)')
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
    # conflict-rules.json was never included in the loop above (different shape: if_all/code/message,
    # no when/when_capability/require/defer/derive keys) so a typo'd question id inside a conflict
    # rule's if_all has been silently unchecked since the file was introduced -- eval_condition()
    # would just read answers.get(typo'd_id) as always-None/False, so the rule can never fire and the
    # contradiction it exists to catch goes undetected with zero error anywhere. First version of
    # this check only looked at the top-level `if_all[].question` key, which a 2026-09-05 critic
    # review caught missing several other ways the same silent-dead-rule failure reaches production:
    # a typo'd/unknown question nested inside an `{"all":[...]}"` or `{"any":[...]}"` entry, `"equals"`
    # given as a non-boolean (e.g. the string "true" -- eval_condition() compares with `is`, so
    # `answers[q] is "true"` is always False no matter the real boolean answer, same dead-rule
    # outcome), a rule missing `id`/`code`/`message` (validate_answers() in configurator_engine.py
    # unconditionally dereferences `r['code']`/`r['message']` -- a missing key there is a raw
    # unhandled KeyError for every operator who trips the intended contradiction, not a validation
    # message), and an empty/missing `if_all` (Python's `all([])` is vacuously True, so
    # configurator_engine.py's `all(eval_condition(c,answers) for c in r['if_all'])` would reject
    # every single configuration). Conflict `if_all` entries are intentionally restricted to flat
    # `{question,equals}` here (unlike active_when, which allows full `all`/`any` nesting via the
    # same refs() walker above) because test_selection_matrix.py:163's fail-closed check
    # (`raw={c['question']:c['equals'] for c in cr['if_all']}`) assumes exactly that flat shape --
    # a genuinely nested conflict condition would pass this validator yet crash that test with a
    # confusing KeyError, so the smaller-blast-radius fix is to not allow the shape that test can't
    # handle rather than teach the test to handle a shape conflict-rules.json has never used.
    for r in load('rules/conflict-rules.json')['rules']:
        rid=r.get('id','?')
        for key in ('id','code','message'):
            if not r.get(key): errors.append(rid+': conflict rule missing '+key)
        if not r.get('if_all'): errors.append(rid+': empty if_all matches every configuration')
        for cond in r.get('if_all',[]):
            if not isinstance(cond,dict) or 'question' not in cond:
                errors.append(rid+': conflict if_all entries must be flat {question,equals}'); continue
            qid=cond['question']; eq=cond.get('equals')
            if qid not in qset: errors.append(rid+': unknown question '+qid)
            if not isinstance(eq,bool): errors.append(rid+': non-boolean equals for '+qid)
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
