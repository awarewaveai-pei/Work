#!/usr/bin/env python3
from pathlib import Path
import json,re,sys,hashlib
ROOT=Path(__file__).resolve().parents[1]; errors=[]
def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def need(rel):
 p=ROOT/rel
 if not p.exists(): errors.append('missing: '+rel)
 return p
required=[
 'sources/OWNER_DECISIONS_2026-09-03.md','project-instance/intake/OWNER_DECISIONS_LOCKED.md',
 'project-instance/intake/prefilled-industry-questionnaire.json','project-instance/evidence/requirement-evidence-register.json',
 'project-instance/resolution/core-foundry-plan.phase1.json','project-instance/resolution/core-foundry-plan.full-target.json','project-instance/resolution/industry-foundry-plan.json',
 'project-instance/phase1-blueprint/08_RWD_UX.md','project-instance/phase1-blueprint/16_LOCKED_OWNER_DECISIONS.md',
 'project-instance/phase1-repo/water-electrical-ops/apps/web/OFFLINE_WEB_CONTRACT.md','project-instance/phase1-repo/water-electrical-ops/packages/offline-sync/OFFLINE_SCOPE.json']
for r in required: need(r)
for p in ROOT.rglob('*.json'):
 try: json.loads(p.read_text(encoding='utf-8'))
 except Exception as e: errors.append(f'invalid json {p.relative_to(ROOT)}: {e}')
packroot=ROOT/'foundry-overlay/industry-packs/construction-mep-contractor'; pack=load('foundry-overlay/industry-packs/construction-mep-contractor/INDUSTRY_MANIFEST.json')
if pack.get('version')!='1.1.0': errors.append('industry pack version is not 1.1.0')
qs=load('foundry-overlay/industry-packs/construction-mep-contractor/questions.json')['questions']; caps=load('foundry-overlay/industry-packs/construction-mep-contractor/capabilities.json')['capabilities']; qmap={q['id']:q for q in qs}; cmap={c['id']:c for c in caps}
if len(qmap)!=len(qs): errors.append('duplicate question id')
if len(cmap)!=len(caps): errors.append('duplicate capability id')
for q in qs:
 if q.get('answer_type')!='YES_NO': errors.append(q['id']+': not YES_NO')
 for c in q['require_capabilities']:
  if c not in cmap: errors.append(q['id']+': unknown capability '+c)
for c in caps:
 for dep in c.get('requires',[]):
  if dep not in cmap: errors.append(c['id']+': unknown dependency '+dep)
# cycle
vis=set(); done=set()
def dfs(x):
 if x in vis: errors.append('capability cycle '+x); return
 if x in done: return
 vis.add(x)
 for y in cmap[x].get('requires',[]): dfs(y)
 vis.remove(x); done.add(x)
for x in cmap: dfs(x)
pref=load('project-instance/intake/prefilled-industry-questionnaire.json')['answers']
if set(pref)!=set(qmap): errors.append('prefill/question catalog mismatch')
for qid,a in pref.items():
 if not isinstance(a.get('value'),bool): errors.append(qid+': latest package must resolve YES/NO')
expected={'MEP-Q-UX-001':True,'MEP-Q-UX-002':False,'MEP-Q-UX-003':False,'MEP-Q-UX-004':True,'MEP-Q-FUT-001':False,'MEP-Q-FUT-002':True,'MEP-Q-FUT-003':True,'MEP-Q-FUT-004':False}
for k,v in expected.items():
 if pref[k]['value'] is not v: errors.append(k+': locked decision mismatch')
ip=load('project-instance/resolution/industry-foundry-plan.json'); p1=set(ip['phase1_current_capabilities']); full=set(ip['full_target_capabilities'])
for x in ['MEP-CAP-OFFLINE','MEP-CAP-OFFLINE-READ-CACHE','MEP-CAP-OFFLINE-ACTION-QUEUE','MEP-CAP-OFFLINE-SYNC','MEP-CAP-OFFLINE-CONFLICT']:
 if x not in p1: errors.append('phase1 missing offline capability '+x)
