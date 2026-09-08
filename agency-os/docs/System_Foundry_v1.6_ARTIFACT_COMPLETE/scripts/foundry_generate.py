#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import argparse, json, tempfile, shutil, os, datetime, hashlib
from configurator_engine import ROOT, VERSION, load, resolve, questionnaire_digest, safe_name, EXPECTED_BLUEPRINT_COUNT, industry_paths
from extract_blueprint_content import doc_id as bp_doc_id

MODULE_DOCS=[
 '00_REQUIREMENTS.md','01_ARCHITECTURE.md','02_CONTRACTS.md','03_SECURITY.md','04_DATA_AND_MIGRATION.md',
 '05_TEST_STRATEGY.md','06_OBSERVABILITY_AND_SRE.md','07_ROLLBACK_AND_RECOVERY.md','08_IMPLEMENTATION_BACKLOG.md'
]

# canonical extraction key -> display title. domain_objects..definition_of_done come from Commerce's
# extract_blueprint_content.SECTION_ALIASES; state_machine/contract_schema were added for the
# construction-mep-contractor pack's own real content shape (state-machine.json + JSON Schema
# contracts have no equivalent in Commerce's LEGO doc vocabulary). Additive only: Commerce docs
# never populate these two keys, so this list growing is a no-op for existing output.
BP_SECTION_TITLES={
 'domain_objects':'Domain Objects','service_contract':'Public Service Contract',
 'events_published':'Events Published','events_consumed':'Events Consumed',
 'permissions':'Permissions','data_rules':'Data Rules','lego_test':'LEGO Test',
 'definition_of_done':'Definition of Done',
 'state_machine':'State Machine','contract_schema':'Contract Schema',
}

def blueprint_content_maps(industry=None):
    paths=industry_paths(industry)
    mapping=load(paths['blueprint_doc_mapping'])['mapping']
    raw=load(paths['blueprint_architecture_content'])
    return mapping,raw['docs'],raw.get('source_pack','')

MODULE_COMMON='_module_common'

# Unit-level (per-capability) filtering of the mechanically-extracted blueprint content, for docs
# that have a hand-curated generation/blueprint-capability-item-map.json entry. Docs without one
# are untouched (module_architecture_text's covered_docs check skips filtering entirely) -- the
# module-level fallback from dc9e5d2b6/9a7afef80 is preserved byte-for-byte for every module this
# pass didn't map. Industries without an item map (registry entry is null, e.g.
# construction-mep-contractor) get empty structures here -- every doc stays module-level/unfiltered,
# which is this pass's explicitly correct scope (see task step 6's out-of-scope note).
def blueprint_item_maps(industry=None):
    paths=industry_paths(industry)
    if not paths.get('blueprint_architecture_items') or not paths.get('blueprint_capability_item_map'):
        return {},{},set()
    items=load(paths['blueprint_architecture_items'])['docs']
    capmap=load(paths['blueprint_capability_item_map'])
    rev={}
    for cid,entries in capmap['map'].items():
        for e in entries: rev[(e['doc_id'],e['section'],e['item_index'])]=cid
    covered_docs=set(capmap['covered_modules'].values())
    return items,rev,covered_docs

# Rebuilds a section's content from only the items whose mapped capability is in `selected`
# (which always includes MODULE_COMMON). Returns raw_content unchanged -- literally the same
# object -- when nothing would be filtered out, so "every capability in the module selected"
# is guaranteed byte-identical to the pre-unit-filtering full-module output, not just
# content-equivalent. Returns '' when every item in this section was filtered out (caller skips
# emitting the section header for an empty body rather than printing a dangling heading).
def filter_section_content(did,skey,raw_content,items_for_doc,rev,selected):
    item_list=items_for_doc.get(skey)
    if not item_list: return raw_content
    keep=[i for i in range(len(item_list)) if rev.get((did,skey,i),MODULE_COMMON) in selected]
    if len(keep)==len(item_list): return raw_content
    kept=[item_list[i] for i in keep]
    if not kept: return ''
    first_line=next((l for l in raw_content.splitlines() if l.strip()),'')
    if first_line.lstrip().startswith('```'):
        lang=first_line.lstrip()[3:].strip() or 'text'
        return '```'+lang+'\n'+'\n'.join(kept)+'\n```'
    if first_line.lstrip().startswith('- '):
        return '\n'.join(f'- {it}' for it in kept)
    return '\n'.join(kept)

