import json, tempfile, unittest, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import load,resolve,active_questions,questionnaire_digest
from foundry_generate import generate
class ConfiguratorTests(unittest.TestCase):
    def complete(self,over=None):
        over=over or {}; answers={}; changed=True
        # fixed point: answer every currently active unanswered question NO, applying overrides whenever active
        while changed:
            changed=False
            for q in active_questions(answers):
                if q['id'] not in answers:
                    answers[q['id']]=bool(over.get(q['id'],False));changed=True
            for k,v in over.items():
                # only set override when question is active in current state
                q={x['id']:x for x in load('questionnaires/catalog.json')['questions']}[k]
                from configurator_engine import eval_condition
                if eval_condition(q.get('active_when'),answers) and answers.get(k)!=v: answers[k]=v;changed=True
            # remove inactive answers (UI behavior)
            active={q['id'] for q in active_questions(answers)}
            for k in list(answers):
                if k not in active: del answers[k];changed=True
        return answers
    def test_catalog_is_binary(self):
        self.assertTrue(all(q['answer_type']=='boolean' for q in load('questionnaires/catalog.json')['questions']))
    def test_baseline_locked(self):
        self.assertTrue(all(x['disableable'] is False for x in load('baselines/production-baseline.json')['capabilities']))
    def test_multi_company_derives_tenant_safety(self):
        a=self.complete({'Q-ID-001':True,'Q-ORG-001':True});p=resolve({'name':'x'},a,[])
        for x in ['DER-TENANT-ISOLATION','DER-TENANT-AUTHZ','DER-TENANT-AUDIT','DER-TENANT-RECOVERY','DER-TENANT-OBS']:self.assertIn(x,p['derived'])
    def test_no_multi_company_no_tenant_module(self):
        p=resolve({'name':'x'},self.complete(),[]);self.assertNotIn('tenant',p['modules'])
    def test_ai_write_derives_authority(self):
        a=self.complete({'Q-AI-007':True});p=resolve({'name':'x'},a,[])
        for x in ['DER-AI-AUTHORITY','DER-AI-TOOLS','DER-AI-AUDIT','DER-AI-IDEMPOTENCY','DER-AI-HUMAN','DER-PROMPT-SECURITY']:self.assertIn(x,p['derived'])
    def test_future_mobile_deferred_not_generated(self):
        a=self.complete({'Q-CH-002':False,'Q-FUT-001':True});p=resolve({'name':'x'},a,[]);self.assertIn('CAP-MOBILE',p['deferred']);self.assertNotIn('mobile',p['modules'])
    def test_custom_requirement_preserved(self):
        p=resolve({'name':'x'},self.complete(),[{'category':'workflow','statement':'結案需要客戶與主管共同確認'}]);self.assertEqual(p['custom_requirements'][0]['source'],'USER_CUSTOM')
    def test_deterministic_plan(self):
        a=self.complete({'Q-CH-001':True,'Q-ID-001':True});self.assertEqual(resolve({'name':'x'},a,[]),resolve({'name':'x'},dict(reversed(list(a.items()))),[]))
    def test_inactive_yes_rejected(self):
        a=self.complete();a['Q-PAY-002']=True
        with self.assertRaises(ValueError):resolve({'name':'x'},a,[])
    def test_generation_selected_and_absent_modules(self):
        a=self.complete({'Q-CH-001':True,'Q-ID-001':True,'Q-ORG-001':True,'Q-AI-001':False});p=resolve({'name':'demo'},a,[])
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td);self.assertTrue((out/'apps/web').is_dir());self.assertTrue((out/'packages/tenant').is_dir());self.assertFalse((out/'packages/ai').exists());
            prof=json.loads((out/'.foundry/project-profile.json').read_text());self.assertEqual(prof['project_id'],'demo')
    def test_generation_refuses_overwrite(self):
        a=self.complete();p=resolve({'name':'demo'},a,[])
        with tempfile.TemporaryDirectory() as td:
            generate(p,a,[],td)
            with self.assertRaises(FileExistsError):generate(p,a,[],td)
    def test_questionnaire_digest_stable(self):self.assertEqual(len(questionnaire_digest()),64)
    def test_identity_does_not_unjustifiably_enable_offline(self):
        a=self.complete({'Q-ID-001':True});p=resolve({'name':'x'},a,[])
        self.assertNotIn('offline',p['modules'])
        self.assertNotIn('CAP-OFFLINE',p['derived'])
    def test_plan_and_generated_profile_validate_schemas(self):
        from schema_runtime import validate
        a=self.complete({'Q-CH-001':True,'Q-ID-001':True});p=resolve({'name':'schema-demo'},a,[])
        ps=json.loads((ROOT/'schemas/foundry-plan.schema.json').read_text());validate(p,ps)
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td);prof=json.loads((out/'.foundry/project-profile.json').read_text());schema=json.loads((ROOT/'schemas/project-profile.schema.json').read_text());validate(prof,schema)
    def test_current_capability_cannot_remain_deferred(self):
        a=self.complete({'Q-CH-002':False,'Q-FUT-001':True,'Q-MOB-001':True})
        # If another active requirement requires mobile/offline dependencies, current closure must dominate deferred.
        try:
            p=resolve({'name':'x'},a,[])
        except ValueError:
            return
        self.assertFalse(set(p['deferred']) & set(p['current_capabilities']))

if __name__=='__main__':unittest.main()
