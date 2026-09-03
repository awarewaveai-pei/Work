#!/usr/bin/env python3
from pathlib import Path
import json, sys, re
ROOT=Path(__file__).resolve().parents[1]; VERSION='1.6.0'
def load(p): return json.loads((ROOT/p).read_text(encoding='utf-8'))
def main():
    e=[]; m=load('manifest.json')
    if m.get('version')!=VERSION or m.get('kernel_version')!=VERSION: e.append('manifest version drift')
    versioned=['runtime/stage-gates.yaml','runtime/orchestration.yaml','runtime/agent-roles.yaml','runtime/enforcement.yaml','runtime/execution-state-machine.yaml','recipes/build-universal-system.yaml','registries/status-codes.yaml','registries/risk-authority.yaml','registries/kernel.yaml','registries/non-waivable-rules.yaml','registries/workflow-stages.yaml','policies/tool-boundaries.yaml','policies/release.yaml','policies/ai-execution.yaml','policies/freshness.yaml','bootstrap/SYSTEM_ARCHETYPES.yaml','bootstrap/NEW_SYSTEM_INTAKE.yaml','recipes/build-top-tier-commercial-system.yaml','questionnaires/catalog.json','baselines/production-baseline.json','capabilities/catalog.json','rules/question-rules.json','rules/derivation-rules.json','rules/conflict-rules.json','generation/module-manifests.json','generation/module-obligations.json','generation/blueprint-map.json']
    for rel in versioned:
        if load(rel).get('version')!=VERSION: e.append(rel+' version drift')
    for p in (ROOT/'profiles').glob('*.yaml'):
        if load(str(p.relative_to(ROOT))).get('version')!=VERSION: e.append(str(p.relative_to(ROOT))+' version drift')
    for rel in ['scripts/configurator_engine.py','scripts/regenerate_integrity.py','scripts/validate_semantics.py','scripts/validate_foundry.py','scripts/foundry_new.py']:
        txt=(ROOT/rel).read_text(encoding='utf-8')
        if VERSION not in txt: e.append(rel+' missing current version')
    ps=load('schemas/foundry-plan.schema.json')
    if ps['properties']['compiler_version'].get('const')!=VERSION: e.append('foundry plan compiler version drift')
    if e:
        print('VERSION VALIDATION: FAIL'); [print('- '+x) for x in e]; return 1
    print('VERSION VALIDATION: PASS'); return 0
if __name__=='__main__': sys.exit(main())
