#!/usr/bin/env python3
from pathlib import Path
import sys,tempfile,json,hashlib,random,itertools,re
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import load,resolve,active_questions,eval_condition,EXPECTED_BLUEPRINT_COUNT
from foundry_generate import generate,MODULE_DOCS,blueprint_active

QMAP={q['id']:q for q in load('questionnaires/catalog.json')['questions']}
RULES={r['when']['question']:r for r in load('rules/question-rules.json')['rules']}
CAPS={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}
MODS={m['id']:m for m in load('generation/module-manifests.json')['modules']}
BPMAP=load('generation/blueprint-map.json')['documents']
PLAN_TABLE_ROW=re.compile(r'^\| `(\d\d_[^`]+\.md)` \| (ACTIVE|NOT_APPLICABLE) \|',re.M)
# "<CODE>: " (colon-space suffix, not the bare code) so a code that happens to be a string
# prefix of another code -- or of an unrelated error message that starts with the same letters
# -- can't false-match; today all 5 conflict-rules share one code so this is defence in depth,
# not a fix for an observed collision.
CONFLICT_PREFIXES=tuple(cr['code']+': ' for cr in load('rules/conflict-rules.json')['rules'])

def expected_conflict(e):
    # The ONLY two ValueError sources steps 4/6 are allowed to swallow as "this combination was
    # never supposed to compile": merge()'s own prerequisite-incompatibility guard, and resolve()
    # rejecting a genuine business conflict-rule. Anything else -- unknown question id,
    # non-boolean answer, unanswered/wrongly-answered question, unknown capability, unknown
    # condition shape -- is validate_answers()/capability_closure()/eval_condition() catching an
    # actual harness or resolver bug and must fail the test loudly, not get counted as an
    # expected rejection.
    #
    # resolve() joins ALL validate_answers() errors with '\n' (configurator_engine.py), so a
    # single ValueError can carry several lines at once; checking only the first line is only
    # safe as long as conflict-rule lines always sort last among validate_answers()'s error
    # list, which is true today but is an accident of that function's statement order, not a
    # guarantee this function should depend on -- so every line must independently be either the
    # merge() message or a conflict-rule line.
    lines=str(e).split('\n')
    return all(line=='incompatible prerequisites' or line.startswith(CONFLICT_PREFIXES) for line in lines)

def merge(a,b):
    out=dict(a)
    for k,v in b.items():
        if k in out and out[k] is not v: raise ValueError('incompatible prerequisites')
        out[k]=v
    return out

def satisfy_question(qid,value):
    q=QMAP[qid]
    # To explicitly answer a question, first make the question itself active.
    pre=satisfy(q.get('active_when')) if q.get('active_when') else {}
    return merge(pre,{qid:value})

def satisfy(cond):
    if not cond:return {}
    if 'question' in cond:
        return satisfy_question(cond['question'],cond['equals'])
    if 'all' in cond:
        out={}
        for c in cond['all']: out=merge(out,satisfy(c))
        return out
    if 'any' in cond:
        for c in cond['any']:
            try:return satisfy(c)
            except ValueError:pass
    raise ValueError('cannot satisfy condition')

def complete(over=None,default=False):
    over=dict(over or {}); answers={}
    for _ in range(50):
        active={q['id'] for q in active_questions(answers)}
        for k in list(answers):
            if k not in active: answers.pop(k)
        changed=False
        for q in active_questions(answers):
            if q['id'] not in answers: answers[q['id']]=bool(over.get(q['id'],default));changed=True
        for k,v in over.items():
            if k in {q['id'] for q in active_questions(answers)} and answers.get(k)!=v: answers[k]=v;changed=True
        if not changed:return answers
    raise RuntimeError('activation did not converge')

def answer_for_question(qid):
    over=satisfy(QMAP[qid].get('active_when')); over[qid]=True
    return complete(over,False)

def expected_modules(plan):
    out={'core'}|{CAPS[c]['module'] for c in plan['current_capabilities'] if CAPS[c].get('module')}
    if plan['custom_requirements']: out.add('custom')
    return out

def assert_plan_invariants(plan):
    if set(plan['modules'])!=expected_modules(plan): raise AssertionError('module set is not exact capability projection')
    if set(plan['foundation']) & set(plan['user_selected']): raise AssertionError('foundation/user overlap')
    if set(plan['deferred']) & set(plan['current_capabilities']): raise AssertionError('deferred capability leaked into current closure')
    for mid in plan['modules']:
        if mid not in MODS: raise AssertionError('unknown module '+mid)

def verify_artifact_manifest(out):
    m=json.loads((out/'.foundry/resolution/artifact-manifest.json').read_text())
    if m['file_count']!=len(m['files']): raise AssertionError('artifact manifest count mismatch')
    for rec in m['files']:
        p=out/rec['path']
        if not p.is_file(): raise AssertionError('manifest missing '+rec['path'])
        h=hashlib.sha256(p.read_bytes()).hexdigest()
        if h!=rec['sha256']: raise AssertionError('artifact hash mismatch '+rec['path'])

