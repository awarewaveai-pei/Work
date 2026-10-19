#!/usr/bin/env python3
# Asserts (never auto-fixes) hand-maintained catalog-derived numbers in prose docs against the
# real catalog. A human still writes these sentences; this script only turns "silently wrong"
# into a verify-chain FAIL -- it does not rewrite the docs. Four docs (README.md,
# QUALITY_STRENGTH_MATRIX.md, CHANGELOG_v1.6.md, V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md) have
# had their hand-typed question/capability/module/blueprint/pairwise counts go stale 4 times
# across this package's history (each new module/capability batch requires updating every
# occurrence, and someone always misses one -- see agency-os/WORKLOG.md 2026-09-05 "critic
# suggestion #4").
#
# Each check below is anchored to a specific, distinctive sentence fragment (not a bare
# global \d+ regex) so that numbers which are NOT catalog counts -- "1,000 randomized
# configurations" (a fixed test parameter, not derived from any catalog file), "SHA-256" (a
# hash algorithm name), and the CHANGELOG's "+43 capabilities, +43 questions" (a historical
# per-release delta, not a live running total) -- are never touched. The full four-doc grep
# that produced this exact anchor list is recorded in the WORKLOG entry for this change.
#
# `2^N` in the assurance report's Scope section IS a live catalog count (the question count,
# as a theoretical answer-vector exponent) and is checked below -- an earlier version of this
# comment wrongly called it "a different kind of 208" and exempted it, which let it drift
# silently through 208->209->212->214->218->222 across five releases before a 2026-09-06
# critic review caught both the drift and the wrong exemption in the same pass.
#
# Ground truth sources:
#   - question/capability/module/baseline-capability counts: computed directly from the
#     catalog JSON files via configurator_engine.load() (cheap, deterministic JSON reads).
#   - blueprint count: configurator_engine.EXPECTED_BLUEPRINT_COUNT, this package's own
#     already-established single source of truth for "the 73-section blueprint" guarantee
#     (see configurator_engine.py's own header comment -- 5 other files already import it
#     instead of re-hardcoding 73).
#   - per-module artifact count ("10 mandatory artifacts"): derived, not hardcoded --
#     MODULE_MANIFEST.json + cards/<module>.md = 2 (see
#     foundry_generate.py's own validate_generated(), which iterates that exact set).
#   - gate-script count in `make verify` ("N gate scripts"): parsed directly out of this
#     package's own Makefile `verify:` prerequisite line, so adding/removing a gate can never
#     leave that number silently stale in prose again (this exact drift is what shipped in
#     the first version of this script -- see WORKLOG).
#   - exhaustive pairwise valid/rejected counts: NOT re-derived here. That number only exists
#     as the output of actually running resolve() over every question pair (an O(n^2)
#     algorithm scripts/test_selection_matrix.py already implements and is exercised earlier
#     in `make verify`). Re-implementing that loop a second time here would risk the two
#     counters silently drifting apart from each other -- exactly the class of bug this
#     script exists to prevent one level up. Instead this script runs the real
#     test_selection_matrix.py once and parses its own printed
#     "SELECTION MATRIX: PASS ..." summary line, which is already this package's canonical
#     ground-truth statement for those two numbers (quoted verbatim in WORKLOG entries).
from pathlib import Path
import re, subprocess, sys
from configurator_engine import ROOT, load, EXPECTED_BLUEPRINT_COUNT

def verify_gate_script_lines():
    # Parsed straight from this package's own Makefile `verify:` prerequisite chain (not the
    # whole file -- a non-verify convenience target running a python script must never force
    # the "Release commands" doc block below to advertise a command outside the actual release
    # chain) so the prose can't go stale the way it just did (12 -> 13 gate scripts) the moment
    # a gate script is added or removed. Returns the list of `scripts/<name>.py` lines actually
    # invoked in verify order (one entry per invocation -- a target's recipe can, and one does,
    # run more than one script).
    mk = (ROOT / 'Makefile').read_text(encoding='utf-8')
    m = re.search(r'^verify:\s*(.+)$', mk, re.M)
    if not m:
        raise RuntimeError('Makefile has no verify: target; cannot derive gate-script count')
    lines = []
    for target in m.group(1).split():
        if target == 'test':
            continue  # counted separately as "unit tests", not a gate script
        recipe = re.search(rf'^{re.escape(target)}:[^\n]*\n((?:\t.*\n?)+)', mk, re.M)  # a target may list prerequisites
        if not recipe:
            raise RuntimeError(f'Makefile target {target!r} is a verify: prerequisite but has no recipe')
        lines += re.findall(r'^\tpython (scripts/\S+\.py)', recipe.group(1), re.M)
    return lines

