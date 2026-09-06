#!/usr/bin/env python3
"""Mutation-coverage check for rules/derivation-rules.json and every `requires` edge in
capabilities/catalog.json.

Root cause this closes (agency-os/TASKS.md "System Foundry v1.6" section D, items opened by
two independent critic reviews in the PLM/Quality and Merchandising rounds): the existing
test_selection_matrix.py all-YES coverage assertion (its step 2) only notices a deleted
derivation rule when its target DER-* capability has exactly one rule deriving it. 8 of the 24
derivation rules share two target ids (DER-COMPLIANCE-RESEARCH/DER-POLICY-FRESHNESS across the
8 DERIVE-COMPLIANCE-* rules; also DER-FILE-AUTHZ/DER-FILE-INTEGRITY across 3 rules,
DER-AI-AUDIT/DER-AI-AUTHORITY/DER-AI-TOOLS/DER-AI-IDEMPOTENCY/DER-AI-HUMAN across 2 rules, and
DER-HUMAN-OVERSIGHT/DER-INDEPENDENT-ASSURANCE across 3 rules -- 14 rules total), so deleting
any ONE of them leaves the all-YES *set* unchanged and the whole 13-gate+29-test suite green.
The exact same blind spot exists for ordinary `requires` edges on ANY of the 263 capabilities:
all-YES already activates every capability, so deleting one capability's `requires` edge to
another doesn't change the all-YES set either (proven via mutation testing on CAP-INVENTORY
edges during the Merchandising round -- 13-step verify chain stayed byte-for-byte green,
including test_selection_matrix.py's own pairwise_valid/pairwise_rejected counters).

This script closes both gaps with MUTATION TESTING rather than direct assertion: for every
derivation rule and every requires edge, remove it from an in-memory copy of the rules/catalog
(the real files on disk are never written to, not even transiently) and re-run resolve() across
a bounded sweep of real minimal-activation configurations, confirming at least one activation's
resolved plan actually differs. A rule/edge that changes NOTHING across the whole sweep is
either untested dead weight (FAIL, named) or a structurally provable redundancy (see
explain_redundant_edge() below) -- the latter is reported, not failed: a fully-redundant
`requires` edge is itself worth knowing about, but this script's own investigation found ~97 of
them already load-bearing-free in the current, deliberately-designed catalog (sub-feature
capabilities gated by active_when behind a parent question that independently requires the same
dependency, DER-* capabilities whose only requires edge duplicates their own derivation trigger,
etc.) -- hard-failing on all of them would make this check permanently red on a correct catalog
and train reviewers to ignore it, which is worse than not having the check at all. Anything that
is empirically dead AND doesn't match one of those known-explainable shapes is a hard FAIL.
"""
from pathlib import Path
import sys, random
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import configurator_engine as ce

QMAP = {q['id']: q for q in ce.load('questionnaires/catalog.json')['questions']}
QRULES = ce.load('rules/question-rules.json')['rules']
DRULES = ce.load('rules/derivation-rules.json')['rules']
CAPS = ce.load('capabilities/catalog.json')['capabilities']
CAPMAP = {c['id']: c for c in CAPS}
FOUNDATION = {x['id'] for x in ce.load('baselines/production-baseline.json')['capabilities']}

# ---- minimal-activation helpers -----------------------------------------------------------
# Deliberately duplicated from test_selection_matrix.py's satisfy()/merge()/complete()/
# answer_for_question() rather than imported: this script repeatedly rebinds
# configurator_engine.load (see _patched_load below) for the duration of one resolve() call.
# Importing test_selection_matrix.py would pull in its own module-level RULES/CAPS/etc.
# snapshots taken through the *original* loader at import time -- harmless today, but two
# scripts sharing mutable global patch state is exactly the kind of invisible coupling this
# whole check exists to flag elsewhere in the catalog, so it isn't introduced here either.
def merge(a, b):
    out = dict(a)
    for k, v in b.items():
        if k in out and out[k] is not v:
            raise ValueError('incompatible prerequisites')
        out[k] = v
    return out

