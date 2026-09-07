#!/usr/bin/env python3
"""Regression guard for agency-os/TASKS.md System Foundry section D items 1 and 2.

Item 1 (opened 2026-09-05): 6 questions (Q-LOY-004, Q-RET-001, Q-SUBC-001, Q-SUBC-002,
Q-SUBC-003, Q-XB-003) reached CAP-PAYMENTS through their own `requires` closure even when
Q-PAY-001 ("online payments") was answered False -- the generated blueprint would configure a
payments module for a business that explicitly said it does not accept online payment. Item 2
(opened 2026-09-06): 7 capabilities that each assert control over what a customer actually pays
(CAP-PROMOTIONS, CAP-CHANNEL-PRICING, CAP-B2B-PRICING, CAP-REPRICING, CAP-LANDED-COST, CAP-RFQ,
CAP-PROMO-RULES) carried no gate at all on Q-COM-001 ("charges customers"). Both are the same
underlying defect class -- a capability/question reaches a payment- or commercial-implying node
without the driving question(s) being gated tightly enough to match -- discovered by the exact
same manual method every round in that TASKS.md section used (minimal-activate one question at a
time, resolve(), check whether the payment/commercial capability shows up anyway): this script
mechanizes that method as a permanent regression gate instead of relying on a critic re-running
it by hand every round.

Two independent detection mechanisms, because the two items are structurally different:

  A) STRUCTURAL SWEEP (covers item 1 in full, and any item-2 instance that happens to also reach
     CAP-COMMERCIAL through a `requires` chain, e.g. CAP-LANDED-COST -> CAP-TAX -> CAP-COMMERCIAL):
     for every question in the catalog, build the minimal answer set that activates it (itself
     True plus every question its own active_when chain transitively forces True), resolve() for
     real, and check whether CAP-PAYMENTS is present while Q-PAY-001 isn't True, or CAP-COMMERCIAL
     is present while Q-COM-001 isn't True. This needs no tagging or keyword list -- it is a
     direct, general property of the real resolver, so it automatically covers any future
     capability with the same structural shape.

  B) DESCRIPTION-KEYWORD SWEEP (covers the item-2 shape that mechanism A structurally cannot: a
     capability that affects what a customer pays by its own stated business purpose, but has no
     `requires` edge to CAP-COMMERCIAL/CAP-PAYMENTS at all -- e.g. CAP-PROMOTIONS only requires
     CAP-ORDERS/CAP-PRODUCTS, so there is no graph edge for mechanism A to walk). A capability
     whose description matches a price-control-assertion pattern must either (i) carry an
     explicit disclaimer sentence denying that it controls what the customer pays -- the
     convention this catalog already established for CAP-SHIPPING-RATES, CAP-BOM,
     CAP-MERCHANDISING, CAP-PRODUCT-FEED, and CAP-MARKETPLACE-SYNC -- or (ii) have every one of
     its driving questions transitively forced-gated behind Q-COM-001, verified both by a static
     active_when-chain walk AND a real resolve()/validate_answers() round-trip proving the
     specific rejection. Anything matching neither is a hard FAIL naming the capability, unless it
     is on the small, justified ALLOWLIST below.

Both mechanisms report their allowlisted/explained exceptions in the PASS output rather than
staying silent about them, mirroring test_mutation_coverage.py's own
"detect mechanically, allowlist known-accepted cases with reasons, hard-fail anything new and
unexplained" convention -- the goal is the same: a genuinely-accepted exception should be visible
and re-auditable every run, not silently tolerated forever nor a surprise FAIL for a reviewer who
didn't already know the history.
"""
from pathlib import Path
import sys, re
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import configurator_engine as ce

QCAT = ce.load('questionnaires/catalog.json')
QMAP = {q['id']: q for q in QCAT['questions']}
QRULES = ce.load('rules/question-rules.json')['rules']
CAPS = ce.load('capabilities/catalog.json')['capabilities']

CAP_TO_DRIVING_QIDS = {}
for _r in QRULES:
    for _cid in _r.get('require', []) + _r.get('defer', []):
        CAP_TO_DRIVING_QIDS.setdefault(_cid, []).append(_r['when']['question'])

