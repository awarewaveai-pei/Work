#!/usr/bin/env python3
"""Deterministic, mechanical adaptation of the Water/Electrical/MEP industry pack
(agency-os/docs/Water_Electrical_MEP_ALL_LATEST_2026-09-03/Water_Electrical_MEP_Foundry_Delivery_v1.1)
into System Foundry's own runtime schema (capabilities/catalog.json, questionnaires/catalog.json,
rules/*.json, baselines/production-baseline.json, generation/*.json shapes), written under
industries/construction-mep/. Source files are read-only; nothing under Water_Electrical_MEP_* is
ever modified. Re-run this script (no args) after any source-pack change; do not hand-edit outputs.

Schema reconciliation decisions (see CHANGELOG_v1.6.md's "industry-pack selection layer" entry):
- MEP capability's own `module` field is kept verbatim as a System-Foundry generation-module id.
  MEP's separate module-rules.json (when_capability -> require_modules) is preserved unchanged and
  consumed by a new optional resolve()-time extension (configurator_engine.py) that adds extra
  modules beyond a capability's own tag -- so no capability.module remapping/guessing was needed.
- `phase` (P1..P5/FUTURE) is kept as an additional field on each adapted capability (not dropped,
  not read by any System Foundry code path -- purely preserved for traceability).
- derivation-rules.json / conflict-rules.json are genuinely empty for this pack: MEP's source has
  no DER-* capability-derivation concept and no cross-question conflict rules (OFFLINE's dependency
  on RWD-WEB is already expressed as a `requires` edge, which capability_closure() already enforces).
- baseline/production-baseline.json has an empty `capabilities` list: the MEP source defines no
  foundation/baseline layer of its own (that concept doesn't exist in resolve_industry_pack.py).
"""
from __future__ import annotations
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'industries/construction-mep'
SRC = ROOT.parent / 'Water_Electrical_MEP_ALL_LATEST_2026-09-03' / 'Water_Electrical_MEP_Foundry_Delivery_v1.1'
PACK = SRC / 'foundry-overlay/industry-packs/construction-mep-contractor'
REPO = SRC / 'project-instance/phase1-repo/water-electrical-ops'
BLUEPRINT = SRC / 'project-instance/phase1-blueprint'