def satisfy(cond):
    if not cond: return {}
    if 'question' in cond: return satisfy_question(cond['question'], cond['equals'])
    if 'all' in cond:
        out = {}
        for c in cond['all']: out = merge(out, satisfy(c))
        return out
    if 'any' in cond:
        for c in cond['any']:
            try: return satisfy(c)
            except ValueError: pass
    raise ValueError('cannot satisfy condition')

def satisfy_question(qid, value):
    q = QMAP[qid]
    pre = satisfy(q.get('active_when')) if q.get('active_when') else {}
    return merge(pre, {qid: value})

def complete(over=None, default=False):
    over = dict(over or {}); answers = {}
    for _ in range(50):
        active = {q['id'] for q in ce.active_questions(answers)}
        for k in list(answers):
            if k not in active: answers.pop(k)
        changed = False
        for q in ce.active_questions(answers):
            if q['id'] not in answers: answers[q['id']] = bool(over.get(q['id'], default)); changed = True
        for k, v in over.items():
            if k in {q['id'] for q in ce.active_questions(answers)} and answers.get(k) != v:
                answers[k] = v; changed = True
        if not changed: return answers
    raise RuntimeError('activation did not converge')

def answer_for_question(qid):
    over = satisfy(QMAP[qid].get('active_when')); over[qid] = True
    return complete(over, False)

# ---- in-memory rule/edge removal, driven entirely through configurator_engine.load() -------
# The real files under rules/ and capabilities/ are never opened for writing anywhere in this
# script. Each mutated resolve() call rebinds the module-level `load` to a wrapper that returns
# a freshly-built dict (with exactly one rule or one requires-edge excluded) for the one path
# being mutated, and falls through to the real, cached loader for every other path -- then
# restores the real loader in a `finally` block before the next call.
_real_load = ce.load

class _Mutation:
    __slots__ = ('excluded_rule_id', 'edge')
    def __init__(self):
        self.excluded_rule_id = None
        self.edge = None  # (capability_id, required_capability_id)

_mut = _Mutation()

def _patched_load(rel):
    if rel == 'rules/derivation-rules.json' and _mut.excluded_rule_id is not None:
        data = _real_load(rel)
        return {**data, 'rules': [r for r in data['rules'] if r['id'] != _mut.excluded_rule_id]}
    if rel == 'capabilities/catalog.json' and _mut.edge is not None:
        cap_id, dep_id = _mut.edge
        data = _real_load(rel)
        new_caps = []
        for c in data['capabilities']:
            if c['id'] == cap_id:
                c2 = dict(c); c2['requires'] = [x for x in c.get('requires', []) if x != dep_id]
                new_caps.append(c2)
            else:
                new_caps.append(c)
        return {**data, 'capabilities': new_caps}
    return _real_load(rel)

def resolve_without_rule(rule_id, name, answers):
    _mut.excluded_rule_id = rule_id
    ce.load = _patched_load
    try:
        return ce.resolve({'name': name}, answers, [])
    finally:
        ce.load = _real_load
        _mut.excluded_rule_id = None

def resolve_without_edge(cap_id, dep_id, name, answers):
    _mut.edge = (cap_id, dep_id)
    ce.load = _patched_load
    try:
        return ce.resolve({'name': name}, answers, [])
    finally:
        ce.load = _real_load
        _mut.edge = None

def plans_differ(a, b):
    return (a['current_capabilities'] != b['current_capabilities']
            or a['deferred'] != b['deferred']
            or a['modules'] != b['modules'])