def verify_generated(out,plan):
    selected=set(plan['modules'])
    for mid in selected:
        for role in MODULE_DOCS+['MODULE_MANIFEST.json']:
            if not (out/'docs/modules'/mid/role).is_file(): raise AssertionError(f'{mid} missing {role}')
        for rel in MODS[mid]['paths']:
            if not (out/rel/'README.md').is_file(): raise AssertionError(f'{mid} path not materialized: {rel}')
    for mid,m in MODS.items():
        if mid not in selected:
            if (out/'docs/modules'/mid).exists(): raise AssertionError('unselected module docs leaked '+mid)
            for rel in m['paths']:
                if (out/rel).exists(): raise AssertionError('unselected module path leaked '+mid+':'+rel)
    if (out/'docs/blueprint').exists(): raise AssertionError('docs/blueprint must not be generated')
    plan_text=(out/'PLAN.md').read_text(encoding='utf-8')
    rows={m.group(1):m.group(2) for m in PLAN_TABLE_ROW.finditer(plan_text)}
    if len(rows)!=EXPECTED_BLUEPRINT_COUNT: raise AssertionError(f'PLAN.md rows {len(rows)} != {EXPECTED_BLUEPRINT_COUNT}')
    for rec in BPMAP:
        expected='ACTIVE' if blueprint_active(rec['when'],plan) else 'NOT_APPLICABLE'
        if rows.get(rec['file'])!=expected: raise AssertionError('blueprint applicability mismatch '+rec['file'])
    verify_artifact_manifest(out)

