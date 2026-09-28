# Inside the live cognitive-os-api container: one real analysis of the iceberg demo through the deployed code and the
# production AI provider (the long background timeout). run_interpretation writes nothing (no project, no artifact, no
# usage row); prints sections, gates and attempts only. Run: docker exec -i cognitive-os-api python - < this file
import json, secrets, time
import yaml
from ai_lego import resolve_spec_root
from ai_lego.apps.api import main as m
from ai_lego.core.contracts.schema_contracts import SchemaContracts
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.modules.research.interpret_method_record import INTERPRET_TIMEOUT_SECONDS, run_interpretation
from ai_lego.platform.ai_gateway.provider import provider_from_env

spec = resolve_spec_root()
body = dict(yaml.safe_load((spec / "methods/registry/method-form-examples.yaml").read_text(encoding="utf-8"))["examples"]["systems.iceberg_model"]["input"])
catalog = m._cached_method_catalog(str(spec))
builder = m.resolve_builder("systems.iceberg_model")
record_id = f"{m.record_id_prefix('systems.iceberg_model', required=m.builder_takes_record_id(builder)) or ''}{secrets.token_hex(8).upper()}"
record = m.invoke_builder(builder, record_id, make_provenance("AI_INFERENCE", "AI_GENERATED"), body, {"method_catalog": catalog})
contract = yaml.safe_load((spec / catalog.require("systems.iceberg_model")["path"]).read_text(encoding="utf-8"))
provider = provider_from_env()
assert provider is not None, "no AI key configured in the container"
display = m._method_display_metadata()
started = time.time()
out = run_interpretation(
    method_id="systems.iceberg_model", contract=contract, display=display.get("systems.iceberg_model"), record=record, sources=[],
    provider=provider.with_timeout(INTERPRET_TIMEOUT_SECONDS), spec_root=spec, schema_contracts=SchemaContracts(spec),
    active_method_ids={key for key in catalog.contracts if catalog.is_resolvable(key)}, interpretation_id="INTERP-PRODCHECK" + secrets.token_hex(4).upper(),
    catalog_lines=[f"{key} — {display.get(key, {}).get('name_zh', key)}" for key in sorted(catalog.contracts) if catalog.is_resolvable(key)],
)
result = out["interpretation"] or {}
print(json.dumps({
    "seconds": round(time.time() - started), "error": out["error"], "model": out["model"],
    "tokens": [out["input_tokens"], out["output_tokens"]],
    "sections": [key for key in ("summary", "units", "focus", "priority", "solutions", "loop", "trend") if key in result],
    "findings": len(result.get("findings", [])),
    "gates": [[gate["gate_id"], gate["status"]] for gate in out["gate_results"]],
    "dropped": next((gate["evidence"].get("dropped") for gate in out["gate_results"] if gate["gate_id"] == "detail_integrity"), None),
    "attempts": out.get("attempts"),
}, ensure_ascii=False))
