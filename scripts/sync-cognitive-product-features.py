"""Export the IDs actually accepted by the cognitive entitlement call sites (ADR 017 step 1)."""
import ast
import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[1]
COGNITIVE = REPO / "Projects/internal/cognitive-engineering-os"
sys.path.insert(0, str(COGNITIVE))

from ai_lego import resolve_spec_root
from ai_lego.core.yaml_safe import safe_load
from ai_lego.platform.ai_execution.method_resolver import MethodCatalog
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog


def inventory():
    root = resolve_spec_root()
    metadata = safe_load((root / "methods/registry/method-display-metadata.yaml").read_text(encoding="utf-8"))["entries"]
    rows = {}
    for catalog, is_method in ((MethodCatalog.from_spec_root(root), True), (CapabilityCatalog.from_spec_root(root), False)):
        for feature_id, entry in catalog.contracts.items():
            if not catalog.is_resolvable(feature_id):
                continue
            name = metadata[feature_id]["name_zh"] if is_method else safe_load((root / entry["path"]).read_text(encoding="utf-8"))["title"]
            rows[feature_id] = {"id": feature_id, "name": name, "billing": "credits" if feature_id.startswith("ai.") else "contract"}
    names = {"PROJECT_MANAGE_CAPABILITY": "管理專案", "SOURCE_MANAGE_CAPABILITY": "管理來源", "RESEARCH_COLLECT_CAPABILITY": "蒐集研究資料"}
    tree = ast.parse((COGNITIVE / "ai_lego/apps/api/main.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in names:
                    feature_id = ast.literal_eval(node.value)
                    rows[feature_id] = {"id": feature_id, "name": names[target.id], "billing": "contract"}
    return [rows[k] for k in sorted(rows)]


if __name__ == "__main__":
    output = REPO / "lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/cognitive-features.json"
    content = json.dumps(inventory(), ensure_ascii=False, indent=2) + "\n"
    if "--check" in sys.argv:
        if not output.exists() or output.read_text(encoding="utf-8") != content:
            sys.exit("cognitive feature inventory drift: run python scripts/sync-cognitive-product-features.py")
    else:
        output.write_text(content, encoding="utf-8", newline="\n")
    print(f"cognitive features: {len(json.loads(content))}")
