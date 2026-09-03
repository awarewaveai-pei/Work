#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
from functools import lru_cache
import json, hashlib, re
ROOT=Path(__file__).resolve().parents[1]
VERSION='1.6.0'

@lru_cache(maxsize=None)
def load(rel):
    return json.loads((ROOT/rel).read_text(encoding='utf-8'))

def canonical(obj): return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def digest(obj): return hashlib.sha256(canonical(obj).encode('utf-8')).hexdigest()
def safe_name(s):
    x=re.sub(r'[^A-Za-z0-9._-]+','-',s.strip()).strip('-')
    if not x or x in {'.','..'}: raise ValueError('invalid project name')
    return x

def eval_condition(cond, answers):
    if not cond: return True
    if 'question' in cond: return answers.get(cond['question']) is cond.get('equals')
    if 'all' in cond: return all(eval_condition(x,answers) for x in cond['all'])
    if 'any' in cond: return any(eval_condition(x,answers) for x in cond['any'])
    raise ValueError('unknown condition')

def active_questions(answers):
    catalog=load('questionnaires/catalog.json')
    return [q for q in catalog['questions'] if eval_condition(q.get('active_when'),answers)]

def validate_answers(answers):
    catalog=load('questionnaires/catalog.json'); qmap={q['id']:q for q in catalog['questions']}; errors=[]
    unknown=set(answers)-set(qmap)
    if unknown: errors.append('unknown question ids: '+','.join(sorted(unknown)))
    for k,v in answers.items():
        if not isinstance(v,bool): errors.append(f'{k}: answer must be boolean')
    for q in catalog['questions']:
        active=eval_condition(q.get('active_when'),answers)
        if active and q.get('required_when_active') and q['id'] not in answers: errors.append(q['id']+': active question unanswered')
        if not active and answers.get(q['id']) is True: errors.append(q['id']+': inactive question cannot be YES')
    for r in load('rules/conflict-rules.json')['rules']:
        if all(eval_condition(c,answers) for c in r['if_all']): errors.append(r['code']+': '+r['message'])
    return errors

def capability_closure(seed):
    catalog={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}; out=set(seed); changed=True
    while changed:
        changed=False
        for cid in list(out):
            if cid not in catalog: raise ValueError('unknown capability '+cid)
            for dep in catalog[cid].get('requires',[]):
                if dep not in out: out.add(dep); changed=True
    return out

def derive_archetypes(caps):
    out=[]
    for cid,arch in [('CAP-WEB','web_application'),('CAP-MOBILE','mobile_application'),('CAP-DESKTOP','desktop_application'),('CAP-PUBLIC-API','api_service'),('CAP-CLI','cli_or_agent'),('CAP-AI','ai_system')]:
        if cid in caps: out.append(arch)
    if not out: out=['service_or_internal_system']
    return sorted(out)

def resolve(project,answers,custom_requirements=None):
    custom_requirements=custom_requirements or []
    errors=validate_answers(answers)
    if errors: raise ValueError('\n'.join(errors))
    baseline=load('baselines/production-baseline.json'); foundation={x['id'] for x in baseline['capabilities']}
    selected=set(); deferred=set(); trace={}
    for rule in load('rules/question-rules.json')['rules']:
        if eval_condition(rule['when'],answers):
            for cid in rule.get('require',[]): selected.add(cid); trace.setdefault(cid,[]).append(rule['id'])
            for cid in rule.get('defer',[]): deferred.add(cid); trace.setdefault(cid,[]).append(rule['id'])
    deferred-=selected
    current=capability_closure(foundation|selected)
    derived=set(); changed=True
    drules=load('rules/derivation-rules.json')['rules']
    while changed:
        changed=False
        allcaps=current|derived
        for r in drules:
            if r['when_capability'] in allcaps:
                for cid in r['derive']:
                    if cid not in allcaps:
                        derived.add(cid); trace.setdefault(cid,[]).append(r['id']); changed=True
        if changed: derived=capability_closure(derived|current)-current
    all_current=capability_closure(current|derived)
    derived |= all_current-foundation-selected
    # A capability cannot be both current and deferred. Current dependency/derivation wins.
    deferred -= all_current
    ccat={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}
    modules={'core'} | {ccat[c]['module'] for c in all_current if ccat[c].get('module')}
    module_reasons={m:sorted(c for c in all_current if ccat[c].get('module')==m) for m in modules}
    module_reasons['core']=sorted(set(module_reasons.get('core',[]))|foundation)
    commercial=answers.get('Q-COM-001',False)
    regulated=any(answers.get(x,False) for x in ['Q-REG-001','Q-REG-002','Q-REG-003','Q-REG-004','Q-REG-005','Q-REG-007','Q-GLO-005'])
    high_impact=any(answers.get(x,False) for x in ['Q-IMP-004','Q-IMP-005','Q-IMP-006'])
    mission=answers.get('Q-IMP-004',False)
    criticality='mission_critical' if mission else ('high' if high_impact else ('medium' if answers.get('Q-IMP-001',False) or answers.get('Q-IMP-003',False) else 'low'))
    profile='enterprise' if regulated or answers.get('Q-ID-005',False) or answers.get('Q-ORG-003',False) else ('commercial' if commercial else 'standard')
    name=safe_name(project['name'])
    custom=[]
    for idx,r in enumerate(custom_requirements,1):
        stmt=str(r.get('statement','')).strip(); cat=str(r.get('category','custom')).strip() or 'custom'
        if len(stmt)<3: raise ValueError('custom requirement statement too short')
        custom.append({'id':f'REQ-CUSTOM-{idx:05d}','category':cat,'statement':stmt,'source':'USER_CUSTOM','mapping_status':'ARCHITECTURE_REVIEW_REQUIRED'})
    if custom:
        modules.add('custom')
        module_reasons['custom']=[r['id'] for r in custom]
    input_obj={'project':{'name':name},'answers':dict(sorted(answers.items())),'custom_requirements':custom}
    plan={
      'schema_version':'1.1.0','compiler_version':VERSION,'input_digest':digest(input_obj),'project':{'name':name},
      'foundation':sorted(foundation),'user_selected':sorted(selected),'derived':sorted(derived),'deferred':sorted(deferred),
      'current_capabilities':sorted(all_current),'custom_requirements':custom,'modules':sorted(modules),
      'module_reasons':module_reasons,'archetypes':derive_archetypes(all_current),'profile':profile,'criticality':criticality,
      'traceability':{k:sorted(v) for k,v in sorted(trace.items())}
    }
    return plan

def questionnaire_digest(): return digest(load('questionnaires/catalog.json'))