# ---- shared: questions whose activeness this script cannot safely minimally-activate ----------
# A question gated behind an {any:[...]} branch (12 today, see TASKS.md item 6) can be made active
# by satisfying just ONE branch, but which branch is "the" minimal one is ambiguous -- forced
# prerequisites can only be computed for a single deterministic branch, not an OR. Rather than
# guess (and risk under- or over-reporting a forced prerequisite), any question whose active_when
# chain hits an 'any' node ANYWHERE -- its own top level, or transitively through a prerequisite's
# own active_when (2026-09-06 correction: checking only the top level missed Q-MOB-002, whose own
# active_when is a plain {question:Q-MOB-001}, but Q-MOB-001 itself is {any:[...]} -- forcing
# Q-MOB-001 True without satisfying one of its own any-branches made it read back as "inactive",
# a real false-classification this widened check now prevents) -- is skipped by both mechanisms
# below and reported by name, never silently treated as passing. (Mirrors test_mutation_coverage.py's
# own 'any' blind spot for forced_prereq_qids(), fixed there 2026-09-06 for the same reason.)
def _chain_hits_any(qid, seen=None):
    seen = seen if seen is not None else set()
    if qid in seen: return False
    seen.add(qid)
    def walk(c):
        if not c: return False
        if 'any' in c: return True
        if 'question' in c:
            if c.get('equals') is not True: return False
            return _chain_hits_any(c['question'], seen)
        if 'all' in c: return any(walk(x) for x in c['all'])
        return False
    return walk(QMAP[qid].get('active_when'))

ANY_GATED = {q['id'] for q in QCAT['questions'] if _chain_hits_any(q['id'])}

def forced_prereq_qids(qid, acc=None):
    """Questions transitively forced True by qid's own active_when chain ('question' and 'all'
    nodes only -- see ANY_GATED above for why 'any' is deliberately not walked). Never called on a
    qid already in ANY_GATED (that chain isn't safely computable this way -- see above)."""
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

CRULES = ce.load('rules/conflict-rules.json')['rules']

def _repair_one_conflict(answers, protect):
    """If a conflict rule currently fires against `answers`, flip exactly one of its
    `equals: False` trigger conditions to True -- as long as that question isn't in `protect`
    (the qid under test or one of its own forced prerequisites, which must stay exactly as set).
    Mutates `answers` in place. Returns True on progress, False if no firing rule is repairable
    this way (a genuine, unrepairable business-rule conflict for this qid)."""
    for r in CRULES:
        if not all(ce.eval_condition(c, answers) for c in r['if_all']):
            continue
        for c in r['if_all']:
            q = c.get('question')
            if q and c.get('equals') is False and q not in protect and answers.get(q) is not True:
                answers[q] = True
                return True
    return False

# ================================================================================================
# Mechanism A: structural minimal-activation sweep (real resolve() calls)
# ================================================================================================
# (question_id, target_capability): reason -- a genuinely-intentional, reviewed exception where a
# question is allowed to reach CAP-PAYMENTS/CAP-COMMERCIAL without itself being gated on
# Q-PAY-001/Q-COM-001. Empty today: every real offender found by this sweep across the whole
# catalog (13 total, see TASKS.md System Foundry items 1 and 2) was fixed at its actual gate
# rather than accepted as a coupling, so there is nothing to allowlist yet -- this exists so a
# future genuinely-intentional case doesn't have to be silently tolerated forever, but also can't
# recur by accident without a reviewer explicitly adding a reasoned entry here.
CLASS1_ALLOWLIST = {}
CLASS2_STRUCTURAL_ALLOWLIST = {}

def minimal_activation(qid):
    """The answers dict this script uses to minimally activate qid: itself True, every forced
    prerequisite True, every other question that becomes active as a result answered False, and
    any resulting conflict-rule collision repaired by flipping an unrelated question (never qid
    or one of its own forced prerequisites -- see _repair_one_conflict). Returns
    (answers, validate_errors) -- callers must check validate_errors before trusting the answers:
    a real, unrepairable business-rule conflict for this qid surfaces here rather than silently
    producing a bogus resolve() call."""
    protect = forced_prereq_qids(qid) | {qid}
    answers = {p: True for p in protect if p != qid}
    answers[qid] = True
    for _ in range(30):
        errs = ce.validate_answers(answers)
        unanswered = sorted({e.split(':')[0] for e in errs if 'active question unanswered' in e})
        if unanswered:
            for u in unanswered:
                answers[u] = False
            continue
        if not errs:
            return answers, errs
        if _repair_one_conflict(answers, protect):
            continue
        return answers, errs
    return answers, ce.validate_answers(answers)