for x in ['MEP-CAP-ACCOUNTING-INTEGRATION','MEP-CAP-ACCOUNTING-RECONCILIATION','MEP-CAP-ATTENDANCE','MEP-CAP-APPROVED-LABOR-TIME']:
 if x not in full: errors.append('full target missing '+x)
for x in ['MEP-CAP-MULTI-TENANT','MEP-CAP-ONLINE-PAYMENT']:
 if x in full: errors.append('explicit exclusion leaked into full target '+x)
# Core plan: offline current P1; no mobile; accounting full only
p1core=load('project-instance/resolution/core-foundry-plan.phase1.json'); fullcore=load('project-instance/resolution/core-foundry-plan.full-target.json')
if 'offline' not in p1core['modules']: errors.append('core phase1 missing offline module')
if 'mobile' in p1core['modules']: errors.append('core phase1 unexpectedly selected mobile module')
if 'integrations' not in fullcore['modules']: errors.append('full target missing integrations module')
# repo boundaries
repo=ROOT/'project-instance/phase1-repo/water-electrical-ops'
for rel in ['packages/offline-sync','tests/contract/offline','apps/web/OFFLINE_WEB_CONTRACT.md','docs/LABOR_TIME_BOUNDARY.md','docs/ACCOUNTING_INTEGRATION_BOUNDARY.md']:
 if not (repo/rel).exists(): errors.append('repo missing '+rel)
for rel in ['apps/mobile','modules/procurement','modules/cost','modules/ai']:
 if (repo/rel).exists(): errors.append('deferred/forbidden P1 artifact '+rel)
for p in repo.rglob('*.webmanifest'): errors.append('installable PWA manifest forbidden '+str(p.relative_to(repo)))
# evidence line ranges in all referenced source docs
source_lines={
 'sources/water_electrical_project_management_spec.md':len((ROOT/'sources/water_electrical_project_management_spec.md').read_text(encoding='utf-8').splitlines()),
 'sources/USER_OVERRIDE_RWD.md':len((ROOT/'sources/USER_OVERRIDE_RWD.md').read_text(encoding='utf-8').splitlines()),
 'sources/OWNER_DECISIONS_2026-09-03.md':len((ROOT/'sources/OWNER_DECISIONS_2026-09-03.md').read_text(encoding='utf-8').splitlines())}
def walk(o,where):
 if isinstance(o,dict):
  if o.get('path') in source_lines and 'lines' in o:
   m=re.fullmatch(r'(\d+)(?:-(\d+))?',str(o['lines']))
   if not m: errors.append(where+': bad line range')
   else:
    a=int(m.group(1)); b=int(m.group(2) or a); mx=source_lines[o['path']]
    if a<1 or b<a or b>mx: errors.append(f'{where}: line range {a}-{b} exceeds {o["path"]} ({mx})')
  for k,v in o.items(): walk(v,where+'/'+str(k))
 elif isinstance(o,list):
  for i,v in enumerate(o): walk(v,where+f'[{i}]')
for rel in ['foundry-overlay/industry-packs/construction-mep-contractor/invariants.json','foundry-overlay/industry-packs/construction-mep-contractor/state-machines.json','foundry-overlay/industry-packs/construction-mep-contractor/acceptance-patterns.json','project-instance/intake/prefilled-industry-questionnaire.json','project-instance/evidence/requirement-evidence-register.json']:
 walk(load(rel),rel)
if errors:
 print('DELIVERY VALIDATION: FAIL')
 for e in errors: print('-',e)
 sys.exit(1)
print('DELIVERY VALIDATION: PASS')
print('industry_questions=',len(qs)); print('industry_capabilities=',len(caps)); print('owner_decisions_required=0'); print('phase1_industry_capabilities=',len(p1)); print('full_target_industry_capabilities=',len(full)); print('phase1_core_modules=',','.join(p1core['modules']))
