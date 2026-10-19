#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
VERSION='1.6.0'
REQUIRED=['registries/kernel.yaml','registries/status-codes.yaml','registries/risk-authority.yaml','registries/non-waivable-rules.yaml','runtime/stage-gates.yaml','runtime/orchestration.yaml','runtime/agent-roles.yaml','scripts/validate_semantics.py','scripts/validate_manifest.py','scripts/validate_versions.py','scripts/run_adversarial_contract_tests.py','scripts/test_bootstrap_e2e.py','scripts/foundry_new.py','scripts/schema_runtime.py','scripts/validate_contract_fixtures.py','schemas/evidence-finding.schema.json','schemas/risk-classification.schema.json','schemas/authority-grant.schema.json','schemas/release-evidence.schema.json','schemas/lifecycle-record.schema.json','schemas/exception.schema.json','schemas/human-action-control.schema.json','schemas/database-architecture.schema.json','schemas/security-review.schema.json','schemas/sre-plan.schema.json','schemas/observability-plan.schema.json','schemas/migration-plan.schema.json','schemas/restore-evidence.schema.json','schemas/test-strategy.schema.json','schemas/source-of-truth-map.schema.json','schemas/dependency-map.schema.json','questionnaires/catalog.json','baselines/production-baseline.json','capabilities/catalog.json','rules/question-rules.json','rules/derivation-rules.json','rules/conflict-rules.json','generation/module-manifests.json','generation/module-obligations.json','generation/blueprint-map.json','scripts/validate_artifact_generation.py','scripts/test_selection_matrix.py','scripts/test_configurator_http_e2e.py','scripts/configurator_engine.py','scripts/foundry_generate.py','scripts/report_acceptance_gap.py','generation/card-template.md','scripts/serve_configurator.py','scripts/validate_configurator.py','scripts/test_configurator_e2e.py','schemas/question.schema.json','schemas/answer-snapshot.schema.json','schemas/custom-requirement.schema.json','schemas/capability.schema.json','schemas/foundry-plan.schema.json','schemas/generated-artifact-manifest.schema.json','schemas/generated-module-manifest.schema.json','configurator/index.html','configurator/app.js']
def main():
    e=[]
    for r in REQUIRED:
        if not (ROOT/r).is_file(): e.append('missing required file: '+r)
    for p in sorted((ROOT/'schemas').glob('*.json')):
        try: d=json.loads(p.read_text(encoding='utf-8'))
        except Exception as x: e.append(f'invalid JSON {p.relative_to(ROOT)}: {x}'); continue
        if d.get('$schema')!='https://json-schema.org/draft/2020-12/schema': e.append(f'{p.relative_to(ROOT)}: wrong schema draft')
    if e:
        print('FOUNDRY VALIDATION: FAIL'); [print('- '+x) for x in e]; return 1
    checks=['validate_versions.py','validate_semantics.py','validate_configurator.py','validate_artifact_generation.py']
    for c in checks:
        r=subprocess.run([sys.executable,str(ROOT/'scripts'/c)],cwd=ROOT,capture_output=True,text=True)
        print(r.stdout,end='')
        if r.returncode: return r.returncode
    print('FOUNDRY VALIDATION: PASS')
    print('version=1.6.0-artifact-complete')
    return 0
if __name__=='__main__': sys.exit(main())