def scan_structural():
    class1, class2, skipped_any, skipped_error = [], [], [], []
    allowed1, allowed2 = [], []
    for q in QCAT['questions']:
        qid = q['id']
        if qid in ANY_GATED:
            skipped_any.append(qid); continue
        answers, errs = minimal_activation(qid)
        if errs:
            # A real, unrepairable conflict-rule collision (not an any-gate blind spot -- those
            # were already filtered above) -- report separately, never lump the two together
            # (2026-09-06 correction: doing so mislabeled a real ungated-question class of finding
            # under the "known any-gate blind spot" header, which a reviewer would skip past).
            skipped_error.append((qid, errs)); continue
        plan = ce.resolve({'name': 'gatecheck-' + qid.lower()}, answers)
        caps = set(plan['current_capabilities'])
        if 'CAP-PAYMENTS' in caps and not answers.get('Q-PAY-001', False):
            if (qid, 'CAP-PAYMENTS') in CLASS1_ALLOWLIST:
                allowed1.append((qid, CLASS1_ALLOWLIST[(qid, 'CAP-PAYMENTS')]))
            else:
                class1.append((qid, sorted(forced_prereq_qids(qid))))
        if 'CAP-COMMERCIAL' in caps and not answers.get('Q-COM-001', False):
            # CAP-PAYMENTS requires CAP-COMMERCIAL (capabilities/catalog.json), so a qid already
            # allowlisted for reaching CAP-PAYMENTS unconditionally also reaches CAP-COMMERCIAL --
            # that is not a second, independent violation to report (2026-09-06 correction: without
            # this, adding a CLASS1_ALLOWLIST entry alone never actually silences the run, because
            # the same qid still trips the CLASS2 structural check on its own).
            if (qid, 'CAP-COMMERCIAL') in CLASS2_STRUCTURAL_ALLOWLIST:
                allowed2.append((qid, CLASS2_STRUCTURAL_ALLOWLIST[(qid, 'CAP-COMMERCIAL')]))
            elif (qid, 'CAP-PAYMENTS') in CLASS1_ALLOWLIST:
                allowed2.append((qid, CLASS1_ALLOWLIST[(qid, 'CAP-PAYMENTS')] + ' (implied via CAP-PAYMENTS requires CAP-COMMERCIAL)'))
            else:
                class2.append((qid, sorted(forced_prereq_qids(qid))))
    return class1, class2, skipped_any, skipped_error, allowed1, allowed2

# ================================================================================================
# Mechanism B: description-keyword sweep for capabilities with no structural edge to check
# ================================================================================================
# General, mechanically-checked SHAPES (not a hand-maintained list of specific capability ids), so
# a future capability of the same shape is covered automatically -- same design principle as
# test_mutation_coverage.py's explain_redundant_edge().
#
# PRICE_ASSERTION_RE: catches a capability description that talks about price/pricing/a discount/
# a markdown/duties/landed cost/a quote/an amount owed -- the vocabulary every one of item 2's 7
# named offenders, plus CAP-MARKETPLACE-SYNC (found by this exact sweep during this task, not one
# of the originally-named 7 -- see agency-os/TASKS.md), actually uses.
# Widened 2026-09-06 (independent critic review): the original list was fitted to the vocabulary
# the 7 originally-named offenders happened to use and missed live candidates using synonyms
# (e.g. "outstanding receivable"/"who have not paid", "payout amounts...minus fees") -- caught by
# injection-testing phrases like "what the customer is charged"/"fee"/"invoice total"/"MSRP" that
# should FAIL and didn't. `repric\w*` is separate from `pric\w*` because \b requires a true word
# boundary: "repricing" has no boundary right before "pric", so \b(pric\w*)\b alone never matches it.
PRICE_ASSERTION_RE = re.compile(
    r'\b(pric\w*|repric\w*|discount|markdown|duties|landed cost|quote|amount owed|owed|'
    r'charg\w*|fee|surcharge|billing|invoice|tariff|receivable|revenue|msrp|payout)\b', re.IGNORECASE)
