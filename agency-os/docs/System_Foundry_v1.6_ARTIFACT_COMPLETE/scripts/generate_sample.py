#!/usr/bin/env python3
"""Regenerate every shipped sample from the current questionnaire (v1.7 V17-5; `make verify` runs it).

Three fixed answer sets: ALL-NO, ALL-YES, and the commerce intake (bootstrap/sample-commerce-intake.json, new active
questions default to NO). The intake fails closed when it names an unknown question or selects one that is not active,
so a renamed or removed question turns verify red until the intake is updated."""
from pathlib import Path
import argparse, os, tempfile
from configurator_engine import ROOT, active_questions, load, resolve
from foundry_generate import generate

def settle(overrides,default):
    answers={}
    for _ in range(50):
        updated={q['id']:overrides.get(q['id'],default) for q in active_questions(answers)}
        if updated==answers: return answers
        answers=updated
    raise ValueError('sample question activation did not converge')

def intake_sample():
    intake=load('bootstrap/sample-commerce-intake.json'); overrides=intake['answers']
    known={q['id'] for q in load('questionnaires/catalog.json')['questions']}
    unknown=sorted(set(overrides)-known)
    if unknown: raise ValueError('sample intake names unknown question IDs (update bootstrap/sample-commerce-intake.json): '+', '.join(unknown))
    answers=settle(overrides,False)
    inactive=sorted(qid for qid,value in overrides.items() if value and not answers.get(qid))
    if inactive: raise ValueError('sample intake selects inactive questions; update the intake explicitly: '+', '.join(inactive))
    return intake['project'],answers,intake.get('custom_requirements',[])

SAMPLES=[
    lambda: ({'name':'sample-all-no'},settle({},False),[]),
    lambda: ({'name':'sample-all-yes'},settle({},True),[]),
    intake_sample,
]

def write_sample(project,answers,custom,out,replace):
    plan=resolve(project,answers,custom); target=out/plan['project']['name']
    if target.exists() and not replace: raise FileExistsError('sample already exists; use --replace: '+str(target))
    with tempfile.TemporaryDirectory(prefix='.sample-',dir=out) as tmp:
        stage=generate(plan,answers,custom,tmp)
        backup=Path(tmp)/'previous-sample'
        if target.exists(): os.replace(target,backup)
        try: os.replace(stage,target)
        except Exception:
            if backup.exists(): os.replace(backup,target)
            raise
    print(f'SAMPLE GENERATION: PASS answers={len(answers)} modules={len(plan["modules"])} path={target}')

def main():
    ap=argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--out',type=Path,default=ROOT/'generated')
    ap.add_argument('--replace',action='store_true',help='Replace existing sample directories, with rollback on failure.')
    args=ap.parse_args()
    out=args.out.resolve(); out.mkdir(parents=True,exist_ok=True)
    for sample in SAMPLES: write_sample(*sample(),out,args.replace)
    return 0

if __name__=='__main__': raise SystemExit(main())
