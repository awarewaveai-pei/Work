"""Run only the unit tests a change can affect (plan §12.1 rule 11): the full suite is 14k tests / ~25 min, and 93%
of it exercises method slices an unrelated change never touches. Selection = every tests/unit module that can reach a
changed file through the edges below; over-selecting is fine, a silent miss is the bug.
- Imports, resolved the way Python finds them: dotted from the COS root, relative, every package ``__init__`` on the
  way, bare names through statically known ``sys.path`` entries (process-wide) and the file's own directory (a script
  run directly). Every mention of ``sys.path`` is a read, an addition it can evaluate (insert/append/extend/+=), or
  unknown -- unknown makes that file depend on every change.
- A path expression naming a .py file (``COS / "eval" / "run.py"``: a script a test launches) is an edge too.
- A changed COS file selects the modules whose path expressions contain its constant run (``case_dir / "sources"``;
  ``root / DATA_DIR`` with ``DATA_DIR = "cases"``); a changed non-Python COS/SPEC file also selects the modules that
  name it (SPEC yaml/json: its stem too = schema/contract id). Non-Python files nothing names are listed.
- ``importlib.import_module``: a constant name is an import. A computed name is built from data under a prefix the
  file spells (dispatch: f"ai_lego.modules.{family}.{name}" from a method id; gates: a ref checked with
  ``startswith("ai_lego.compute.")``), so a changed file under such a prefix selects the modules that spell its
  dotted name or, below the prefix, its dotted id ("decision.rice") -- the data that makes it load. (A blanket edge
  "dispatch depends on every method" selected 315 of 361 modules for a 9-file change.) A computed name with no
  ``ai_lego.`` prefix loads a third-party package.
- Any SPEC change also selects the test modules that glob SPEC themselves (they enumerate every contract/schema).
Outside the contract: files outside COS and SPEC (not COS inputs); paths computed at run time; SPEC read through the
core loaders everyone imports (following them selected 359 of ~370 modules) -- the golden run, which every gate runs,
validates every SPEC file. A change to this file or to the runtime (lock, Dockerfile) = full suite (plan rule 11).

    python scripts/affected_tests.py                 # changes vs HEAD (staged + unstaged + untracked)
    python scripts/affected_tests.py --base origin/main --run
"""

from __future__ import annotations

import argparse
import ast
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

COS = Path(__file__).resolve().parents[1]
REPO = COS.parents[2]
_SPEC_MARK = "AI_LEGO_Cognitive_Engineering_OS"
_PATH_CALLS = {"Path", "PurePath", "PurePosixPath", "joinpath", "join"}
_PKG_PREFIX = re.compile(r"^ai_lego(\.[A-Za-z_]\w*)*\.$")
_GLOB = re.compile(r"\br?glob\(")
_SPEC_REF = re.compile(r"resolve_spec_root|AI_LEGO_Cognitive_Engineering_OS|SPEC_ROOT|spec_root")


def _git(*args: str) -> list[str]:
    out = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return [line for line in out.splitlines() if line.strip()]


def changed_files(base: str) -> list[str]:
    files = set(_git("diff", "--name-only", base)) | set(_git("ls-files", "--others", "--exclude-standard"))
    return sorted(files)


@dataclass
class _File:
    text: str = ""
    imports: list[tuple[str, int]] = field(default_factory=list)  # (dotted name, relative level)
    path_roots: list[PurePosixPath] = field(default_factory=list)  # COS-relative sys.path entries it adds
    opaque: bool = False  # changes sys.path in a way that is not statically known
    chains: set[tuple[str, ...]] = field(default_factory=set)  # constant runs of path expressions ("sources",)
    dynamic: bool = False  # calls import_module with a computed name
    prefixes: set[str] = field(default_factory=set)  # "ai_lego/compute" for a constant "ai_lego.compute."
    deps: set[str] = field(default_factory=set)


