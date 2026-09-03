#!/usr/bin/env python3
from pathlib import Path
import tempfile,sys,json
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import load,resolve,active_questions,eval_condition
from foundry_generate import generate

def complete(over):
    answers={}; qmap={q['id']:q for q in load('questionnaires/catalog.json')['questions']}
    for _ in range(20):
        active={q['id'] for q in active_questions(answers)}
        for k in list(answers):
            if k not in active: answers.pop(k)
        changed=False
        for q in active_questions(answers):
            if q['id'] not in answers: answers[q['id']]=bool(over.get(q['id'],False));changed=True
        for k,v in over.items():
            if k in {q['id'] for q in active_questions(answers)} and answers.get(k)!=v:answers[k]=v;changed=True
        if not changed:return answers
    raise RuntimeError('question activation did not converge')

def main():
    a=complete({'Q-CH-001':True,'Q-ID-001':True,'Q-ORG-001':True,'Q-COM-001':True,'Q-COM-002':True,'Q-PAY-001':True,'Q-NOT-001':True,'Q-AI-007':True})
    p=resolve({'name':'e2e-system'},a,[{'category':'workflow','statement':'結案必須由客戶確認'}])
    needed=['tenant','commercial','payments','notifications','ai','web']
    if not all(x in p['modules'] for x in needed): raise SystemExit('missing expected modules')
    with tempfile.TemporaryDirectory() as td:
        out=generate(p,a,[],td)
        for rel in ['packages/tenant','packages/commercial','packages/payments','packages/ai','apps/web','.foundry/resolution/foundry-plan.json']:
            if not (out/rel).exists(): raise SystemExit('missing generated '+rel)
        if (out/'apps/mobile').exists(): raise SystemExit('unselected mobile module generated')
    print('CONFIGURATOR E2E: PASS');return 0
if __name__=='__main__':raise SystemExit(main())
