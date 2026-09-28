"""scripts/affected_tests.py (plan §12.1 rule 11) never under-selects silently: each case below is an import or data
path Python / a loader really follows, built in a throwaway tree, that the first version missed (2026-09-28: eval/
sys.path importers, package __init__, import cycles, glob-loaded case data)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import affected_tests  # noqa: E402

COS_REL = "P/cos"
SPEC_REL = "agency-os/docs/AI_LEGO_Cognitive_Engineering_OS"


class AffectedTestsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self.cos = self.repo / COS_REL
        self._write("ai_lego/__init__.py", "")
        self._write("ai_lego/pkg/__init__.py", "")
        self._write("ai_lego/pkg/leaf.py", "X = 1\n")
        self._write("tests/__init__.py", "")
        self._write("tests/unit/__init__.py", "")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write(self, rel: str, text: str, root: Path | None = None) -> None:
        path = (root or self.cos) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def _select(self, *changed: str) -> tuple[list[str], list[str]]:
        tests, _, unreferenced = affected_tests.affected_test_modules(list(changed), cos=self.cos, repo=self.repo)
        return tests, unreferenced

    def test_a_bare_import_through_an_inserted_sys_path_entry_is_followed(self) -> None:
        self._write("eval/score.py", "Y = 2\n")
        self._write("eval/run.py", "import score\n")
        self._write("tests/unit/test_direct.py", 'import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))\nimport run\n')
        self._write("tests/unit/test_named.py", 'import sys\nfrom pathlib import Path\nCOS_ROOT = Path(__file__).resolve().parents[2]\nEVAL_DIR = COS_ROOT / "eval"\nsys.path.insert(0, str(EVAL_DIR))\nfrom run import *\n')
        self._write("tests/unit/test_other.py", "import ai_lego.pkg.leaf\n")
        # sys.path is process-wide: a module that only imports `run` (another test inserted eval/) depends on it too
        self._write("tests/unit/test_relies.py", "import run\n")
        tests, _ = self._select(f"{COS_REL}/eval/score.py")
        self.assertEqual(tests, ["tests.unit.test_direct", "tests.unit.test_named", "tests.unit.test_relies"])

    def test_every_form_of_sys_path_write_is_evaluated_or_depends_on_everything(self) -> None:
        eval_dir = 'str(Path(__file__).resolve().parents[2] / "eval")'
        self._write("eval/run.py", "")
        known = {
            "test_aug": f"import sys\nfrom pathlib import Path\nsys.path += [{eval_dir}]\nimport run\n",
            "test_extend": f"import sys\nfrom pathlib import Path\nsys.path.extend([{eval_dir}])\nimport run\n",
        }
        unknown = {
            "test_method": 'import sys\nsys.path.remove("x")\n',
            "test_slice": f"import sys\nfrom pathlib import Path\nsys.path[:0] = [{eval_dir}]\n",
            "test_from": "from sys import path\n",
            "test_site": "import site\nsite.addsitedir('/x')\n",
        }
        for name, text in {**known, **unknown, "test_read": 'import sys\nif "x" not in sys.path:\n    pass\n'}.items():
            self._write(f"tests/unit/{name}.py", text)
        self.assertEqual(self._select(f"{COS_REL}/eval/run.py")[0], sorted(f"tests.unit.{n}" for n in {**known, **unknown}))
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/pkg/leaf.py")[0], sorted(f"tests.unit.{n}" for n in unknown))
        # sys under another name: an unknown write through the alias is still unknown
        self._write("tests/unit/test_alias.py", 'import sys as s\ns.path[:0] = ["/elsewhere"]\n')
        self.assertIn("tests.unit.test_alias", self._select(f"{COS_REL}/ai_lego/pkg/leaf.py")[0])

    def test_a_package_init_change_selects_every_importer_of_its_submodules(self) -> None:
        self._write("tests/unit/test_leaf.py", "from ai_lego.pkg.leaf import X\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/pkg/__init__.py")[0], ["tests.unit.test_leaf"])
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/__init__.py")[0], ["tests.unit.test_leaf"])

    def test_an_import_cycle_does_not_hide_a_dependency(self) -> None:
        self._write("ai_lego/a.py", "import ai_lego.b\nimport ai_lego.c\n")
        self._write("ai_lego/b.py", "import ai_lego.a\n")
        self._write("ai_lego/c.py", "")
        self._write("tests/unit/test_t.py", "import ai_lego.a\n")
        self._write("tests/unit/test_u.py", "import ai_lego.b\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/c.py")[0], ["tests.unit.test_t", "tests.unit.test_u"])

    def test_a_relative_import_is_resolved_from_its_package(self) -> None:
        self._write("ai_lego/pkg/user.py", "from .leaf import X\n")
        self._write("tests/unit/test_user.py", "import ai_lego.pkg.user\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/pkg/leaf.py")[0], ["tests.unit.test_user"])
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/pkg/__init__.py")[0], ["tests.unit.test_user"])

    def test_a_glob_loaded_data_file_selects_the_loader_through_its_directory(self) -> None:
        self._write("eval/score.py", 'def load(case_dir):\n    return sorted((case_dir / "sources").glob("*.txt"))\n')
        self._write("tests/unit/test_score.py", 'import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))\nimport score\n')
        tests, unreferenced = self._select(f"{COS_REL}/eval/cases/L1/case-a/sources/team_page.txt")
        self.assertEqual((tests, unreferenced), (["tests.unit.test_score"], []))

    def test_a_path_held_in_a_module_constant_is_followed(self) -> None:
        self._write("ai_lego/loader.py", 'DATA_DIR = "cases"\n\ndef load(root):\n    return sorted((root / DATA_DIR).glob("*.yaml"))\n')
        self._write("tests/unit/test_loader.py", "import ai_lego.loader\n")
        self.assertEqual(self._select(f"{COS_REL}/cases/new.yaml"), (["tests.unit.test_loader"], []))

    def test_a_script_a_test_launches_by_path_carries_its_own_imports(self) -> None:
        # a package directory: python eval/run.py still puts eval/ first on sys.path, so `import helper` is eval/helper.py
        self._write("eval/__init__.py", "")
        self._write("eval/helper.py", "")
        self._write("eval/run.py", "import helper\n")
        self._write("tests/unit/test_cli.py", 'import subprocess, sys\nfrom pathlib import Path\nCOS = Path(__file__).resolve().parents[2]\nsubprocess.run([sys.executable, str(COS / "eval" / "run.py")])\n')
        self.assertEqual(self._select(f"{COS_REL}/eval/helper.py")[0], ["tests.unit.test_cli"])

    def test_a_path_chain_matches_only_as_a_contiguous_run(self) -> None:
        # ai_lego/__init__.py builds REPO / "agency-os" / "docs" / ...: that is not COS docs/, and everything imports it.
        self._write("ai_lego/__init__.py", 'from pathlib import Path\nSPEC = Path(__file__).resolve().parents[3] / "agency-os" / "docs" / "AI_LEGO_Cognitive_Engineering_OS"\n')
        self._write("tests/unit/test_leaf.py", "import ai_lego.pkg.leaf\n")
        tests, unreferenced = self._select(f"{COS_REL}/docs/PLAN.md")
        self.assertEqual((tests, unreferenced), ([], [f"{COS_REL}/docs/PLAN.md"]))

    def test_importers_of_a_deleted_module_are_selected(self) -> None:
        self._write("tests/unit/test_gone.py", "import ai_lego.gone\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/gone.py")[0], ["tests.unit.test_gone"])

    def test_an_unevaluable_sys_path_entry_depends_on_every_change(self) -> None:
        self._write("tests/unit/test_env.py", 'import os, sys\nsys.path.insert(0, os.environ["SOMEWHERE"])\nimport thing\n')
        self._write("tests/unit/test_leaf.py", "import ai_lego.pkg.leaf\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/pkg/leaf.py")[0], ["tests.unit.test_env", "tests.unit.test_leaf"])

    def test_a_spec_data_file_selects_modules_naming_its_id_and_unnamed_files_are_listed(self) -> None:
        self._write("tests/unit/test_contract.py", 'CONTRACT = "synthesis.brief.capability"\n')
        spec_file = f"{SPEC_REL}/capabilities/contracts/synthesis.brief.capability.yaml"
        self._write(spec_file, "id: x\n", root=self.repo)
        self.assertEqual(self._select(spec_file), (["tests.unit.test_contract"], []))
        web = f"{COS_REL}/apps/web/components/Box.tsx"
        self.assertEqual(self._select(web), ([], [web]))
        spec_doc = f"{SPEC_REL}/methods/NOTES.md"
        self.assertEqual(self._select(spec_doc), ([], [spec_doc]))
        self.assertEqual(self._select("agency-os/WORKLOG.md"), ([], []))

    def test_a_computed_import_module_selects_the_modules_that_spell_what_it_loads(self) -> None:
        # dispatch: f"ai_lego.modules.{family}.{name}" from a method id; gates: a ref checked with startswith(...)
        self._write("ai_lego/modules/__init__.py", "")
        self._write("ai_lego/modules/fam/__init__.py", "")
        self._write("ai_lego/modules/fam/meth.py", "")
        self._write("ai_lego/compute/__init__.py", "")
        self._write("ai_lego/compute/stats.py", "")
        self._write("ai_lego/dispatch.py", 'import importlib\ndef load(f, n):\n    return importlib.import_module(f"ai_lego.modules.{f}.{n}")\n')
        self._write("ai_lego/gates.py", 'import importlib\ndef ok(ref):\n    if ref.startswith("ai_lego.compute."):\n        return importlib.import_module(ref.rpartition(".")[0])\n')
        self._write("ai_lego/builder.py", 'REF = "ai_lego.compute.stats.mean"\n')
        self._write("ai_lego/const.py", 'import importlib\nM = importlib.import_module("ai_lego.pkg.leaf")\n')
        self._write("ai_lego/third.py", 'import importlib\ndef opt(name):\n    return importlib.import_module(name)\n')
        self._write("tests/unit/test_via_dispatch.py", 'import ai_lego.dispatch\nMETHOD = "fam.meth"\n')
        self._write("tests/unit/test_other_method.py", 'import ai_lego.dispatch\nMETHOD = "fam.other"\n')
        self._write("tests/unit/test_builder.py", "import ai_lego.builder\n")
        self._write("tests/unit/test_gates_only.py", "import ai_lego.gates\n")
        self._write("tests/unit/test_const.py", "import ai_lego.const\n")
        self._write("tests/unit/test_third.py", "import ai_lego.third\n")
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/modules/fam/meth.py")[0], ["tests.unit.test_via_dispatch"])
        self.assertEqual(self._select(f"{COS_REL}/ai_lego/compute/stats.py")[0], ["tests.unit.test_builder"])
        leaf = self._select(f"{COS_REL}/ai_lego/pkg/leaf.py")[0]
        self.assertIn("tests.unit.test_const", leaf)
        self.assertNotIn("tests.unit.test_third", leaf)

    def test_any_spec_change_selects_the_tests_that_glob_spec_themselves(self) -> None:
        self._write("tests/unit/test_all_contracts.py", 'from ai_lego import resolve_spec_root\nFILES = sorted((resolve_spec_root() / "methods").glob("*.yaml"))\n')
        self._write("tests/unit/test_globs_elsewhere.py", 'from pathlib import Path\nFILES = sorted(Path("x").glob("*.txt"))\n')
        self._write("tests/unit/test_names_spec.py", 'SPEC_ROOT = "somewhere"\n')
        tests, _ = self._select(f"{SPEC_REL}/methods/nobody-names-this.contract.yaml")
        self.assertEqual(tests, ["tests.unit.test_all_contracts"])

    def test_the_real_tree_selects_every_eval_importer_for_an_eval_change(self) -> None:
        tests, _, _ = affected_tests.affected_test_modules([f"{affected_tests.COS.relative_to(affected_tests.REPO).as_posix()}/eval/run.py"])
        self.assertLessEqual({"tests.unit.test_eval_harness", "tests.unit.test_synthesis", "tests.unit.test_api_synthesis"}, set(tests))


if __name__ == "__main__":
    unittest.main()