def _python_files(cos: Path) -> list[str]:
    out: list[str] = []
    for root, dirs, files in os.walk(cos):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "__pycache__"} and not d.startswith(".")]
        rel = PurePosixPath(Path(root).relative_to(cos).as_posix())
        out += [(rel / name).as_posix() for name in files if name.endswith(".py")]
    return out


def _call_name(func: ast.AST) -> str:
    return func.attr if isinstance(func, ast.Attribute) else func.id if isinstance(func, ast.Name) else ""


def _eval_path(node: ast.AST, here: PurePosixPath, assigns: dict[str, ast.AST], depth: int = 0) -> PurePosixPath | None:
    """Value of a path built from Path(__file__), .resolve(), .parent, .parents[n], / "x", str() and module-level
    names; None for anything else."""
    if depth > 20:
        return None
    ev = lambda n: _eval_path(n, here, assigns, depth + 1)  # noqa: E731
    if isinstance(node, ast.Call):
        name, args = _call_name(node.func), node.args
        if name in {"Path", "PurePath"} and len(args) == 1 and isinstance(args[0], ast.Name) and args[0].id == "__file__":
            return here
        if name in {"str", "fspath"} and len(args) == 1:
            return ev(args[0])
        if name in {"resolve", "absolute"} and isinstance(node.func, ast.Attribute) and not args:
            return ev(node.func.value)
        return None
    if isinstance(node, ast.Attribute) and node.attr == "parent":
        base = ev(node.value)
        return base.parent if base is not None else None
    if (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Attribute) and node.value.attr == "parents"
            and isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, int)):
        base = ev(node.value.value)
        return base.parents[node.slice.value] if base is not None and 0 <= node.slice.value < len(base.parents) else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div) and isinstance(node.right, ast.Constant) and isinstance(node.right.value, str):
        base = ev(node.left)
        return base / node.right.value if base is not None else None
    if isinstance(node, ast.Name) and node.id in assigns:
        return ev(assigns[node.id])
    return None


def _runs(values: list[ast.AST], assigns: dict[str, ast.AST]) -> list[tuple[str, ...]]:
    """Maximal runs of string constants in a path's parts: [x, "a", "b/c", f"..", "d"] -> (a, b, c), (d,); a
    module-level name bound to a string constant counts as that constant."""
    runs: list[tuple[str, ...]] = []
    current: list[str] = []
    for value in values + [None]:
        if isinstance(value, ast.Name) and isinstance(assigns.get(value.id), ast.Constant):
            value = assigns[value.id]
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            current += [part for part in value.value.split("/") if part]
        elif current:
            runs.append(tuple(current))
            current = []
    return runs


def _sys_path_additions(node: ast.AST, parents: dict[ast.AST, ast.AST]) -> list[ast.AST] | None:
    """What one mention of sys.path adds to it: [] for a read, the added expressions for insert/append/extend/+= of a
    literal list, None for anything else (slice assignment, rebinding, passed to a call) = unknown."""
    up = parents.get(node)
    call = parents.get(up) if isinstance(up, ast.Attribute) else None
    if isinstance(call, ast.Call) and call.func is up:
        if up.attr in {"insert", "append"} and call.args:
            return [call.args[-1]]
        if up.attr == "extend" and len(call.args) == 1 and isinstance(call.args[0], (ast.List, ast.Tuple)):
            return list(call.args[0].elts)
        return [] if up.attr in {"index", "count", "copy"} else None
    if isinstance(up, ast.AugAssign) and up.target is node and isinstance(up.op, ast.Add) and isinstance(up.value, (ast.List, ast.Tuple)):
        return list(up.value.elts)
    if isinstance(up, ast.Compare) or (isinstance(up, (ast.For, ast.comprehension)) and up.iter is node):
        return []
    return None


