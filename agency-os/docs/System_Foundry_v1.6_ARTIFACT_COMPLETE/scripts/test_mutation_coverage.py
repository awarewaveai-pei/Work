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
#
# `exclude_edge`, threaded through every closure_requires() call from explain_redundant_edge(),
# is not optional decoration: the alternate-path proof for an edge (cap_id, dep_id) has to be a
# path that survives *without* that edge, mirroring what the empirical mutation sweep above
# already does (exclude one thing, re-run). Searching the full, unmodified graph instead lets a
# path loop back out through cap_id's own requires list and "discover" dep_id via the very edge
# being investigated -- a 2026-09-06 critic review found a concrete case: closure_requires(cid)
# over the full graph can walk cid -> ... -> cap_id -> dep_id, where that last hop *is* the edge
# under test, and the classifier would misreport a genuinely load-bearing edge as redundant.
def closure_requires(cid, exclude_edge=None, seen=None):
    seen = seen if seen is not None else set()
    if cid in seen or cid not in CAPMAP: return seen
    seen.add(cid)
    for dep in CAPMAP[cid].get('requires', []):
        if exclude_edge is not None and (cid, dep) == exclude_edge: continue
        closure_requires(dep, exclude_edge, seen)
    return seen

CAP_TO_DRIVING_QIDS = {}
for _r in QRULES:
    if _r['when'].get('equals') is not True: continue
    for _cid in _r.get('require', []):
        CAP_TO_DRIVING_QIDS.setdefault(_cid, []).append(_r['when']['question'])

def _forced_by_condition(cond, seen):
    """The FULL, transitively-expanded set of qids guaranteed True whenever `cond` holds -- each
    directly-named question plus everything forced (recursively) by that question's own
    active_when chain -- combined with configurator_engine.eval_condition()'s real semantics:
    'all' is AND (every element holds simultaneously, so the guaranteed set is the UNION of what
    each element transitively guarantees); 'any' is OR (only one, unknown, element holds, so only
    what is guaranteed by EVERY branch -- the INTERSECTION of each branch's *fully expanded* set --
    is genuinely forced, since the branch that actually fired could be any one of them). The
    expansion has to happen before the intersection, not after: two `any` branches can be
    different immediate questions that only converge on a shared ancestor deeper in each one's own
    active_when chain, and intersecting only the immediate layer would miss that shared ancestor
    entirely. Treating 'any' like 'all' (union instead of intersection) would smuggle an
    or-semantics condition through as if it were and-semantics and falsely over-claim a forced
    prerequisite; not walking 'any' at all (the previous behaviour) under-reports instead, which is
    why any capability whose only driving question sits behind an `any` gate always fell through to
    "unexplained" (a hard FAIL) even when genuinely, safely redundant. `seen` guards against a
    cyclical active_when chain re-entering the same question during one expansion; it is local to
    each branch (not shared across `any` siblings), since a fact forced only by one branch must not
    suppress correctly recomputing it for a different branch."""
    if not cond: return set()
    if 'question' in cond:
        if cond.get('equals') is not True: return set()
        pq = cond['question']
        if pq in seen: return {pq}
        return {pq} | _forced_by_condition(QMAP[pq].get('active_when'), seen | {pq})
    if 'all' in cond:
        out = set()
        for c in cond['all']: out |= _forced_by_condition(c, seen)
        return out
    if 'any' in cond:
        branches = [_forced_by_condition(c, seen) for c in cond['any']]
        if not branches: return set()
        out = set(branches[0])
        for b in branches[1:]: out &= b
        return out
    return set()

def forced_prereq_qids(qid):
    # Questions transitively forced to True by qid's own active_when chain.
    return _forced_by_condition(QMAP[qid].get('active_when'), frozenset({qid}))