def main():
    # 1) all NO
    a0=complete({},False); p0=resolve({'name':'all-no'},a0,[]); assert_plan_invariants(p0)
    if p0['modules']!=['core']: raise AssertionError('all-NO must generate core only')
    # 2) all YES for every active question
    ay=complete({},True); py=resolve({'name':'all-yes'},ay,[]); assert_plan_invariants(py)
    if len(py['current_capabilities'])!=len(CAPS): raise AssertionError(f'all-YES capability coverage {len(py["current_capabilities"])}/{len(CAPS)}')
    standard_mods=set(MODS)-{'custom'}
    if set(py['modules'])!=standard_mods: raise AssertionError(f'all-YES standard module coverage {len(py["modules"])}/{len(standard_mods)}')
    if not all(blueprint_active(x['when'],py) for x in BPMAP): raise AssertionError('all-YES must activate all blueprint documents')
    # 3) every question individually reaches its declared YES rule effect (including deferred rules)
    for qid in sorted(QMAP):
        aq=answer_for_question(qid); pq=resolve({'name':'single-'+qid.lower()},aq,[]); assert_plan_invariants(pq); r=RULES[qid]
        for cid in r.get('require',[]):
            if cid not in pq['current_capabilities']: raise AssertionError(f'{qid} did not activate {cid}')
        for cid in r.get('defer',[]):
            if cid not in pq['deferred'] and cid not in pq['current_capabilities']: raise AssertionError(f'{qid} did not defer/preserve {cid}')
    # 3.5) expected_conflict() discriminator itself, tested directly. In this catalog every one
    # of the pairwise rejections below happens to be a merge()-prerequisite conflict and none of
    # them (nor any of the 1000 random configs) happen to trip a conflict-rule -- so without this
    # direct check, the CONFLICT_PREFIXES branch has zero real coverage and a mutation there
    # (e.g. a typo in the colon-space suffix) would pass silently forever.
    real_conflict=load('rules/conflict-rules.json')['rules'][0]
    if not expected_conflict(ValueError('incompatible prerequisites')): raise AssertionError('expected_conflict must accept merge() prerequisite conflicts')
    if not expected_conflict(ValueError(real_conflict['code']+': '+real_conflict['message'])): raise AssertionError('expected_conflict must accept a real conflict-rule code')
    if expected_conflict(ValueError('Q-X: active question unanswered')): raise AssertionError('expected_conflict must reject an unrelated ValueError')
    if expected_conflict(ValueError(real_conflict['code'])): raise AssertionError('expected_conflict must reject a bare code with no colon-space (not a real resolve() message shape)')
    # 3.6) Q-IMP-007/008 individually must each raise criticality to at least 'medium' (the
    # 'load_pressure' clause in configurator_engine.py resolve()). The single-question loop above
    # (step 3) only asserts require/defer capability activation, never criticality, and neither
    # golden fixture exercises this clause in isolation (all-no has both False; all-yes has both
    # True but Q-IMP-004 already forces 'mission_critical' there regardless of load_pressure) --
    # a 2026-09-05 critic review found this was the one behavior this diff changed with zero
    # regression coverage anywhere in the suite.
    for qid in ['Q-IMP-007','Q-IMP-008']:
        p=resolve({'name':'crit-'+qid.lower()},answer_for_question(qid),[])
        if p['criticality']!='medium': raise AssertionError(f'{qid} alone must yield criticality=medium, got {p["criticality"]}')
    # 4) exhaustive pairwise question interactions where prerequisites are compatible
    pairs=0; rejected=0
    ids=sorted(QMAP)
    for i,q1 in enumerate(ids):
        pre1=satisfy(QMAP[q1].get('active_when'))
        for q2 in ids[i+1:]:
            try: ov=merge(pre1,satisfy(QMAP[q2].get('active_when'))); ov[q1]=True; ov[q2]=True; a=complete(ov,False); p=resolve({'name':'pair'},a,[]); assert_plan_invariants(p); pairs+=1
            except (ValueError,AssertionError) as e:
                if isinstance(e,AssertionError): raise
                if not expected_conflict(e): raise AssertionError(f'{q1}+{q2}: unexpected ValueError (not a known conflict): {e}') from e
                rejected+=1
    # 5) every explicit conflict rule must fail closed
    for cr in load('rules/conflict-rules.json')['rules']:
        raw={c['question']:c['equals'] for c in cr['if_all']}
        try:
            resolve({'name':'conflict'},raw,[])
        except ValueError as e:
            if cr['code'] not in str(e): raise AssertionError('wrong conflict code for '+cr['id']+': '+str(e))
        else:
            raise AssertionError('conflict did not fail closed: '+cr['id'])
    # golden selection fixtures lock intended current coverage. criticality/profile were added to
    # this comparison after a 2026-09-05 critic review found both fixtures already store the field
    # (all_no.json:27, all_yes.json:239) but nothing compared it -- a future edit to the
    # criticality/profile ternaries in configurator_engine.py's resolve() would silently rewrite
    # every generated project's risk posture with this whole suite still green.
    for fixture,ans,plan in [('all_no.json',a0,p0),('all_yes.json',ay,py)]:
        g=json.loads((ROOT/'tests/fixtures/selection'/fixture).read_text())
        if (g['current_capabilities']!=plan['current_capabilities'] or g['modules']!=plan['modules'] or g['active_answer_count']!=len(ans)
            or g['criticality']!=plan['criticality'] or g['profile']!=plan['profile']):
            raise AssertionError('golden selection drift: '+fixture)

    # 6) deterministic randomized mixed configurations
    rng=random.Random(1600)
    for n in range(1000):
        a={}
        for _ in range(30):
            for q in active_questions(a):
                if q['id'] not in a: a[q['id']]=bool(rng.getrandbits(1))
            active={q['id'] for q in active_questions(a)}
            a={k:v for k,v in a.items() if k in active}
        try:
            p=resolve({'name':f'random-{n}'},a,[]); assert_plan_invariants(p)
            if p!=resolve({'name':f'random-{n}'},dict(reversed(list(a.items()))),[]): raise AssertionError('non-deterministic plan')
        except ValueError as e:
            # only explicit conflict rules may reject random combinations
            if not expected_conflict(e): raise AssertionError(f'random-{n}: unexpected ValueError (not a known conflict): {e}') from e
    # 7) generate all-NO and all-YES and prove exact materialization/no leakage
    with tempfile.TemporaryDirectory() as td:
        out0=generate(p0,a0,[],td); verify_generated(out0,p0)
        outy=generate(py,ay,[],td); verify_generated(outy,py)
        cov=json.loads((outy/'.foundry/verification/generation-coverage.json').read_text())
        if cov['modules_selected']!=len(set(MODS)-{'custom'}) or cov['blueprints_active']!=EXPECTED_BLUEPRINT_COUNT: raise AssertionError('all-YES coverage report incomplete')
    # 8) one representative generation per module (except core already covered)
    reps={}
    for qid in ids:
        p=resolve({'name':'rep'},answer_for_question(qid),[])
        for mid in p['modules']:
            reps.setdefault(mid,qid)
    # custom is intentionally reachable only from +新增其他需求, not a YES/NO question.
    if 'custom' not in reps:
        ac=complete({},False); pc=resolve({'name':'custom-rep'},ac,[{'category':'custom','statement':'特殊產業需求需要架構評估'}])
        if 'custom' not in pc['modules']: raise AssertionError('custom requirement did not activate custom extension module')
        reps['custom']='__CUSTOM__'
    missing=set(MODS)-set(reps)
    if missing: raise AssertionError('modules unreachable: '+','.join(sorted(missing)))
    with tempfile.TemporaryDirectory() as td:
        for mid,qid in sorted(reps.items()):
            if qid=='__CUSTOM__':
                a=complete({},False); custom=[{'category':'custom','statement':'特殊產業需求需要架構評估'}]; p=resolve({'name':'m-'+mid},a,custom); out=generate(p,a,custom,td)
            else:
                a=answer_for_question(qid); p=resolve({'name':'m-'+mid},a,[]); out=generate(p,a,[],td)
            verify_generated(out,p)
    print(f'SELECTION MATRIX: PASS questions={len(QMAP)} single={len(QMAP)} pairwise_valid={pairs} pairwise_rejected={rejected} random=1000 modules={len(MODS)} blueprints={len(BPMAP)} all_yes_caps={len(py["current_capabilities"])}')
    return 0
if __name__=='__main__': raise SystemExit(main())
