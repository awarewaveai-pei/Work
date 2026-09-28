"""Run only the unit tests a change can affect (plan §12.1 rule 11): the full suite is 14k tests / ~25 min, and 93%
of it exercises method slices an unrelated change never touches. Selection = every tests/unit module whose
TRANSITIVE import closure (ai_lego + test helpers) contains a changed module, plus changed test modules; a changed
data file (yaml/json/md under SPEC) selects the modules that name it. The full suite stays the end-of-phase gate.

    python scripts/affected_tests.py                 # changes vs HEAD (staged + unstaged + untracked)
    python scripts/affected_tests.py --base origin/main --run
"""

from __future__ import annotations

import argparse
import ast
import subprocess
import sys
from pathlib import Path

COS = Path(__file__).resolve().parents[1]
REPO = COS.parents[2]
COS_REL = COS.relative_to(REPO).as_posix()


def _git(*args: str) -> list[str]:
    out = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return [line for line in out.splitlines() if line.strip()]


def changed_files(base: str) -> list[str]:
    files = set(_git("diff", "--name-only", base)) | set(_git("ls-files", "--others", "--exclude-standard"))
    return sorted(files)


def _module_of(path: Path) -> str | None:
    rel = path.relative_to(COS).with_suffix("")
    parts = list(rel.parts)
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts) if parts and parts[0] in {"ai_lego", "tests"} else None


def _import_graph() -> dict[str, set[str]]:
    """module -> the ai_lego / tests modules it imports directly."""
    known = {m: p for p in list((COS / "ai_lego").rglob("*.py")) + list((COS / "tests").rglob("*.py")) if (m := _module_of(p))}
    graph: dict[str, set[str]] = {}
    for module, path in known.items():
        deps: set[str] = set()
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (SyntaxError, UnicodeDecodeError):
            graph[module] = deps
            continue
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module] + [f"{node.module}.{alias.name}" for alias in node.names]
            for name in names:
                while name and name not in known:  # "ai_lego.x.y.symbol" -> nearest known module
                    name = name.rpartition(".")[0]
                if name and name != module:
                    deps.add(name)
        graph[module] = deps
    return graph


def affected_test_modules(files: list[str]) -> tuple[list[str], list[str]]:
    graph = _import_graph()
    changed: set[str] = set()
    data_names: list[str] = []
    for rel in files:
        path = REPO / rel
        if rel.startswith(COS_REL + "/") and rel.endswith(".py") and (module := _module_of(path)):
            changed.add(module)
        elif rel.endswith((".yaml", ".yml", ".json")) and "AI_LEGO_Cognitive_Engineering_OS" in rel:
            data_names.append(Path(rel).name)
    if data_names:  # a SPEC data file: whoever names it (schema id, contract file, evolution version) depends on it
        for module in graph:
            source = (COS / Path(*module.split("."))).with_suffix(".py")
            if not source.is_file():
                source = COS / Path(*module.split(".")) / "__init__.py"
            text = source.read_text(encoding="utf-8", errors="replace") if source.is_file() else ""
            if any(name in text or name.rsplit(".", 1)[0] in text for name in data_names):
                changed.add(module)
    closure: dict[str, set[str]] = {}

    def reach(module: str, seen: set[str]) -> set[str]:
        if module in closure:
            return closure[module]
        if module in seen:
            return set()
        seen.add(module)
        result = set(graph.get(module, ()))
        for dep in list(result):
            result |= reach(dep, seen)
        closure[module] = result
        return result

    tests = sorted(m for m in graph if m.startswith("tests.unit.test_") and (m in changed or reach(m, set()) & changed))
    return tests, sorted(changed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="HEAD", help="compare against this rev (default HEAD = uncommitted work)")
    parser.add_argument("--run", action="store_true", help="run them (exit code = unittest's)")
    args = parser.parse_args()
    tests, changed = affected_test_modules(changed_files(args.base))
    print(f"changed modules: {len(changed)}; affected test modules: {len(tests)}", file=sys.stderr)
    if not tests:
        print("no unit test module is affected (golden still applies)", file=sys.stderr)
        return 0
    if not args.run:
        print(" ".join(tests))
        return 0
    return subprocess.run([sys.executable, "-m", "unittest", *tests, "-q"], cwd=COS).returncode


if __name__ == "__main__":
    raise SystemExit(main())