# ---- structural explanations for edges the mutation sweep finds empirically dead -----------
# These are NOT a hand-maintained allowlist of specific (capability, edge) pairs -- they are
# general, mechanically-checked SHAPES. Any edge matching one of these shapes is provably
# redundant regardless of which specific capabilities are involved, so future edges of the same
# shape are covered automatically. Anything empirically dead that matches none of them is
# unexplained and fails the check by name.
def closure_requires(cid, seen=None):
    seen = seen if seen is not None else set()
    if cid in seen or cid not in CAPMAP: return seen
    seen.add(cid)
    for dep in CAPMAP[cid].get('requires', []):
        closure_requires(dep, seen)
    return seen

CAP_TO_DRIVING_QIDS = {}
for _r in QRULES:
    for _cid in _r.get('require', []) + _r.get('defer', []):
        CAP_TO_DRIVING_QIDS.setdefault(_cid, []).append(_r['when']['question'])

def forced_prereq_qids(qid, acc=None):
    # Questions transitively forced to True by qid's own active_when chain (an 'any' branch is
    # never "forced" -- only one side needs to hold -- so it's deliberately not walked here;
    # that only makes this function under-report forced prerequisites, which only makes
    # explain_redundant_edge() *more* conservative, never falsely exculpatory).
    acc = acc if acc is not None else set()
    cond = QMAP[qid].get('active_when')
    def walk(c):
        if not c: return
        if 'question' in c:
            pq = c['question']
            if c.get('equals') is True and pq not in acc:
                acc.add(pq); forced_prereq_qids(pq, acc)
        elif 'all' in c:
            for x in c['all']: walk(x)
    walk(cond)
    return acc

def explain_redundant_edge(cap_id, dep_id):
    """Returns a one-line reason if (cap_id, dep_id) is structurally redundant via a mechanism
    independent of this specific edge, else None (meaning: genuinely unexplained)."""
    if dep_id in FOUNDATION:
        return f'{dep_id} is a FOUND-* foundation capability, unconditionally present in every plan'
    if cap_id.startswith('DER-'):
        triggers = [r['when_capability'] for r in DRULES if cap_id in r['derive']]
        if dep_id in triggers:
            return f'{cap_id} can only ever be derived once {dep_id} is already active (its own derivation trigger)'
        for r in DRULES:
            if cap_id in r['derive']:
                for sib in r['derive']:
                    if sib != cap_id and dep_id in CAPMAP.get(sib, {}).get('requires', []):
                        return f'{dep_id} is also required by sibling {sib}, co-derived by the same rule {r["id"]}'
    # cap_id itself (not necessarily a DER-* capability) may TRIGGER a derivation rule whose
    # derived DER-* capabilities transitively require dep_id -- e.g. CAP-AI-EXTERNAL triggers
    # DERIVE-AI-EXT, which derives DER-AI-AUTHORITY, which requires CAP-AI-WRITE, which requires
    # CAP-AI: selecting CAP-AI-EXTERNAL always drags CAP-AI in through that chain regardless of
    # CAP-AI-EXTERNAL's own direct requires edge to CAP-AI.
    for r in DRULES:
        if r['when_capability'] == cap_id:
            for cid in r['derive']:
                if dep_id in closure_requires(cid):
                    return f'{dep_id} is reachable via {r["id"]}\'s own derived {cid} -> ... -> {dep_id} chain'
    driving = CAP_TO_DRIVING_QIDS.get(cap_id, [])
    if driving:
        for qid in driving:
            forced = forced_prereq_qids(qid)
            reached = any(
                dep_id in closure_requires(cid)
                for fq in forced
                for rule in QRULES if rule['when']['question'] == fq
                for cid in rule.get('require', []) + rule.get('defer', [])
            )
            if not reached:
                return None
        return f'every question that selects {cap_id} is active_when-gated behind a question that already requires {dep_id}'
    return None