# DISCLAIMER_RE: catches the negated-price-control sentence this catalog already uses as its
# established "I match the keyword pattern above but I do NOT control what the customer pays"
# marker (CAP-SHIPPING-RATES/CAP-BOM/CAP-MERCHANDISING/CAP-PRODUCT-FEED/CAP-MARKETPLACE-SYNC all
# phrase it as some form of "never/does not/is not ... what the customer pays/is charged").
DISCLAIMER_RE = re.compile(r"(never|does not|is not|isn't|not itself).{0,60}(customer.{0,20}pay|customer is charged|what the customer pays|customer.{0,20}charged)", re.IGNORECASE)
# A description that merely NAMES another capability whose id happens to embed one of the words
# above (e.g. "...the same reasoning CAP-CHARGEBACK already uses...") is not itself asserting
# price control -- strip CAP-*/DER-* id tokens before matching so citing a sibling capability by
# id never trips this sweep (2026-09-06: CAP-RECALL's citation of CAP-CHARGEBACK was a false
# positive of exactly this shape; general fix, not a one-off allowlist entry).
CAP_ID_RE = re.compile(r'\b(?:CAP|DER)-[A-Z0-9-]+\b')

# cap_id: reason -- a capability that matches PRICE_ASSERTION_RE, carries no DISCLAIMER_RE
# sentence, AND is not (yet) gated on Q-COM-001, but has been reviewed and deliberately accepted
# anyway. Empty today for the same reason CLASS1_ALLOWLIST/CLASS2_STRUCTURAL_ALLOWLIST are empty:
# every real offender this sweep found (8, across TASKS.md items 1 and 2 combined) was fixed at
# its actual gate.
CLASS2_KEYWORD_ALLOWLIST = {}

def scan_keyword():
    flagged, disclaimed, gated, skipped, allowed = [], [], [], [], []
    for c in CAPS:
        cid = c['id']; desc = c.get('description', '')
        desc_scan = CAP_ID_RE.sub(' ', desc)  # see CAP_ID_RE above
        if not PRICE_ASSERTION_RE.search(desc_scan):
            continue
        if DISCLAIMER_RE.search(desc):
            disclaimed.append(cid); continue
        driving = CAP_TO_DRIVING_QIDS.get(cid, [])
        if not driving:
            # Not directly user-selectable (only reachable via another capability's `requires`
            # closure) -- mechanism A's structural sweep is the correct tool for that shape, not
            # this one; nothing to check here.
            continue
        if any(qid in ANY_GATED for qid in driving):
            skipped.append(cid); continue
        is_gated = all(qid == 'Q-COM-001' or 'Q-COM-001' in forced_prereq_qids(qid) for qid in driving)
        if is_gated:
            gated.append(cid); continue
        # Real resolver round-trip proof, not just the static active_when-chain walk above: try
        # EVERY driving question, not just the first (2026-09-06 correction: a capability with
        # >1 driving question and only ONE of them gated was wrongly cleared using that one gated
        # driver's proof alone -- the ungated sibling driver, which can independently activate the
        # same capability with Q-COM-001=False, was never checked. 8 capabilities in this catalog
        # already have >1 driving question, so this was a live false-negative risk, not
        # hypothetical). Build the minimal activation for each candidate driver, force Q-COM-001
        # explicitly False, and confirm validate_answers() raises no error and the capability is
        # genuinely present -- i.e. a real, reachable configuration, not a false read of the graph.
        violated = False
        for qid in driving:
            answers, errs = minimal_activation(qid)
            answers['Q-COM-001'] = False
            proof_errs = ce.validate_answers(answers)
            if proof_errs:
                continue
            plan = ce.resolve({'name': 'gatecheck-kw-' + cid.lower()}, answers)
            if cid in plan['current_capabilities']:
                violated = True
                break
        if not violated:
            gated.append(cid); continue
        if cid in CLASS2_KEYWORD_ALLOWLIST:
            allowed.append((cid, CLASS2_KEYWORD_ALLOWLIST[cid]))
        else:
            flagged.append(cid)
    return flagged, disclaimed, gated, skipped, allowed

