import json,tempfile,unittest,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from configurator_engine import resolve,load,EXPECTED_BLUEPRINT_COUNT
from foundry_generate import generate,MODULE_DOCS
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
            self.assertEqual(len(list((out/'docs/blueprint').glob('[0-9][0-9]_*.md'))),EXPECTED_BLUEPRINT_COUNT)
            for mid in p['modules']:
                for role in MODULE_DOCS+['MODULE_MANIFEST.json']:
                    self.assertTrue((out/'docs/modules'/mid/role).is_file(),f'{mid}/{role}')
            cov=json.loads((out/'.foundry/verification/generation-coverage.json').read_text())
            self.assertEqual(cov['blueprints_active'],EXPECTED_BLUEPRINT_COUNT)
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