# Real blueprint architecture content, mechanically extracted (extract_blueprint_content.py) --
# not the generic governance boilerplate in MODULE_DOCS. Returns None (write nothing, no
# placeholder) when the module has no mapping, or every mapped doc matched zero sections.
# mcaps = the module's actually-selected capability IDs from plan['module_reasons'][mid] (the
# resolved plan, not "module selected/not selected"). item_maps is blueprint_item_maps()'s
# (items, rev, covered_docs) tuple; docs not in covered_docs keep full content unfiltered.
def module_architecture_text(mid,bp_mapping,bp_content,mcaps=(),item_maps=None,source_pack=''):
    items_by_doc,rev,covered_docs=item_maps if item_maps else ({},{},set())
    selected=set(mcaps)|{MODULE_COMMON}
    blocks=[]
    for fname in bp_mapping.get(mid,[]):
        did=bp_doc_id(fname); entry=bp_content.get(did)
        if not entry or not entry['sections']: continue
        fine_grained=did in covered_docs
        lines=[f'## {did}','',f'Source: `{entry["source_file"]}`','']
        for key,title in BP_SECTION_TITLES.items():
            sec=entry['sections'].get(key)
            if not sec: continue
            content=sec['content']
            if fine_grained:
                content=filter_section_content(did,key,content,items_by_doc.get(did,{}),rev,selected)
                if not content.strip(): continue
            lines += [f'### {title}','',content,'']
        blocks.append('\n'.join(lines).rstrip())
    if not blocks: return None
    header=f"""# {mid} — Blueprint Architecture Reference

Status: **EXTRACTED_FROM_BLUEPRINT**
Foundry: `{VERSION}`
Module: `{mid}`
Source pack: `{source_pack}`

Content below is mechanically extracted (verbatim, unedited) from the matched blueprint doc(s) via `scripts/extract_blueprint_content.py`. It is real architecture content, not generic governance boilerplate. Regenerate from source if the blueprint docs change; do not hand-edit."""
    return header+'\n\n'+'\n\n'.join(blocks)