def _parse(cos_posix: PurePosixPath, rel: str, text: str) -> _File:
    info = _File(text=text)
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return info
    here = cos_posix / rel
    assigns = {t.id: stmt.value for stmt in tree.body if isinstance(stmt, ast.Assign) for t in stmt.targets if isinstance(t, ast.Name)}
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    sys_names = {alias.asname or "sys" for n in ast.walk(tree) if isinstance(n, ast.Import) for alias in n.names if alias.name == "sys"}
    inner: set[int] = set()  # BinOps already read as part of an outer a / "b" / "c"
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            info.imports += [(alias.name, 0) for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if base == "sys" and any(alias.name == "path" for alias in node.names):
                info.opaque = True  # a bare `path` name can be mutated anywhere
            info.imports += [(base, node.level)] if base else []
            info.imports += [(f"{base}.{alias.name}" if base else alias.name, node.level) for alias in node.names]
        elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div) and id(node) not in inner:
            parts: list[ast.AST] = []
            while isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
                inner.add(id(node))
                parts.insert(0, node.right)
                node = node.left
            info.chains.update(_runs([node] + parts, assigns))
        elif isinstance(node, ast.Attribute) and node.attr == "path" and isinstance(node.value, ast.Name) and node.value.id in sys_names:
            added = _sys_path_additions(node, parents)
            roots = [_eval_path(value, here, assigns) for value in added or []]
            info.opaque |= added is None or None in roots
            for root in roots:
                try:
                    info.path_roots.append(PurePosixPath(root.relative_to(cos_posix).as_posix()))
                except (AttributeError, ValueError):
                    pass  # unevaluable (already opaque) or outside COS: no graph file lives there
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and _PKG_PREFIX.match(node.value):
            info.prefixes.add(node.value.rstrip(".").replace(".", "/"))
        elif isinstance(node, ast.Call):
            name = _call_name(node.func)
            info.opaque |= name == "addsitedir"
            if name == "import_module" and node.args:
                first = node.args[0]
                if isinstance(first, ast.Constant) and isinstance(first.value, str):
                    info.imports.append((first.value, 0))
                else:
                    info.dynamic = True
            if name in _PATH_CALLS:
                info.chains.update(_runs(list(node.args), assigns))
    return info


def _resolve(name: str, level: int, rel: str, roots: list[PurePosixPath], universe: set[str]) -> set[str]:
    """The files Python runs for this import: the module and every package __init__ above it under the same root."""
    parts = [p for p in name.split(".") if p]
    if level:
        base = PurePosixPath(rel).parent
        for _ in range(level - 1):
            base = base.parent
        roots = [base]
    while parts:  # "ai_lego.x.symbol" -> nearest file
        for root in roots:
            target = root.joinpath(*parts).as_posix()
            for candidate in (f"{target}.py", f"{target}/__init__.py"):
                if candidate in universe:
                    inits = {root.joinpath(*parts[:k], "__init__.py").as_posix() for k in range(1, len(parts))}
                    return {candidate} | (inits & universe)
        parts = parts[:-1]
    return set()


def _contains(parts: tuple[str, ...], run: tuple[str, ...]) -> bool:
    return any(parts[i:i + len(run)] == run for i in range(len(parts) - len(run) + 1))


