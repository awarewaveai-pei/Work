import json,re,tempfile,unittest,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import resolve,load,EXPECTED_BLUEPRINT_COUNT
from foundry_generate import generate,card_rel
import test_selection_matrix as matrix

class ArtifactGenerationTests(unittest.TestCase):
    def test_all_yes_materializes_complete_standard_modules_and_blueprint(self):
        a=matrix.complete({},True); p=resolve({'name':'all-yes-unit'},a,[])
        # Derived from the catalogs themselves rather than a hardcoded count: this is the exact
        # class of magic number EXPECTED_BLUEPRINT_COUNT (configurator_engine.py) was extracted to
        # stop re-hardcoding across files -- a 2026-09-05 critic review pointed out these two were
        # the last of that species left in the package (the reason this diff needed a manual
        # 199->200 bump here at all) and the real invariants are "all-yes activates every
        # capability" and "all-yes activates every module except the custom-requirement extension".
        self.assertEqual(len(p['current_capabilities']),len(load('capabilities/catalog.json')['capabilities']))
        self.assertEqual(len(p['modules']),len(load('generation/module-manifests.json')['modules'])-1)
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td)
            self.assertFalse((out/'docs/blueprint').exists())
            for mid in p['modules']:
                self.assertTrue((out/'docs/modules'/mid/'MODULE_MANIFEST.json').is_file(),mid)
                self.assertTrue((out/card_rel(mid)).is_file(),f'{mid} card')
            self.assertEqual(list(out.rglob('08_IMPLEMENTATION_BACKLOG.md')),[])
            cov=json.loads((out/'.foundry/verification/generation-coverage.json').read_text())
            self.assertEqual(cov['blueprints_active'],EXPECTED_BLUEPRINT_COUNT)
    def test_every_catalog_acceptance_entry_has_test_and_expect(self):
        for key,rec in load('industries/REGISTRY.json')['industries'].items():
            for c in load(rec['capabilities'])['capabilities']:
                if 'acceptance' not in c: continue
                self.assertTrue(c['acceptance'],f"{key}:{c['id']}")
                for e in c['acceptance']:
                    self.assertTrue(isinstance(e.get('test'),str) and e['test'].strip() and isinstance(e.get('expect'),str) and e['expect'].strip(),f"{key}:{c['id']}")
    def test_cards_list_acceptance_and_flag_missing_as_todo(self):
        a=matrix.complete({},True); p=resolve({'name':'card-unit'},a,[])
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td)
            cs=(out/'cards/customer_service.md').read_text(encoding='utf-8')
            self.assertNotIn('TODO',cs)
            self.assertGreaterEqual(len(re.findall(r'^- CAP-',cs,re.M)),11)
            self.assertGreaterEqual(len(re.findall(r'^  - 指令：.+ → 預期：.+',cs,re.M)),11)
            # TODO shows on a card exactly when one of its capabilities has no acceptance (data-independent: ai was the example until V17-7 filled it)
            caps={c['id']:c for c in load('capabilities/catalog.json')['capabilities']}
            for mid in p['modules']:
                gap=any(not caps[x].get('acceptance') for x in p['module_reasons'].get(mid,[]) if x in caps)
                self.assertEqual('TODO: no acceptance defined' in (out/card_rel(mid)).read_text(encoding='utf-8'),gap,mid)
    def test_supervisor_is_the_shared_kit_and_binds_to_the_plan(self):
        import shutil,subprocess
        from foundry_generate import SUPERVISOR_KIT
        a=matrix.complete({},True); p=resolve({'name':'supervisor-unit'},a,[])
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,[],td)
            for name in ('build.mjs','check.mjs'):
                self.assertEqual((out/'supervisor/kit'/name).read_bytes(),(SUPERVISOR_KIT/name).read_bytes(),name)
            if not shutil.which('node'): self.skipTest('node not installed')
            for script in ('supervisor/build.mjs','supervisor/check.mjs'):
                r=subprocess.run(['node',script],cwd=out,capture_output=True,text=True,encoding='utf-8')
                self.assertEqual(r.returncode,0,r.stderr)
    def test_plan_md_has_every_blueprint_row_and_parseable_registration(self):
        a=matrix.complete({},True); p=resolve({'name':'plan-unit'},a,[])
        with tempfile.TemporaryDirectory() as td:
            text=(generate(p,a,[],td)/'PLAN.md').read_text(encoding='utf-8')
        self.assertEqual(len(re.findall(r'^\| `\d\d_[^`]+\.md` \| (?:ACTIVE|NOT_APPLICABLE) \|',text,re.M)),EXPECTED_BLUEPRINT_COUNT)
        block=json.loads(re.search(r'^## 交付登記\s*\n+```json\n(.*?)^```',text,re.S|re.M).group(1))
        self.assertEqual(len(block['declarations']),10)
        self.assertEqual(block['modules'],p['modules'])
    def test_custom_requirement_materializes_review_module_without_guessing_capability(self):
        a=matrix.complete({},False); custom=[{'category':'custom','statement':'支援特殊工業設備協定'}]; p=resolve({'name':'custom-unit'},a,custom)
        self.assertIn('custom',p['modules'])
        self.assertEqual(p['module_reasons']['custom'],['REQ-CUSTOM-00001'])
        with tempfile.TemporaryDirectory() as td:
            out=generate(p,a,custom,td)
            m=json.loads((out/'docs/modules/custom/MODULE_MANIFEST.json').read_text())
            self.assertEqual(m['activated_capabilities'],[])
            self.assertEqual(m['custom_requirements'],['REQ-CUSTOM-00001'])
            self.assertTrue((out/'extensions/custom/README.md').is_file())
if __name__=='__main__':unittest.main()