def explain_redundant_edge(cap_id, dep_id):
    """Returns a one-line reason if (cap_id, dep_id) is structurally redundant via a mechanism
    independent of this specific edge, else None (meaning: genuinely unexplained)."""
    if dep_id in FOUNDATION:
        return f'{dep_id} is a FOUND-* foundation capability, unconditionally present in every plan'
    if cap_id.startswith('DER-'):
        deriving_rules = [r for r in DRULES if cap_id in r['derive']]
        triggers = [r['when_capability'] for r in deriving_rules]
        # Only a genuine single-trigger uniqueness if EVERY rule that can derive cap_id shares
        # the same when_capability == dep_id -- if a second rule derives cap_id from a different
        # trigger, cap_id can come into existence without dep_id via that rule, and the "own
        # derivation trigger" claim is false for that route (2026-09-06 critic counterexample:
        # DER-AI-AUTHORITY/DER-AI-TOOLS are each derived by both DERIVE-AI-WRITE, when_capability
        # CAP-AI-WRITE, *and* DERIVE-AI-EXT, when_capability CAP-AI-EXTERNAL -- dep_id CAP-AI-WRITE
        # being one of the two triggers does not mean it is guaranteed by the other).
        if triggers and all(t == dep_id for t in triggers):
            return f'{cap_id} can only ever be derived once {dep_id} is already active (its own derivation trigger)'
        # Sibling co-derivation is only a valid explanation if it holds no matter which rule
        # actually fires: EVERY rule that can derive cap_id must also co-derive, in that same
        # rule, some sibling capability that independently requires dep_id.
        if deriving_rules and all(
            any(sib != cap_id and dep_id in CAPMAP.get(sib, {}).get('requires', []) for sib in r['derive'])
            for r in deriving_rules
        ):
            # Per-rule, not "every rule shares sibling X": two different rules deriving cap_id can
            # each have their OWN covering sibling (2026-09-06 critic counterexample: rule A
            # derives [cap_id, S1], rule B derives [cap_id, S2] -- claiming "every rule co-derives
            # S1 and S2" would be false for both). State only what's actually guaranteed: for each
            # rule, AT LEAST ONE of its co-derived siblings requires dep_id.
            per_rule = [(r['id'], sorted(sib for sib in r['derive']
                                          if sib != cap_id and dep_id in CAPMAP.get(sib, {}).get('requires', [])))
                        for r in deriving_rules]
            detail = '; '.join(f'{rid} co-derives {"/".join(sibs)}' for rid, sibs in per_rule)
            return (f'every rule that can derive {cap_id} also co-derives, in that same rule, at '
                    f'least one sibling that independently requires {dep_id} ({detail})')
    # cap_id itself (not necessarily a DER-* capability) may TRIGGER a derivation rule whose
    # derived DER-* capabilities transitively require dep_id -- e.g. CAP-AI-EXTERNAL triggers
    # DERIVE-AI-EXT, which derives DER-AI-AUTHORITY, which requires CAP-AI-WRITE, which requires
    # CAP-AI: selecting CAP-AI-EXTERNAL always drags CAP-AI in through that chain regardless of
    # CAP-AI-EXTERNAL's own direct requires edge to CAP-AI.
    for r in DRULES:
        if r['when_capability'] == cap_id:
            for cid in r['derive']:
                if dep_id in closure_requires(cid, exclude_edge=(cap_id, dep_id)):
                    return f'{dep_id} is reachable via {r["id"]}\'s own derived {cid} -> ... -> {dep_id} chain'
    # KNOWN GAP (2026-09-06, second independent critic review, agency-os/TASKS.md System Foundry
    # "explain_redundant_edge() entry-path enumeration" item): this shape and the two DER-*
    # shapes above only enumerate ONE way cap_id can enter a plan -- a question rule directly
    # requiring it. They do not check whether a DIFFERENT capability's own `requires` closure, or
    # a derivation rule's `derive` list, can also pull cap_id in without forcing dep_id (real
    # counterexample: CAP-ROLES -> CAP-IDENTITY is empirically load-bearing because
    # CAP-B2B-BUYER-ROLES independently `requires: [CAP-B2B, CAP-ROLES]` through its own
    # active_when chain, which never forces CAP-IDENTITY -- yet every question rule that directly
    # selects CAP-ROLES happens to also force CAP-IDENTITY, so this function wrongly calls it
    # explained). A prior attempt at fixing this by also checking every OTHER capability's
    # `requires`-graph closure for dep_id, without ALSO checking that other capability's own
    # active_when-forced chain, broke 8 currently-correct redundant classifications into false
    # unexplained FAILs on the real catalog -- reverted rather than shipped, per this repo's own
    # rule against a rushed fix with a larger blast radius than the bug it fixes. The empirical
    # PASS/FAIL verdict this file exists to produce is NOT affected by this gap (that check
    # mutates the real edge and re-resolves, so CAP-ROLES->CAP-IDENTITY is correctly counted
    # load-bearing regardless) -- only this explanatory string can be wrong.
    driving = CAP_TO_DRIVING_QIDS.get(cap_id, [])
    if driving:
        for qid in driving:
            forced = forced_prereq_qids(qid)
            reached = any(
                dep_id in closure_requires(cid, exclude_edge=(cap_id, dep_id))
                for fq in forced
                for rule in QRULES if rule['when']['question'] == fq and rule['when'].get('equals') is True
                for cid in rule.get('require', [])
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