def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def dump(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


GENERIC_RULE_TEXT = ("This module owns its domain semantics and communicates through explicit "
                      "contracts. Provider/framework details must not become domain fields unless "
                      "they are genuine business semantics.")

# module id (System Foundry generation-module id) -> real README first-paragraph text, mechanically
# copied verbatim from the source pack's own module READMEs (not summarized/invented).
README_MODULES = {
    'dispatch': REPO / 'modules/dispatch/README.md',
    'project': REPO / 'modules/project/README.md',
    'workforce': REPO / 'modules/workforce/README.md',
}
# these two source dirs both feed the single 'identity_authorization' generation module
IDENTITY_README = REPO / 'modules/identity/README.md'
AUTHZ_README = REPO / 'modules/authorization/README.md'
NOTIFICATION_README = REPO / 'modules/notification/README.md'
AUDIT_README = REPO / 'modules/audit/README.md'


def readme_lead(path):
    lines = [l for l in Path(path).read_text(encoding='utf-8').splitlines() if l.strip()]
    # line0 = '# Title', line1 = lead sentence
    return lines[1].strip()


def build_capabilities():
    src = load(PACK / 'capabilities.json')
    caps = []
    for c in src['capabilities']:
        caps.append({
            'id': c['id'], 'name': c['name'], 'module': c['module'], 'requires': c['requires'],
            'description': f"{c['name']} ({c['module']} module).",
            'phase': c['phase'],
        })
    dump(OUT / 'capabilities/catalog.json', {'version': '1.1.0', 'capabilities': caps})
    return {c['id']: c for c in caps}


def build_questionnaire():
    src = load(PACK / 'questions.json')
    manifest = load(PACK / 'INDUSTRY_MANIFEST.json')
    categories = [{'id': c['id'], 'order': i + 1, 'title': c['name'], 'description': ''}
                  for i, c in enumerate(src['categories'])]
    questions = []
    for q in src['questions']:
        questions.append({
            'id': q['id'], 'category': q['category'], 'label': q['label'],
            'description': q.get('description', ''), 'answer_type': 'boolean',
            'required_when_active': True,
        })
    catalog = {
        'version': '1.6.0', 'questionnaire_version': manifest['version'],
        'answer_contract': 'YES_NO_ONLY', 'principles': manifest['principles'],
        'categories': categories, 'questions': questions,
    }
    dump(OUT / 'questionnaires/catalog.json', catalog)
    return questions, src['questions']


def build_question_rules(mep_questions):
    rules = [{'id': 'RULE-' + q['id'], 'when': {'question': q['id'], 'equals': True},
              'require': q['require_capabilities']} for q in mep_questions]
    dump(OUT / 'rules/question-rules.json', {'version': '1.0.0', 'rules': rules})


def build_empty_rules():
    dump(OUT / 'rules/derivation-rules.json', {'version': '1.0.0', 'rules': []})
    dump(OUT / 'rules/conflict-rules.json', {'version': '1.0.0', 'rules': []})


def build_module_rules():
    src = load(PACK / 'module-rules.json')
    dump(OUT / 'rules/module-rules.json', src)
    return src


def build_baseline():
    dump(OUT / 'baselines/production-baseline.json',
         {'version': '1.0.0', 'baseline_id': 'construction-mep-contractor-empty-foundation',
          'locked': True, 'capabilities': []})


def build_generation(caps_by_id, module_rules):
    cap_module_ids = sorted({c['module'] for c in caps_by_id.values() if c.get('module')})
    rule_module_ids = sorted({m for r in module_rules['rules'] for m in r['require_modules']})
    all_module_ids = sorted(set(cap_module_ids) | set(rule_module_ids) | {'core'})

    caps_by_module = {}
    for c in caps_by_id.values():
        caps_by_module.setdefault(c['module'], []).append(c)

    invariants = load(PACK / 'invariants.json')['invariants']
    inv_by_cap = {i['applies_when_capability']: i['statement'] for i in invariants if i.get('applies_when_capability')}
    global_invariants = [i['statement'] for i in invariants if not i.get('applies_when_capability')]
    # Global (unconditional) invariants keyword-routed to their most relevant generation module;
    # anything not routed stays only under 'core' (always-present, so never lost).
    routing = {
        'MEP-INV-MULTI-DISPATCH': 'dispatch', 'MEP-INV-REACK': 'dispatch',
        'MEP-INV-GCAL-IDEMPOTENT': 'calendar_integration', 'MEP-INV-AUDIT': 'audit_observability',
        'MEP-INV-EMPLOYEE-HISTORY': 'workforce', 'MEP-INV-AI-AUTH': 'ai',
        'MEP-INV-RWD': 'rwd_web', 'MEP-INV-AUTH': 'identity_authorization',
    }
    inv_id_by_stmt = {i['statement']: i['id'] for i in invariants}
    module_extra_invariants = {'core': []}
    for stmt in global_invariants:
        iid = inv_id_by_stmt[stmt]
        target = routing.get(iid)
        if target:
            module_extra_invariants.setdefault(target, []).append(stmt)
        else:
            module_extra_invariants['core'].append(stmt)

    security_baseline = ['Deny by default at trust boundaries.', 'Secrets never enter source control or logs.',
                          'Dependency and supply-chain checks are mandatory.']
    tests_baseline = ['Unit tests for domain invariants.', 'Integration tests for infrastructure adapters.',
                       'Contract tests for public/internal boundaries.', 'E2E tests for critical journeys.',
                       'Backup/restore and rollback verification.']
    ops_baseline = ['SLIs/SLOs appropriate to criticality.', 'Structured logging, metrics, tracing where useful.',
                     'Runbooks for failure, rollback, restore, and incident response.']
    recovery_baseline = ['Authoritative data is backed up and restore-tested.',
                          'Changes define rollback or forward-recovery before release.',
                          'Recovery minimizes blast radius.']

    paths_overrides = {
        'core': ['src/domain', 'src/application', 'src/infrastructure', 'src/interfaces', 'tests/unit',
                 'tests/integration', 'tests/contract', 'tests/e2e', 'infra', 'docs/architecture'],
        'identity_authorization': ['modules/identity', 'modules/authorization'],
        'notification': ['modules/notification'],
        'calendar_integration': ['integrations/calendar'],
        'rwd_web': ['apps/rwd-web'],
        'offline_sync': ['apps/rwd-web/offline'],
        'audit_observability': ['modules/audit', 'observability'],
        'accounting_integration': ['integrations/accounting'],
        'labor_time': ['modules/labor-time'],
    }

    purpose_overrides = {
        'core': 'Establish the system-wide engineering foundation and clean architecture boundaries.',
        'identity_authorization': readme_lead(IDENTITY_README) + ' ' + readme_lead(AUTHZ_README),
        'notification': readme_lead(NOTIFICATION_README),
        'audit_observability': readme_lead(AUDIT_README),
        'rwd_web': 'Responsive web UI delivery boundary (MEP-CAP-RWD-WEB); see MEP-INV-RWD.',
        'calendar_integration': 'Google Calendar integration boundary for published/amended/cancelled '
                                 'dispatch events (MEP-CAP-GCAL-INTEGRATION); see MEP-INV-GCAL-IDEMPOTENT.',
        'offline_sync': 'Bounded offline browser cache/queued-intent sync (MEP-CAP-OFFLINE); company '
                         'system remains authoritative; see MEP-INV-OFFLINE-AUTHORITY.',
    }
    for mid, path in README_MODULES.items():
        purpose_overrides[mid] = readme_lead(path)

    modules_out = []
    obligations_out = {}
    for mid in all_module_ids:
        paths = paths_overrides.get(mid, [f'modules/{mid.replace("_", "-")}'])
        activated_by = sorted(c['id'] for c in caps_by_module.get(mid, []))
        modules_out.append({'id': mid, 'paths': paths, 'activated_by': activated_by})

        purpose = purpose_overrides.get(mid)
        if purpose is None:
            names = ', '.join(c['name'] for c in caps_by_module.get(mid, []))
            purpose = f'Owns the following MEP capabilities: {names}.' if names else \
                f'Generation-module path activated indirectly via rules/module-rules.json (module `{mid}`).'
        module_invs = [GENERIC_RULE_TEXT] + module_extra_invariants.get(mid, [])
        for c in caps_by_module.get(mid, []):
            if c['id'] in inv_by_cap:
                module_invs.append(inv_by_cap[c['id']])
        obligations_out[mid] = {
            'purpose': purpose, 'invariants': module_invs, 'security': security_baseline,
            'tests': tests_baseline, 'operations': ops_baseline, 'recovery': recovery_baseline,
        }

    dump(OUT / 'generation/module-manifests.json', {'version': '1.0.0', 'modules': modules_out})
    dump(OUT / 'generation/module-obligations.json', {'version': '1.0.0', 'modules': obligations_out})


def doc_id(name):
    return name[:-3] if name.endswith('.md') else name


def build_blueprint_content():
    dispatch_readme_invariants = [l.strip('- ').strip() for l in
                                   Path(REPO / 'modules/dispatch/README.md').read_text(encoding='utf-8').splitlines()
                                   if l.strip().startswith('- ')]
    sm = load(REPO / 'modules/dispatch/state-machine.json')
    dispatch_schema = load(REPO / 'packages/contracts/dispatch.schema.json')
    ack_schema = load(REPO / 'packages/contracts/dispatch-acknowledgement.schema.json')
    bp06 = Path(BLUEPRINT / '06_DISPATCH_STATE_MACHINE.md').read_text(encoding='utf-8')

    docs = {}
    docs['dispatch-README'] = {
        'source_file': 'modules/dispatch/README.md', 'section_count': 2,
        'sections': {
            'domain_objects': {'heading': 'Dispatch Module', 'content': readme_lead(REPO / 'modules/dispatch/README.md')},
            'data_rules': {'heading': 'Invariants', 'content': '\n'.join(f'- {x}' for x in dispatch_readme_invariants)},
        },
    }
    docs['dispatch-state-machine'] = {
        'source_file': 'modules/dispatch/state-machine.json', 'section_count': 1,
        'sections': {'state_machine': {'heading': 'States', 'content': '```json\n' + json.dumps(sm, ensure_ascii=False, indent=2) + '\n```'}},
    }
    docs['06_DISPATCH_STATE_MACHINE'] = {
        'source_file': 'project-instance/phase1-blueprint/06_DISPATCH_STATE_MACHINE.md', 'section_count': 2,
        'sections': {
            'state_machine': {'heading': 'States', 'content': bp06.split('## Material amendment fields')[0].split('## States',1)[1].strip()},
            'data_rules': {'heading': 'Invariants', 'content': bp06.split('## Invariants',1)[1].strip()},
        },
    }
    docs['dispatch-contract-schema'] = {
        'source_file': 'packages/contracts/dispatch.schema.json + dispatch-acknowledgement.schema.json',
        'section_count': 1,
        'sections': {'contract_schema': {'heading': 'Contract Schema', 'content':
            '```json\n' + json.dumps(dispatch_schema, ensure_ascii=False, indent=2) + '\n```\n\n```json\n' +
            json.dumps(ack_schema, ensure_ascii=False, indent=2) + '\n```'}},
    }
    for mid, path in README_MODULES.items():
        if mid == 'dispatch':
            continue
        docs[f'{mid}-README'] = {'source_file': f'modules/{mid}/README.md', 'section_count': 1,
                                  'sections': {'domain_objects': {'heading': mid, 'content': readme_lead(path)}}}
    docs['identity-README'] = {'source_file': 'modules/identity/README.md', 'section_count': 1,
                                'sections': {'domain_objects': {'heading': 'identity', 'content': readme_lead(IDENTITY_README)}}}
    docs['authorization-README'] = {'source_file': 'modules/authorization/README.md', 'section_count': 1,
                                     'sections': {'domain_objects': {'heading': 'authorization', 'content': readme_lead(AUTHZ_README)}}}
    docs['notification-README'] = {'source_file': 'modules/notification/README.md', 'section_count': 1,
                                    'sections': {'domain_objects': {'heading': 'notification', 'content': readme_lead(NOTIFICATION_README)}}}
    docs['audit-README'] = {'source_file': 'modules/audit/README.md', 'section_count': 1,
                             'sections': {'domain_objects': {'heading': 'audit', 'content': readme_lead(AUDIT_README)}}}

    mapping = {
        'dispatch': ['dispatch-README.md', 'dispatch-state-machine.json', '06_DISPATCH_STATE_MACHINE.md', 'dispatch-contract-schema.json'],
        'project': ['project-README.md'],
        'workforce': ['workforce-README.md'],
        'identity_authorization': ['identity-README.md', 'authorization-README.md'],
        'notification': ['notification-README.md'],
        'audit_observability': ['audit-README.md'],
    }
    dump(OUT / 'generation/blueprint-doc-mapping.json', {
        'version': '1.0.0',
        'source_pack': 'Water_Electrical_MEP_Foundry_Delivery_v1.1/project-instance',
        'source_manifest': str((PACK / 'INDUSTRY_MANIFEST.json').relative_to(SRC)),
        'built_from': 'scripts/adapt_mep_industry_pack.py', 'mapping': mapping,
        'unmapped_platform_shape': [], 'unmapped_no_blueprint_doc': [],
    })
    dump(OUT / 'generation/blueprint-architecture-content.json', {
        'schema_version': '1.0.0',
        'source_pack': 'Water_Electrical_MEP_Foundry_Delivery_v1.1/project-instance', 'docs': docs,
    })


def main():
    caps_by_id = build_capabilities()
    questions, mep_questions = build_questionnaire()
    build_question_rules(mep_questions)
    build_empty_rules()
    module_rules = build_module_rules()
    build_baseline()
    build_generation(caps_by_id, module_rules)
    build_blueprint_content()
    print('ADAPT MEP PACK: done, capabilities=%d questions=%d' % (len(caps_by_id), len(questions)))


if __name__ == '__main__':
    main()