def gate_script_count():
    return len(verify_gate_script_lines())

def unit_test_count():
    # Shells out to the exact command the `test` Makefile target runs (in-process
    # unittest.defaultTestLoader.discover() from this script's own cwd hits
    # "Start directory is not importable" -- discover()'s import machinery needs the
    # `-m unittest` CLI entry point's sys.path setup, not just a matching top_level_dir arg) and
    # parses its own "Ran N tests" summary line, so this can never drift from what that target
    # actually reports.
    r = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'],
                        cwd=str(ROOT), capture_output=True, text=True)
    m = re.search(r'^Ran (\d+) tests? in', r.stdout + r.stderr, re.M)
    if not m:
        raise RuntimeError('could not parse unit test count from `python -m unittest discover -s tests` output:\n' + r.stdout + r.stderr)
    return int(m.group(1))

def run_selection_matrix():
    script = ROOT / 'scripts' / 'test_selection_matrix.py'
    r = subprocess.run([sys.executable, str(script)], cwd=str(ROOT), capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError('scripts/test_selection_matrix.py did not PASS; cannot trust its counts as ground truth:\n' + r.stdout + r.stderr)
    m = re.search(
        r'SELECTION MATRIX: PASS questions=(\d+) single=(\d+) pairwise_valid=(\d+) pairwise_rejected=(\d+) '
        r'random=(\d+) modules=(\d+) blueprints=(\d+) all_yes_caps=(\d+)', r.stdout)
    if not m:
        raise RuntimeError('scripts/test_selection_matrix.py PASS output did not match the expected summary-line shape:\n' + r.stdout)
    return {
        'questions': int(m.group(1)), 'pairwise_valid': int(m.group(3)), 'pairwise_rejected': int(m.group(4)),
        'modules': int(m.group(6)), 'blueprints': int(m.group(7)), 'all_yes_caps': int(m.group(8)),
    }

def num(s):
    return int(s.replace(',', ''))

def main():
    sm = run_selection_matrix()
    q = len(load('questionnaires/catalog.json')['questions'])
    caps = len(load('capabilities/catalog.json')['capabilities'])
    mods = load('generation/module-manifests.json')['modules']
    modules_total = len(mods)
    # "standard" = every module reached by an ordinary ALL-YES run; a module is excluded only if
    # it declares itself on-demand/custom-triggered. Reading that flag (rather than hardcoding
    # "-1 for the one custom module") means a second custom-triggered module can't silently make
    # this wrong.
    standard_modules = len([m for m in mods if not m.get('activated_by_custom_requirements')])
    baseline_caps = len(load('baselines/production-baseline.json')['capabilities'])
    module_artifacts = 2  # MODULE_MANIFEST.json + cards/<module>.md, see foundry_generate.validate_generated()
    # v1.6 docs are shipped history (AGENTS.md section 9: old files are not rewritten); they describe the pre-V17-1 10-file package.
    V16_MODULE_ARTIFACTS = 10
    gate_scripts = gate_script_count()
    unit_tests = unit_test_count()
    pairwise_valid = sm['pairwise_valid']; pairwise_rejected = sm['pairwise_rejected']
    pairwise_total = pairwise_valid + pairwise_rejected
    blueprints = EXPECTED_BLUEPRINT_COUNT
    # cross-check the independently-computed catalog counts against test_selection_matrix.py's
    # own numbers -- if these ever disagree, something is wrong with THIS script's ground-truth
    # computation, not with the docs, and that must fail loudly rather than silently validate
    # docs against a wrong number.
    consistency = [
        ('questions', q, sm['questions']), ('capabilities', caps, sm['all_yes_caps']),
        ('modules', modules_total, sm['modules']), ('blueprints', blueprints, sm['blueprints']),
    ]
    errors = []
    for label, a, b in consistency:
        if a != b:
            errors.append(f'internal ground-truth mismatch for {label}: catalog says {a}, test_selection_matrix.py says {b}')

    # (file, anchor regex with capturing groups, expected values aligned to the groups, label)
    checks = [
        ('README.md', r'full (\d+)-section blueprint applicability', [blueprints], 'blueprint count'),
        ('README.md', r'complete (\d+)-artifact package per selected module', [module_artifacts], 'per-module artifact count'),
        ('README.md', r'Every selected module receives (\d+) mandatory artifacts', [module_artifacts], 'per-module artifact count'),
        ('README.md', r'(\d+)/(\d+) questionnaire questions have deterministic YES rules', [q, q], 'question count'),
        ('README.md', r'(\d+)/(\d+) standard capabilities are reachable in the ALL-YES configuration', [caps, caps], 'capability count'),
        # (\d+)(?:st|nd|rd|th), not a hardcoded literal "th": a bare "th" suffix is only correct
        # English for a total ending in 0/4-9/11-13 -- it silently demanded factually wrong prose
        # ("51th" instead of "51st") the moment inventory_ops pushed modules_total from 50 to 51,
        # caught while adding that module rather than by any prior review (every earlier release's
        # total -- 44, 45, ..., 50 -- happened to end in a digit where "th" is also correct
        # English, so this never surfaced before).
        ('README.md', r'(\d+) standard LEGO modules are produced by ALL-YES; a (\d+)(?:st|nd|rd|th) `custom`', [standard_modules, modules_total], 'module count'),
        ('README.md', r'All (\d+) questions are tested individually', [q], 'question count'),
        ('README.md', r'All ([\d,]+) question pairs are attempted', [pairwise_total], 'pairwise total'),
        ('README.md', r'Every project gets all (\d+) controlled blueprint sections', [blueprints], 'blueprint count'),

        ('QUALITY_STRENGTH_MATRIX.md', r'all (\d+) controlled sections emitted ACTIVE/N/A', [blueprints], 'blueprint count'),
        ('QUALITY_STRENGTH_MATRIX.md', r'ALL-NO, ALL-YES, (\d+) singles', [q], 'question count'),
        ('QUALITY_STRENGTH_MATRIX.md', r'(\d+) required artifacts/module', [V16_MODULE_ARTIFACTS], 'per-module artifact count (v1.6 historical)'),
        ('QUALITY_STRENGTH_MATRIX.md', r'`make verify`-equivalent \((\d+) gate scripts \+ (\d+) unit tests\)',
         [gate_scripts, unit_tests], 'gate script / unit test count'),

        ('CHANGELOG_v1.6.md', r'Full (\d+)-section generated System Blueprint', [blueprints], 'blueprint count'),
        ('CHANGELOG_v1.6.md', r'all (\d+) single-question cases', [q], 'question count'),
        ('CHANGELOG_v1.6.md', r'Complete (\d+)-artifact planning/assurance package', [V16_MODULE_ARTIFACTS], 'per-module artifact count (v1.6 historical)'),

        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'all `2\^(\d+)` theoretical answer vectors', [q], 'question count (as answer-vector exponent)'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'exactly (\d+) blueprint documents', [blueprints], 'blueprint count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'the (\d+) Foundry baseline capabilities', [baseline_caps], 'baseline capability count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'locks all (\d+) current capabilities', [caps], 'capability count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'locks all (\d+) standard selectable modules', [standard_modules], 'module count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'all (\d+) blueprint sections become ACTIVE', [blueprints], 'blueprint count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'independently activates every one of the (\d+) questions', [q], 'question count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'traverses every pair of (\d+) questions', [q], 'question count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md',
         r'Current release result: ([\d,]+) compatible pairs pass and (\d+) contradictory pairs fail closed, totaling all ([\d,]+) pairs',
         [pairwise_valid, pairwise_rejected, pairwise_total], 'pairwise valid/rejected/total'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'all (\d+) templates must be covered by the blueprint map', [blueprints], 'blueprint count'),
        ('V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md', r'all (\d+) questions must have exactly one question rule', [q], 'question count'),
    ]

    for relpath, pattern, expected, label in checks:
        path = ROOT / relpath
        text = path.read_text(encoding='utf-8')
        m = re.search(pattern, text)
        if not m:
            errors.append(f'{relpath}: anchor sentence not found (doc wording changed?): /{pattern}/')
            continue
        line = text.count('\n', 0, m.start()) + 1
        for i, exp in enumerate(expected, 1):
            found = num(m.group(i))
            if found != exp:
                errors.append(f'{relpath}:{line}: expected {exp} ({label}), found {found}')

    # Ordinal-suffix correctness for "a Nth `custom`" in README.md -- the generic checks loop
    # above only validates the numeric value against expected, never the English suffix word
    # attached to it, so `(?:st|nd|rd|th)` alone would let "51th" (wrong) pass silently just as
    # readily as "51st" (right) the moment modules_total's last digit changes. Derive the
    # grammatically correct suffix from the number itself (11-13 are always "th" regardless of
    # last digit; otherwise 1/2/3 -> st/nd/rd, else th) and require exactly that one.
    custom_ordinal_path = ROOT / 'README.md'
    custom_ordinal_text = custom_ordinal_path.read_text(encoding='utf-8')
    om = re.search(r'a (\d+)(st|nd|rd|th) `custom`', custom_ordinal_text)
    if not om:
        errors.append('README.md: ordinal "custom" module anchor sentence not found (doc wording changed?)')
    else:
        n = int(om.group(1))
        correct_suffix = 'th' if 11 <= (n % 100) <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
        if om.group(2) != correct_suffix:
            om_line = custom_ordinal_text.count('\n', 0, om.start()) + 1
            errors.append(f'README.md:{om_line}: expected ordinal suffix "{correct_suffix}" for {n} (module count), found "{om.group(2)}"')

    # Structural guard for the "Release commands" reproduction block in the assurance report:
    # every gate script actually invoked by `make verify` (scoped to the verify: prerequisite
    # chain via verify_gate_script_lines() -- NOT every python script anywhere in the Makefile,
    # so an unrelated convenience target, e.g. a future `lint:`, can never force this doc block
    # to advertise a command outside the real release chain) must appear as a literal
    # `python scripts/<name>.py` line there too, or a reader following that block runs an
    # incomplete chain (this is exactly how python scripts/validate_doc_numbers.py itself was
    # missing from that block until this fix -- see WORKLOG). Order isn't checked, only presence.
    repro_path = ROOT / 'V1_6_SELECTION_OUTPUT_ASSURANCE_REPORT.md'
    repro_text = repro_path.read_text(encoding='utf-8')
    block_m = re.search(r'## Release commands\s*```bash\n(.*?)```', repro_text, re.S)
    if not block_m:
        errors.append(f'{repro_path.name}: "## Release commands" bash block not found')
    else:
        repro_scripts = set(re.findall(r'python scripts/(\S+\.py)', block_m.group(1)))
        verify_scripts = {line[len('scripts/'):] for line in verify_gate_script_lines()}
        missing = sorted(verify_scripts - repro_scripts)
        if missing:
            errors.append(f'{repro_path.name}: Release commands block is missing gate script(s) '
                           f'that Makefile verify: actually runs: {", ".join(missing)}')

    if errors:
        print('DOC NUMBERS VALIDATION: FAIL')
        for e in errors: print('- ' + e)
        return 1
    print(f'DOC NUMBERS VALIDATION: PASS questions={q} capabilities={caps} modules={modules_total} '
          f'standard_modules={standard_modules} blueprints={blueprints} baseline_capabilities={baseline_caps} '
          f'module_artifacts={module_artifacts} gate_scripts={gate_scripts} unit_tests={unit_tests} '
          f'pairwise_valid={pairwise_valid} pairwise_rejected={pairwise_rejected} pairwise_total={pairwise_total}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
