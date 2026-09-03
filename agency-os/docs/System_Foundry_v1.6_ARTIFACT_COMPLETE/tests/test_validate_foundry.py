from pathlib import Path
import json, subprocess, sys, tempfile, hashlib, unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from semantic import *

class FoundryValidationTests(unittest.TestCase):
    def run_script(self,script):
        return subprocess.run([sys.executable,str(ROOT/'scripts'/script)],cwd=ROOT,capture_output=True,text=True)

    def test_validator_passes(self):
        r=self.run_script('validate_foundry.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_manifest_passes(self):
        r=self.run_script('validate_manifest.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_semantic_validation_passes(self):
        r=self.run_script('validate_semantics.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_adversarial_suite_passes(self):
        r=self.run_script('run_adversarial_contract_tests.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)


    def test_contract_fixtures_pass(self):
        r=self.run_script('validate_contract_fixtures.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_bootstrap_e2e_passes(self):
        r=self.run_script('test_bootstrap_e2e.py'); self.assertEqual(r.returncode,0,r.stdout+r.stderr)

    def test_all_json_schemas_parse(self):
        for p in (ROOT/'schemas').glob('*.json'):
            self.assertEqual(json.loads(p.read_text())['$schema'],'https://json-schema.org/draft/2020-12/schema')

    def test_risk_is_deterministic(self):
        keys=['data','privilege','blast_radius','reversibility','customer','regulatory','financial','criticality','novelty','uncertainty']
        dims={k:0 for k in keys}; dims['data']=4
        self.assertEqual(compute_risk_tier(dims),'R4')
        with self.assertRaises(SemanticError): validate_risk({'dimensions':dims,'computed_risk_tier':'R1'})

    def test_content_addressed_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); p=root/'a.txt'; p.write_text('a\nb\nc\n')
            raw=p.read_bytes(); selected='b\n'.encode()
            rec={'state':'VERIFIED','repository_revision':'abcdef0','observed_at':'2026-01-01T00:00:00Z','observed_by':'test','evidence':[{'path':'a.txt','start_line':2,'end_line':2,'blob_sha256':hashlib.sha256(raw).hexdigest(),'content_sha256':hashlib.sha256(selected).hexdigest(),'proves':'b'}]}
            self.assertTrue(validate_evidence(rec,root))

    def test_runtime_all_gate_refs_exist_and_dag(self):
        g=json.loads((ROOT/'runtime/stage-gates.yaml').read_text())['gates']; o=json.loads((ROOT/'runtime/orchestration.yaml').read_text())
        self.assertTrue(validate_dag(o['stages']))
        self.assertTrue(all(s.get('gate') in g for s in o['stages'] if s.get('gate')))

    def test_agent_inherits_entire_kernel_registry(self):
        kr=json.loads((ROOT/'registries/kernel.yaml').read_text()); roles=json.loads((ROOT/'runtime/agent-roles.yaml').read_text())
        self.assertEqual(roles['inheritance']['kernel_digest'],kr['kernel_digest'])
        self.assertEqual(len(kr['files']),len(list((ROOT/'kernel').glob('*.md'))))

    def test_machine_configs_current_version(self):
        for rel in ['policies/tool-boundaries.yaml','policies/release.yaml','policies/ai-execution.yaml','policies/freshness.yaml','bootstrap/SYSTEM_ARCHETYPES.yaml','bootstrap/NEW_SYSTEM_INTAKE.yaml','recipes/build-top-tier-commercial-system.yaml']:
            self.assertEqual(json.loads((ROOT/rel).read_text())['version'],'1.6.0',rel)

if __name__=='__main__': unittest.main()