def main():
    # Precompute one baseline (unmutated) resolve() per question's minimal-activation config,
    # plus a deterministic random sweep matching test_selection_matrix.py step 6's own approach
    # (own seed, independent pool -- not imported, see the note above satisfy()/merge()).
    # Scope: an earlier version of this comment claimed the single-question pool alone gives
    # byte-identical results to single-question+random, and that the random sweep "adds no
    # discriminative power for the current catalog" -- a 2026-09-06 critic review disproved this
    # directly (disabling the random sweep on the real, unmodified catalog produces a real FAIL:
    # CAP-FILE-VERSION -> CAP-FILES is only provably load-bearing in ~194/1000 random configs,
    # never in a single-question minimal activation alone). The random sweep is load-bearing for
    # this check's own correctness today, not merely defence-in-depth for a hypothetical future
    # edge -- do not remove or shrink it to save runtime without re-deriving this measurement.
    configs = {}
    baseline = {}
    for qid in sorted(QMAP):
        a = answer_for_question(qid)
        configs[qid] = a
        baseline[qid] = ce.resolve({'name': 'base-' + qid.lower()}, a, [])
    rng = random.Random(20260906)
    for n in range(1000):
        a = {}
        for _ in range(30):
            for q in ce.active_questions(a):
                if q['id'] not in a: a[q['id']] = bool(rng.getrandbits(1))
            active = {q['id'] for q in ce.active_questions(a)}
            a = {k: v for k, v in a.items() if k in active}
        key = f'rand-{n}'
        configs[key] = a
        baseline[key] = ce.resolve({'name': key}, a, [])

    cap_present = {}
    for key, plan in baseline.items():
        for cid in plan['current_capabilities']:
            cap_present.setdefault(cid, []).append(key)

    # ---- 1) every derivation rule must be load-bearing (zero tolerance: TASKS.md item 4
    # expects, and this script confirms, 0 of the current 24 are dead) ----
    dead_rules = []
    for rule in DRULES:
        found = False
        for key in cap_present.get(rule['when_capability'], []):
            mutated = resolve_without_rule(rule['id'], 'mut-' + rule['id'].lower() + '-' + key, configs[key])
            if plans_differ(baseline[key], mutated):
                found = True; break
        if not found:
            dead_rules.append(rule['id'])

    # ---- 2) every requires edge must be load-bearing, or provably redundant (see
    # explain_redundant_edge above) ----
    load_bearing = 0
    redundant = []   # (cap_id, dep_id, reason)
    unexplained = []  # (cap_id, dep_id)
    total_edges = 0
    for cap in CAPS:
        for dep in cap.get('requires', []):
            total_edges += 1
            found = False
            for key in cap_present.get(cap['id'], []):
                mutated = resolve_without_edge(cap['id'], dep, 'mut-edge-' + key, configs[key])
                if plans_differ(baseline[key], mutated):
                    found = True; break
            if found:
                load_bearing += 1
                continue
            reason = explain_redundant_edge(cap['id'], dep)
            if reason:
                redundant.append((cap['id'], dep, reason))
            else:
                unexplained.append((cap['id'], dep))

    if dead_rules or unexplained:
        print('MUTATION COVERAGE: FAIL')
        for rid in dead_rules:
            print(f'  untested derivation rule (no activation in the sweep changes the plan): {rid}')
        for cap_id, dep_id in unexplained:
            print(f'  untested/unexplained requires edge (no activation changes the plan, and no known-redundant shape explains it): {cap_id} -> {dep_id}')
        return 1

    print(f'MUTATION COVERAGE: PASS derivation_rules={len(DRULES)}/{len(DRULES)} load-bearing; '
          f'requires_edges={total_edges} total ({load_bearing} load-bearing, {len(redundant)} structurally-redundant, 0 unexplained)')
    if redundant:
        print('  structurally-redundant requires edges (reported per AGENTS.md R0/TASKS.md System Foundry item 5 -- not failing the build, fixing them is out of scope for this check):')
        for cap_id, dep_id, reason in redundant:
            print(f'    {cap_id} -> {dep_id}: {reason}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
