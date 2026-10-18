#!/usr/bin/env python3
from pathlib import Path
import argparse, os, tempfile
from configurator_engine import ROOT, active_questions, load, resolve
from foundry_generate import generate

def main():
    ap=argparse.ArgumentParser(description='Regenerate the shipped sample from its selected answers; new questions default to NO.')
    ap.add_argument('--out',type=Path,default=ROOT/'generated')
    ap.add_argument('--replace',action='store_true',help='Replace only the generated sample directory, with rollback on failure.')
    args=ap.parse_args()
    intake=load('bootstrap/sample-commerce-intake.json'); overrides=intake['answers']; answers={}
    known={q['id'] for q in load('questionnaires/catalog.json')['questions']}
    if set(overrides)-known: raise ValueError('sample contains unknown question IDs')
    for _ in range(50):
        updated={q['id']:overrides.get(q['id'],False) for q in active_questions(answers)}
        if updated==answers: break
        answers=updated
    else: raise ValueError('sample question activation did not converge')
    if any(value and not answers.get(qid) for qid,value in overrides.items()):
        raise ValueError('sample has an inactive selected answer; update the intake explicitly')
    plan=resolve(intake['project'],answers,intake.get('custom_requirements',[]))
    out=args.out.resolve(); target=out/plan['project']['name']
    if target.exists() and not args.replace: raise FileExistsError('sample already exists; use --replace: '+str(target))
    out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.sample-',dir=out) as tmp:
        stage=generate(plan,answers,intake.get('custom_requirements',[]),tmp)
        backup=Path(tmp)/'previous-sample'
        if target.exists(): os.replace(target,backup)
        try: os.replace(stage,target)
        except Exception:
            if backup.exists(): os.replace(backup,target)
            raise
    print(f'SAMPLE GENERATION: PASS answers={len(answers)} modules={len(plan["modules"])} path={target}')
    return 0

if __name__=='__main__': raise SystemExit(main())