# newline='\n' pinned on both writers: every byte Foundry writes here is later sha256-hashed
# (sha256_file below, and verify_artifact_manifest in test_selection_matrix.py) and is meant to
# be committed to git (LF-normalized). Without pinning it, Path.write_text() applies the platform
# default newline translation (CRLF on Windows), so a manifest hashed at generation time on
# Windows would mismatch after any git round-trip or Linux verification -- the same class of bug
# fixed in regenerate_integrity.py, but here it hits every generated artifact, not just 2 files.
def dump(p,obj): p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def write(p,text): p.parent.mkdir(parents=True,exist_ok=True); p.write_text(text.rstrip()+'\n',encoding='utf-8',newline='\n')
def sha256_file(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def cap_maps(industry=None):
    paths=industry_paths(industry)
    caps={c['id']:c for c in load(paths['capabilities'])['capabilities']}
    qs={q['id']:q for q in load(paths['questionnaire'])['questions']}
    return caps,qs

def cap_source(plan,cid):
    if cid in plan['foundation']: return 'FOUNDATION'
    if cid in plan['user_selected']: return 'USER_SELECTED'
    if cid in plan['derived']: return 'DERIVED'
    if cid in plan['deferred']: return 'DEFERRED'
    return 'UNKNOWN'

def blueprint_active(cond,plan):
    if cond.get('always'): return True
    mods=set(plan['modules']); caps=set(plan['current_capabilities'])
    return bool((set(cond.get('any_modules',[])) & mods) or (set(cond.get('any_capabilities',[])) & caps) or (plan['profile'] in cond.get('profiles',[])))

def module_doc_text(mid,role,plan,obl,caps):
    mcaps=plan['module_reasons'].get(mid,[])
    caplines=[]
    for cid in mcaps:
        if cid in caps: caplines.append(f"- `{cid}` — {caps[cid]['name']} — **{cap_source(plan,cid)}**")
        else: caplines.append(f"- `{cid}` — user custom requirement — **USER_CUSTOM**")
    trace=[]
    for cid in mcaps:
        refs=plan['traceability'].get(cid,[])
        if refs: trace.append(f"- `{cid}` <- {', '.join(f'`{x}`' for x in refs)}")
    title=role.replace('_',' ').replace('.md','').title()
    common=f"""# {mid} — {title}

Status: **GENERATED_CONTRACT**  
Foundry: `{VERSION}`  
Module: `{mid}`

## Purpose
{obl['purpose']}

## Activated capabilities
{chr(10).join(caplines) if caplines else '- Core foundation only.'}

## Traceability
{chr(10).join(trace) if trace else '- Activation comes from locked Foundry baseline.'}
"""
    if role=='00_REQUIREMENTS.md':
        body="## Mandatory invariants\n"+'\n'.join(f'- {x}' for x in obl['invariants'])+"\n\n## Acceptance boundary\n- These invariants are mandatory; implementation technology remains an architecture decision.\n- Custom requirements mapped to this module remain `ARCHITECTURE_REVIEW_REQUIRED` until explicitly mapped.\n"
    elif role=='01_ARCHITECTURE.md':
        body="## Stable boundary\n"+'\n'.join(f'- {x}' for x in obl['invariants'])+"\n\n## Architecture decisions still required\n- Select implementation/provider only after comparing at least three viable options where material.\n- Keep domain semantics and contracts replaceable independently from framework/vendor choices.\n- Record exact paths, migration, rollback, observability, and expected result before implementation.\n"
    elif role=='02_CONTRACTS.md':
        body="## Contract obligations\n- All public/inter-module contracts are explicit, versioned, testable, and compatibility-managed.\n- Internal implementation details and vendor-specific semantics do not leak across the module boundary.\n- Consequential writes define idempotency or explicitly prove why retries cannot occur.\n\n## Contract test location\n- `tests/contract/` or the module-specific test path generated for this module.\n"
    elif role=='03_SECURITY.md':
        body="## Security obligations\n"+'\n'.join(f'- {x}' for x in obl['security'])+"\n\n## Verification\n- Negative authorization/abuse tests are required where a trust boundary exists.\n- Secrets, sensitive data, and elevated actions follow Foundry authority and evidence contracts.\n"
    elif role=='04_DATA_AND_MIGRATION.md':
        body="## Data obligations\n- Identify authoritative data, owner, lifecycle, retention, and restore semantics before persistence implementation.\n- Derived data must be rebuildable from authoritative sources.\n- Schema/data changes require compatibility, migration, validation, and rollback/forward-recovery plans.\n\n## Migration gate\n- No destructive migration proceeds without verified backup/restore and reconciliation criteria.\n"
    elif role=='05_TEST_STRATEGY.md':
        body="## Required tests\n"+'\n'.join(f'- {x}' for x in obl['tests'])+"\n\n## Gate\n- A selected module is not complete while any required test category has no executable test or explicit evidence-backed N/A rationale.\n"
    elif role=='06_OBSERVABILITY_AND_SRE.md':
        body="## Operational obligations\n"+'\n'.join(f'- {x}' for x in obl['operations'])+"\n\n## Required evidence\n- Signals, ownership, alert/routing, dashboard/query, and runbook references are recorded before production release.\n"
    elif role=='07_ROLLBACK_AND_RECOVERY.md':
        body="## Recovery obligations\n"+'\n'.join(f'- {x}' for x in obl['recovery'])+"\n\n## Gate\n- Rollback/compensation is defined before implementation and verified before release.\n- Recovery must minimize blast radius and preserve auditability.\n"
    else:
        base=f"implementation/{mid}"
        body=f"""## Implementation tasks

### TASK-{mid.upper()}-001 — Establish module boundary
- Exact path: `{base}` or the stack-specific path selected by architecture.
- Change: implement only the contracts and invariants recorded in this module package.
- Dependencies: see `.foundry/resolution/foundry-plan.json`.
- Tests: satisfy `05_TEST_STRATEGY.md`.
- Observability: satisfy `06_OBSERVABILITY_AND_SRE.md`.
- Rollback: satisfy `07_ROLLBACK_AND_RECOVERY.md`.
- Acceptance criteria: module contract and all negative/positive tests pass.
- Expected result: replaceable, independently verifiable `{mid}` module.

### TASK-{mid.upper()}-002 — Prove integration
- Exact path: generated module path(s) listed in `MODULE_MANIFEST.json`.
- Change: connect through explicit interfaces only.
- Acceptance criteria: contract tests pass and no undeclared dependency is introduced.
- Expected result: LEGO-compatible integration without hidden coupling.
"""
    return common+'\n'+body

def write_module_package(stage,mid,plan,module_manifest,obl,caps,bp_mapping,bp_content,item_maps=None,source_pack=''):
    d=stage/'docs/modules'/mid
    d.mkdir(parents=True,exist_ok=True)
    for role in MODULE_DOCS:
        write(d/role,module_doc_text(mid,role,plan,obl,caps))
    mcaps=[x for x in plan['module_reasons'].get(mid,[]) if x in caps]
    arch_text=module_architecture_text(mid,bp_mapping,bp_content,mcaps,item_maps,source_pack)
    if arch_text is not None: write(d/'BLUEPRINT_ARCHITECTURE.md',arch_text)
    manifest={
      'schema_version':'1.0.0','module_id':mid,'status':'SELECTED','purpose':obl['purpose'],
      'activated_capabilities':[x for x in plan['module_reasons'].get(mid,[]) if x in caps],
      'custom_requirements':[x for x in plan['module_reasons'].get(mid,[]) if x.startswith('REQ-CUSTOM-')],
      'generated_paths':module_manifest['paths'],
      'required_documents':MODULE_DOCS,'invariants':obl['invariants'],'security_obligations':obl['security'],
      'test_obligations':obl['tests'],'operational_obligations':obl['operations'],'recovery_obligations':obl['recovery']
    }
    dump(d/'MODULE_MANIFEST.json',manifest)
    for rel in module_manifest['paths']:
        p=stage/rel; p.mkdir(parents=True,exist_ok=True)
        link='docs/modules/'+mid+'/MODULE_MANIFEST.json'
        write(p/'README.md',f"# Generated Foundry Module Path\n\nModule: `{mid}`  \nStatus: `SCAFFOLDED`\n\nThis path is intentionally technology-neutral until architecture selects a stack. The executable requirements are in `{link}` and `docs/modules/{mid}/`.\n\nDo not add implementation that violates the generated module contract.\n")

def write_requirements(stage,plan,answers,industry=None):
    caps,qs=cap_maps(industry); qr={r['when']['question']:r for r in load(industry_paths(industry)['question_rules'])['rules'] if 'question' in r.get('when',{})}
    decisions=['# User Requirement Decisions','', '| Question | Decision | Direct effect |','|---|---|---|']
    for qid,val in sorted(answers.items()):
        q=qs[qid]; r=qr.get(qid,{}); eff=(r.get('require') or r.get('defer') or [])
        decisions.append(f"| `{qid}` {q['label']} | {'要' if val else '不要'} | {', '.join(f'`{x}`' for x in eff) if val else 'none'} |")
    write(stage/'docs/requirements/USER_DECISIONS.md','\n'.join(decisions))
    for key,title in [('user_selected','User-selected capabilities'),('derived','Foundry-derived mandatory capabilities'),('deferred','Deferred / option-preserved capabilities')]:
        lines=[f'# {title}','']
        for cid in plan[key]:
            lines.append(f"- `{cid}` — {caps[cid]['name']} — trace: {', '.join(plan['traceability'].get(cid,[])) or 'dependency/baseline'}")
        if not plan[key]: lines.append('- None.')
        write(stage/'docs/requirements'/(key.upper()+'.md'),'\n'.join(lines))

def write_blueprints(stage,plan):
    caps=set(plan['current_capabilities']); mods=set(plan['modules']); bpmap=load('generation/blueprint-map.json')['documents']; index=['# System Blueprint Index','',f"Foundry `{VERSION}` generated applicability from canonical plan.",'','| Document | Status |','|---|---|']
    active_count=0
    for rec in bpmap:
        fn=rec['file']; active=blueprint_active(rec['when'],plan); active_count+=int(active); status='ACTIVE' if active else 'NOT_APPLICABLE'
        index.append(f'| `{fn}` | {status} |')
        template=(ROOT/'templates/TOP_TIER_SYSTEM_BLUEPRINT'/fn).read_text(encoding='utf-8'); title=template.splitlines()[0] if template.strip() else '# Blueprint'
        if active:
            basis=[]
            if rec['when'].get('always'): basis.append('Foundry baseline')
            basis += [f'module `{x}`' for x in rec['when'].get('any_modules',[]) if x in mods]
            basis += [f'capability `{x}`' for x in rec['when'].get('any_capabilities',[]) if x in caps]
            if plan['profile'] in rec['when'].get('profiles',[]): basis.append(f"profile `{plan['profile']}`")
            body=f"""{title}

Status: **ACTIVE**  
Generated from: `.foundry/resolution/foundry-plan.json`

## Purpose
This blueprint section is applicable because: {', '.join(basis) or 'selected system scope'}.

## Current Truth
This is a generated new-system contract. Implementation truth is not yet claimed; implementation evidence must be added with exact file:line references when code exists.

## Target Truth
Implement the selected capabilities through the module contracts in `docs/modules/` while preserving Foundry baseline invariants.

## Evidence
- Input digest: `{plan['input_digest']}`
- Current capabilities: {len(plan['current_capabilities'])}
- Selected modules: {', '.join(f'`{x}`' for x in plan['modules'])}

## Decisions
Technology/provider decisions remain `UNRESOLVED` until architecture option comparison and human approval where required. This is deliberate to prevent premature lock-in.

## Risks
Implementation-specific risks must be entered in the risk register before implementation. No unstated risk is treated as verified.

## Exact Paths
- `.foundry/resolution/foundry-plan.json`
- `docs/modules/`
- `docs/requirements/`

## Validation
- Run Foundry verification and module-specific test contracts.
- Every factual implementation claim requires content-addressed exact file:line evidence.

## Rollback
Generation is staging-first and atomic. Implementation changes must define module-specific rollback/compensation before execution.

## Expected Result
A traceable, replaceable, testable implementation of this applicable blueprint section without adding unselected capabilities.
"""
        else:
            body=f"""{title}

Status: **NOT_APPLICABLE**

## Reason
No selected or derived capability satisfied this blueprint section's applicability rule in `generation/blueprint-map.json`.

## Evidence
- Input digest: `{plan['input_digest']}`
- Selected modules: {', '.join(f'`{x}`' for x in plan['modules'])}

## Re-evaluation
If a future questionnaire answer activates the mapped capability/module/profile, regenerate from the new immutable answer snapshot. Do not manually convert this section to ACTIVE.
"""
        write(stage/'docs/blueprint'/fn,body)
    write(stage/'docs/blueprint/INDEX.md','\n'.join(index))
    return active_count,len(bpmap)

def validate_generated(stage,plan,module_data):
    errors=[]
    selected=set(plan['modules'])
    for mid in selected:
        for role in MODULE_DOCS+['MODULE_MANIFEST.json']:
            if not (stage/'docs/modules'/mid/role).is_file(): errors.append(f'{mid}: missing module artifact {role}')
        for rel in module_data[mid]['paths']:
            if not (stage/rel/'README.md').is_file(): errors.append(f'{mid}: missing path scaffold {rel}/README.md')
    for mid,m in module_data.items():
        if mid not in selected:
            if (stage/'docs/modules'/mid).exists(): errors.append(f'unselected module docs generated: {mid}')
            for rel in m['paths']:
                if (stage/rel).exists(): errors.append(f'unselected module path generated: {mid}:{rel}')
    bps=list((stage/'docs/blueprint').glob('[0-9][0-9]_*.md'))
    if len(bps)!=EXPECTED_BLUEPRINT_COUNT: errors.append(f'blueprint document count {len(bps)} != {EXPECTED_BLUEPRINT_COUNT}')
    required=[stage/'README.md',stage/'.foundry/intake/answers.json',stage/'.foundry/resolution/foundry-plan.json',stage/'.foundry/project-profile.json',stage/'docs/SYSTEM_BLUEPRINT.md',stage/'docs/IMPLEMENTATION_BACKLOG.md']
    for p in required:
        if not p.is_file(): errors.append('missing required generated file '+str(p.relative_to(stage)))
    if errors: raise RuntimeError('staging validation failed:\n'+'\n'.join(errors))

def artifact_manifest(stage):
    rows=[]
    for p in sorted(x for x in stage.rglob('*') if x.is_file() and x.relative_to(stage).as_posix()!='.foundry/resolution/artifact-manifest.json'):
        rows.append({'path':p.relative_to(stage).as_posix(),'sha256':sha256_file(p),'bytes':p.stat().st_size})
    return {'schema_version':'1.0.0','file_count':len(rows),'files':rows}

def generate(plan,answers,custom,out_root,industry=None):
    name=safe_name(plan['project']['name']); out_root=Path(out_root).resolve(); target=out_root/name
    if target.exists(): raise FileExistsError('target already exists: '+str(target))
    out_root.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.foundry-stage-',dir=out_root))
    try:
        paths=industry_paths(industry)
        module_data={m['id']:m for m in load(paths['module_manifests'])['modules']}
        obligations=load(paths['module_obligations'])['modules']; caps,_=cap_maps(industry)
        bp_mapping,bp_content,bp_source_pack=blueprint_content_maps(industry); item_maps=blueprint_item_maps(industry)
        for mid in plan['modules']:
            if mid not in module_data: raise ValueError('unknown generation module '+mid)
            if mid not in obligations: raise ValueError('missing module obligations '+mid)
            write_module_package(stage,mid,plan,module_data[mid],obligations[mid],caps,bp_mapping,bp_content,item_maps,bp_source_pack)
        for rel in ['.foundry/intake','.foundry/resolution','.foundry/handoffs','.foundry/verification','.foundry/migration-history','docs/requirements','docs/blueprint']:
            (stage/rel).mkdir(parents=True,exist_ok=True)
        now=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
        snapshot={'schema_version':'1.0.0','questionnaire_version':load(paths['questionnaire'])['questionnaire_version'],'questionnaire_digest':questionnaire_digest(industry),'submitted_at':now,'project':plan['project'],'answers':dict(sorted(answers.items())),'custom_requirements':plan['custom_requirements']}
        dump(stage/'.foundry/intake/answers.json',snapshot); dump(stage/'.foundry/resolution/foundry-plan.json',plan)
        dump(stage/'.foundry/foundry-lock.json',{'foundry_version':VERSION,'compiler_version':VERSION,'input_digest':plan['input_digest'],'questionnaire_digest':snapshot['questionnaire_digest']})
        profile={'project_id':name,'profile':plan['profile'],'system_type':'+'.join(plan['archetypes']),'criticality':plan['criticality'],'commercial':'CAP-COMMERCIAL' in plan['current_capabilities'],'multi_tenant':'CAP-MULTI-TENANT' in plan['current_capabilities'],'regulated':'compliance' in plan['modules']}
        dump(stage/'.foundry/project-profile.json',profile)
        custom_lines=['# Custom Requirements','']
        for r in plan['custom_requirements']: custom_lines += [f"## {r['id']}",f"Category: `{r['category']}`",'',r['statement'],'',f"Mapping: `{r['mapping_status']}`",'']
        if not plan['custom_requirements']: custom_lines.append('- None.')
        write(stage/'docs/requirements/custom.md','\n'.join(custom_lines)); write_requirements(stage,plan,answers,industry)
        cap_lines=['# Foundry Capability Plan','',f"Generated by System Foundry {VERSION}.",'','## Foundation (locked)']+[f'- {x}' for x in plan['foundation']]+['','## User selected']+[f'- {x}' for x in plan['user_selected']]+['','## Derived']+[f'- {x}' for x in plan['derived']]+['','## Deferred / option preserved']+[f'- {x}' for x in plan['deferred']]
        write(stage/'docs/FOUNDRY_CAPABILITY_PLAN.md','\n'.join(cap_lines))
        active_bp,total_bp=write_blueprints(stage,plan)
        system_lines=[f'# {name} — Generated System Blueprint','',f'Foundry: `{VERSION}`',f"Profile: `{plan['profile']}`",f"Criticality: `{plan['criticality']}`",'', '## Capability resolution',f"- Foundation: {len(plan['foundation'])}",f"- User selected: {len(plan['user_selected'])}",f"- Derived: {len(plan['derived'])}",f"- Deferred: {len(plan['deferred'])}",f"- Current total: {len(plan['current_capabilities'])}",'','## LEGO modules']+[f'- `{m}`' for m in plan['modules']]+['','## Blueprint applicability',f'- Active: {active_bp}',f'- Not applicable: {total_bp-active_bp}',f'- Total controlled sections: {total_bp}','','## Truth boundary','This document is a deterministic planning/assurance output. It does not claim that implementation exists. Implementation claims become VERIFIED only with exact content-addressed file:line evidence.']
        write(stage/'docs/SYSTEM_BLUEPRINT.md','\n'.join(system_lines))
        backlog=['# Implementation Backlog','', 'Every selected LEGO module has a generated implementation contract. Execute only after architecture gates converge.','']
        for mid in plan['modules']:
            backlog += [f'## {mid}',f'- Contract: `docs/modules/{mid}/08_IMPLEMENTATION_BACKLOG.md`',f'- Module paths: '+', '.join(f'`{x}`' for x in module_data[mid]['paths']),'']
        write(stage/'docs/IMPLEMENTATION_BACKLOG.md','\n'.join(backlog))
        trace={'schema_version':'1.0.0','input_digest':plan['input_digest'],'module_reasons':plan['module_reasons'],'capability_traceability':plan['traceability'],'deferred':plan['deferred']}
        dump(stage/'.foundry/resolution/selection-traceability.json',trace)
        coverage={'schema_version':'1.0.0','modules_selected':len(plan['modules']),'module_artifacts_per_module':len(MODULE_DOCS)+1,'blueprints_active':active_bp,'blueprints_not_applicable':total_bp-active_bp,'blueprints_total':total_bp,'current_capabilities':len(plan['current_capabilities']),'deferred_capabilities':len(plan['deferred'])}
        dump(stage/'.foundry/verification/generation-coverage.json',coverage)
        write(stage/'README.md',f"# {name}\n\nGenerated by System Foundry {VERSION}.\n\nStart with `docs/SYSTEM_BLUEPRINT.md`, `docs/blueprint/INDEX.md`, and `.foundry/resolution/foundry-plan.json`. Each selected LEGO module has a complete planning/assurance package under `docs/modules/<module>/`.\n")
        validate_generated(stage,plan,module_data)
        dump(stage/'.foundry/resolution/artifact-manifest.json',artifact_manifest(stage))
        os.replace(stage,target)
        return target
    except Exception:
        shutil.rmtree(stage,ignore_errors=True); raise

def main(argv=None):
    ap=argparse.ArgumentParser(); ap.add_argument('--input',required=True,help='JSON containing project, answers, custom_requirements'); ap.add_argument('--out',required=True); ap.add_argument('--industry',default=None,help='industries/REGISTRY.json key; defaults to the registry default_industry (commerce)'); a=ap.parse_args(argv)
    data=json.loads(Path(a.input).read_text(encoding='utf-8')); industry=data.get('industry',a.industry); plan=resolve(data['project'],data['answers'],data.get('custom_requirements',[]),industry); print(generate(plan,data['answers'],data.get('custom_requirements',[]),a.out,industry)); return 0
if __name__=='__main__': raise SystemExit(main())
