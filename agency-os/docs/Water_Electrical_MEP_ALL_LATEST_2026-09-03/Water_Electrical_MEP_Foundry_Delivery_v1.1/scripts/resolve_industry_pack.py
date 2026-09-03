#!/usr/bin/env python3
from pathlib import Path
import argparse,json,sys
ROOT=Path(__file__).resolve().parents[1]
PACK=ROOT/'foundry-overlay/industry-packs/construction-mep-contractor'

def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))

def closure(seed,caps):
 out=set(seed); changed=True
 while changed:
  changed=False
  for cid in list(out):
   if cid not in caps: raise ValueError('unknown capability '+cid)
   for dep in caps[cid].get('requires',[]):
    if dep not in out: out.add(dep); changed=True
 return sorted(out)

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--questionnaire',required=True); ap.add_argument('--through-phase',default='P1',choices=['P1','P2','P3','P4','P5']); ap.add_argument('--out',required=True); ap.add_argument('--allow-unresolved',action='store_true'); a=ap.parse_args()
 qcat={q['id']:q for q in load(PACK/'questions.json')['questions']}; caps={c['id']:c for c in load(PACK/'capabilities.json')['capabilities']}; data=load(a.questionnaire); answers=data['answers']
 if set(answers)!=set(qcat): raise SystemExit('questionnaire catalog mismatch')
 unresolved=[qid for qid,x in answers.items() if x.get('value') is None]
 if unresolved and not a.allow_unresolved:
  print('OWNER_DECISION_REQUIRED'); [print('-',x) for x in unresolved]; raise SystemExit(2)
 phase_order=['P1','P2','P3','P4','P5']; allowed=set(phase_order[:phase_order.index(a.through_phase)+1]); seed=[]; selected_questions=[]
 for qid,q in qcat.items():
  val=answers[qid].get('value')
  if val is True and q['phase'] in allowed:
   seed.extend(q['require_capabilities']); selected_questions.append(qid)
 current=closure(seed,caps)
 plan={'schema_version':'1.0.0','pack_id':'construction-mep-contractor','through_phase':a.through_phase,'selected_questions':sorted(selected_questions),'capabilities':current,'unresolved':unresolved}
 Path(a.out).write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('INDUSTRY RESOLUTION: PASS'); print('capabilities=',len(current)); print('unresolved=',len(unresolved))
if __name__=='__main__': main()
