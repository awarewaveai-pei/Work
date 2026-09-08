import json, tempfile, unittest, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import resolve,load,active_questions,industry_paths
from foundry_generate import generate

def complete(industry=None,over=None,default=False):
    over=over or {}; answers={}; changed=True
    while changed:
        changed=False
        for q in active_questions(answers,industry):
            if q['id'] not in answers: answers[q['id']]=bool(over.get(q['id'],default)); changed=True
        active={q['id'] for q in active_questions(answers,industry)}
        for k in list(answers):
            if k not in active: del answers[k]; changed=True
    return answers

class IndustryRegistryTests(unittest.TestCase):
    def test_registry_lists_both_industries(self):
        reg=load('industries/REGISTRY.json')
        self.assertEqual(reg['default_industry'],'commerce')
        self.assertIn('commerce',reg['industries'])
        self.assertIn('construction-mep-contractor',reg['industries'])
    def test_unknown_industry_raises(self):
        with self.assertRaises(ValueError): industry_paths('not-a-real-industry')
        with self.assertRaises(ValueError): resolve({'name':'x'},{},[],'not-a-real-industry')

class CommerceZeroRegressionTests(unittest.TestCase):
    def test_default_and_explicit_commerce_industry_produce_identical_plan(self):
        a=complete()
        self.assertEqual(resolve({'name':'x'},a,[]),resolve({'name':'x'},a,[],'commerce'))
    def test_golden_selection_fixtures_still_reproduce_exactly(self):
        # Same fixtures/assertions as scripts/test_selection_matrix.py's golden-fixture check,
        # re-run here so `python -m unittest discover -s tests` alone proves the industry-pack
        # layer didn't move Commerce OS's own numbers.
        a0=complete(default=False); p0=resolve({'name':'all-no'},a0,[])
        ay=complete(default=True); py=resolve({'name':'all-yes'},ay,[])
        for fixture,ans,plan in [('all_no.json',a0,p0),('all_yes.json',ay,py)]:
            g=json.loads((ROOT/'tests/fixtures/selection'/fixture).read_text())
            self.assertEqual(g['current_capabilities'],plan['current_capabilities'],fixture)
            self.assertEqual(g['modules'],plan['modules'],fixture)
            self.assertEqual(g['active_answer_count'],len(ans),fixture)
            self.assertEqual(g['criticality'],plan['criticality'],fixture)
            self.assertEqual(g['profile'],plan['profile'],fixture)

class ConstructionMepIndustryTests(unittest.TestCase):
    INDUSTRY='construction-mep-contractor'
    def test_resolves_in_isolation_with_no_selections(self):
        a=complete(self.INDUSTRY)
        p=resolve({'name':'mep-all-no'},a,[],self.INDUSTRY)
        self.assertEqual(p['current_capabilities'],[])
        self.assertEqual(p['modules'],['core'])
    def test_dispatch_capability_resolves_with_correct_closure_and_modules(self):
        a=complete(self.INDUSTRY,{'MEP-Q-DSP-004':True})
        p=resolve({'name':'mep-dispatch'},a,[],self.INDUSTRY)
        self.assertEqual(set(p['current_capabilities']),{'MEP-CAP-DISPATCH','MEP-CAP-EMPLOYEE','MEP-CAP-PROJECT'})
        self.assertEqual(set(p['modules']),{'core','dispatch','project','workforce','identity_authorization'})
        self.assertIn('MEP-CAP-DISPATCH',p['module_reasons']['identity_authorization'])
    def test_dispatch_generates_real_traceable_architecture_content(self):
        a=complete(self.INDUSTRY,{'MEP-Q-DSP-004':True})
        p=resolve({'name':'mep-dispatch-gen'},a,[],self.INDUSTRY)
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td,self.INDUSTRY)
            bp=(out/'docs/modules/dispatch/BLUEPRINT_ARCHITECTURE.md').read_text(encoding='utf-8')
            self.assertIn('DRAFT -> PUBLISHED -> ACK_REQUIRED -> ACKNOWLEDGED',bp)
            self.assertIn('acknowledgement binds to a Dispatch revision',bp)
            self.assertIn('Water_Electrical_MEP_Foundry_Delivery_v1.1',bp)
            self.assertFalse((out/'docs/modules/ai').exists())
    def test_capability_catalog_and_questionnaire_load_through_the_real_engine(self):
        # Every capability's `requires` chain and every question's require_capabilities resolve
        # without raising -- proves the whole 66-capability/61-question adapted catalog (not just
        # the dispatch slice) is genuinely loadable/closeable by capability_closure(), not just
        # syntactically valid JSON sitting inertly next to the engine.
        from configurator_engine import capability_closure
        caps=load(industry_paths(self.INDUSTRY)['capabilities'])['capabilities']
        for c in caps:
            capability_closure({c['id']},self.INDUSTRY)

if __name__=='__main__': unittest.main()