def main():
    class1, class2_structural, skipped_any, skipped_error, allowed1, allowed2 = scan_structural()
    flagged_keyword, disclaimed, gated_keyword, skipped_keyword, allowed_keyword = scan_keyword()

    # Allowlist rot (2026-09-06 critic correction): an entry keyed on a question/capability id
    # that no longer matches ANY real violation this run (renamed, deleted, or the gate that
    # justified it changed) is invisible today -- it silently does nothing, which is exactly the
    # "system claims something true that isn't" failure class this whole checker exists to catch
    # in the catalog it's checking. Diff every allowlist's keys against what was actually matched.
    matched1 = {qid for qid, _ in allowed1}
    matched2 = {qid for qid, _ in allowed2}
    matched_kw = {cid for cid, _ in allowed_keyword}
    stale1 = [k for k in CLASS1_ALLOWLIST if k[0] not in matched1]
    stale2 = [k for k in CLASS2_STRUCTURAL_ALLOWLIST if k[0] not in matched2]
    stale_kw = [k for k in CLASS2_KEYWORD_ALLOWLIST if k not in matched_kw]

    if class1 or class2_structural or flagged_keyword or stale1 or stale2 or stale_kw:
        print('PAYMENT/COMMERCIAL GATING: FAIL')
        for qid, prereqs in class1:
            print(f'  {qid} reaches CAP-PAYMENTS while Q-PAY-001 is not forced True (forced prereqs: {prereqs})')
        for qid, prereqs in class2_structural:
            print(f'  {qid} reaches CAP-COMMERCIAL while Q-COM-001 is not forced True (forced prereqs: {prereqs})')
        for cid in flagged_keyword:
            print(f'  {cid} asserts price control (description matches price-assertion pattern, no disclaimer) '
                  f'and is reachable with Q-COM-001=False')
        for k in stale1: print(f'  stale CLASS1_ALLOWLIST entry (no longer matches any real violation): {k}')
        for k in stale2: print(f'  stale CLASS2_STRUCTURAL_ALLOWLIST entry (no longer matches any real violation): {k}')
        for k in stale_kw: print(f'  stale CLASS2_KEYWORD_ALLOWLIST entry (no longer matches any real violation): {k}')
        return 1

    print(f'PAYMENT/COMMERCIAL GATING: PASS structural_class1=0 structural_class2=0 '
          f'keyword_flagged=0 keyword_disclaimed={len(disclaimed)} keyword_gated={len(gated_keyword)} '
          f'allowlisted={len(allowed1) + len(allowed2) + len(allowed_keyword)}')
    if allowed1 or allowed2 or allowed_keyword:
        print('  ALLOWLISTED exceptions (genuine violations by this script\'s own detection, kept out of FAIL by an explicit, reasoned entry):')
        for qid, reason in allowed1:
            print(f'    {qid} -> CAP-PAYMENTS: {reason}')
        for qid, reason in allowed2:
            print(f'    {qid} -> CAP-COMMERCIAL: {reason}')
        for cid, reason in allowed_keyword:
            print(f'    {cid}: {reason}')
    if disclaimed:
        print('  price-keyword capabilities excluded via an explicit disclaimer sentence (does not control what the customer pays):')
        for cid in sorted(disclaimed):
            print(f'    {cid}')
    if skipped_any:
        print('  questions skipped by the structural sweep (any-gated -- own or a transitively-forced prerequisite\'s active_when chain hits an {any:[...]} node; TASKS.md item 6 blind spot, not silently passed):')
        for qid in sorted(skipped_any):
            print(f'    {qid}')
    if skipped_error:
        print('  questions skipped by the structural sweep (minimal activation hit a real, unrepairable conflict-rule collision -- NOT the any-gate blind spot above; investigate if this list is non-empty):')
        for qid, errs in sorted(skipped_error):
            print(f'    {qid}: {errs}')
    if skipped_keyword:
        print('  price-keyword capabilities skipped (driving question any-gated, same blind spot as above):')
        for cid in sorted(skipped_keyword):
            print(f'    {cid}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