def affected_test_modules(files: list[str], cos: Path = COS, repo: Path = REPO) -> tuple[list[str], list[str], list[str]]:
    """(test modules to run, changed graph files, changed files no module names)."""
    cos_rel = cos.relative_to(repo).as_posix()
    on_disk = _python_files(cos)
    changed_py = {rel[len(cos_rel) + 1:] for rel in files if rel.startswith(cos_rel + "/") and rel.endswith(".py")}
    universe = set(on_disk) | changed_py  # a deleted module still has importers to select
    cos_posix = PurePosixPath(cos.as_posix())
    parsed: dict[str, _File] = {}
    for rel in on_disk:
        try:
            text = (cos / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            text = ""
        parsed[rel] = _parse(cos_posix, rel, text)
    for rel in changed_py - set(on_disk):
        parsed[rel] = _File()
    # sys.path is process-wide: an entry one file adds resolves bare imports in every file loaded after it.
    roots = [PurePosixPath(".")] + sorted({r for f in parsed.values() for r in f.path_roots} - {PurePosixPath(".")})
    for rel, info in parsed.items():
        own_roots = roots + [PurePosixPath(rel).parent]
        for name, level in info.imports:
            info.deps |= _resolve(name, level, rel, own_roots, universe)
    by_name: dict[str, list[str]] = {}
    for rel in universe:
        by_name.setdefault(PurePosixPath(rel).name, []).append(rel)
    for rel, info in parsed.items():
        for chain in info.chains:
            info.deps |= {f for f in by_name.get(chain[-1], ()) if _contains(PurePosixPath(f).parts, chain)}
        info.deps.discard(rel)

    changed = set(changed_py)
    unreferenced: list[str] = []
    dyn_prefixes = {p for info in parsed.values() if info.dynamic for p in info.prefixes}
    spec_globbers = {m for m, info in parsed.items() if m.startswith("tests/unit/test_")
                     and _GLOB.search(info.text) and _SPEC_REF.search(info.text)}
    for rel in files:
        in_cos = rel.startswith(cos_rel + "/")
        in_spec = f"{_SPEC_MARK}/" in rel
        if not (in_cos or in_spec):
            continue
        name = PurePosixPath(rel).name
        needles = set() if rel.endswith(".py") else {name}  # a .py name ("run.py", "main.py") is in every docstring
        if in_cos and rel.endswith(".py"):
            dotted = rel[len(cos_rel) + 1:-3].removesuffix("/__init__").replace("/", ".")
            for prefix in dyn_prefixes:
                below = dotted.removeprefix(prefix.replace("/", ".") + ".")
                if below != dotted:
                    needles |= {dotted} | ({below} if "." in below else set())
        if in_spec and rel.endswith((".yaml", ".yml", ".json")):
            needles.add(name.rsplit(".", 1)[0])
        parts = PurePosixPath(rel[len(cos_rel) + 1:]).parts if in_cos else ()
        hits = {m for m, info in parsed.items() if any(n in info.text for n in needles) or any(_contains(parts, c) for c in info.chains)}
        hits |= spec_globbers if in_spec else set()
        changed |= hits
        if not hits and not (in_cos and rel.endswith(".py")):
            unreferenced.append(rel)
    if changed or unreferenced:
        changed |= {m for m, info in parsed.items() if info.opaque}

    importers: dict[str, set[str]] = {}
    for rel, info in parsed.items():
        for dep in info.deps:
            importers.setdefault(dep, set()).add(rel)
    affected, queue = set(changed), list(changed)
    while queue:
        for importer in importers.get(queue.pop(), ()):
            if importer not in affected:
                affected.add(importer)
                queue.append(importer)
    present = set(on_disk)
    tests = sorted(m[:-3].replace("/", ".") for m in affected
                   if m in present and m.startswith("tests/unit/test_") and "/" not in m[len("tests/unit/"):])
    # Database files change the PostgreSQL contract even when static imports do not name them.
    if any(rel.startswith(cos_rel + "/ai_lego/data/") for rel in files):
        tests = sorted(set(tests) | {
            "tests.unit.test_pg_foundation",
            "tests.unit.test_collection_run_repository",
            "tests.unit.test_project_source_repository",
        })
    return tests, sorted(changed), unreferenced


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="HEAD", help="compare against this rev (default HEAD = uncommitted work)")
    parser.add_argument("--run", action="store_true", help="run them (exit code = unittest's)")
    args = parser.parse_args()
    tests, changed, unreferenced = affected_test_modules(changed_files(args.base))
    print(f"changed modules: {len(changed)}; affected test modules: {len(tests)}", file=sys.stderr)
    if unreferenced:
        print(f"named by no module, so no unit test selected (web -> npm test; pyproject/Dockerfile -> full suite): {len(unreferenced)}", file=sys.stderr)
        for rel in unreferenced[:20]:
            print(f"  {rel}", file=sys.stderr)
    if not tests:
        print("no unit test module is affected (golden still applies)", file=sys.stderr)
        return 0
    if not args.run:
        print(" ".join(tests))
        return 0
    return subprocess.run([sys.executable, "-m", "unittest", *tests, "-q"], cwd=COS).returncode


if __name__ == "__main__":
    raise SystemExit(main())
