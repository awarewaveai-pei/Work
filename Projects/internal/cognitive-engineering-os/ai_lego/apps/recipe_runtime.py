"""Shared method-node runtime components for API and offline Recipe entrypoints."""

from __future__ import annotations

import datetime
from typing import Any, Callable, Mapping

from ai_lego.apps.api.dispatch import invoke_builder, invoke_gate_runner, resolve_builder, resolve_gate_runner
from ai_lego.core.domain.provenance import make_provenance
from ai_lego.errors import InvariantViolation
from ai_lego.modules.research.capability_adapters import pre_transcribed_input_adapter, research_paper_artifact_adapter, run_statistics_adapter
from ai_lego.modules.research.evidence_triangulation import offline_literature_search, project_literature_search
from ai_lego.modules.representation.chart_render import generate_chart_artifact
from ai_lego.modules.strategy.proposal_artifact import proposal_artifact_adapter
from ai_lego.modules.research.gates import evaluate_research_workflow_integrity_gate
from ai_lego.modules.art_therapy.workflow_gates import evaluate_art_therapy_project_workflow_gate
from ai_lego.data.object.json_artifact_store import JsonArtifactStore
from ai_lego.platform.ai_execution.capability_resolver import CapabilityCatalog
from ai_lego.platform.workflow.capability_adapters import CapabilityAdapterRegistry
from ai_lego.platform.workflow.gates import evaluate_workflow_completion_gate
from ai_lego.platform.workflow.workflow_gates import WorkflowGateRegistry


def build_method_components(
    nodes: list[Mapping[str, Any]],
    *,
    validator: str,
    provenance_kind: str = "AI_INFERENCE",
    provenance_authorship: str = "AI_GENERATED",
) -> tuple[dict[str, Callable[..., dict[str, Any]]], dict[int, Callable[..., list[dict[str, Any]]]]]:
    """Build method handlers and indexed gate runners from compiled workflow nodes.

    The factory owns only the repeated method invocation shape. Entrypoints retain
    responsibility for auth, entitlement, capability adapters, journal policy, and
    translating dispatch errors into their own transport responses.
    """
    handlers: dict[str, Callable[..., dict[str, Any]]] = {}
    gate_runners: dict[int, Callable[..., list[dict[str, Any]]]] = {}
    for index, node in enumerate(nodes):
        if node.get("node_kind") != "method":
            continue
        method_id = node.get("method_id")
        if not isinstance(method_id, str) or not method_id:
            raise InvariantViolation(f"WORKFLOW_METHOD_ID_MISSING: node={index}")
        builder = resolve_builder(method_id)
        gate_runner = resolve_gate_runner(method_id)

        def handler(payload: dict[str, Any], _node: dict[str, Any], _builder=builder) -> dict[str, Any]:
            bindings = payload.get("__bindings__")
            if not isinstance(bindings, dict):
                raise InvariantViolation("WORKFLOW_BINDINGS_REQUIRED: executor did not expose bindings")
            return invoke_builder(_builder, "", make_provenance(provenance_kind, provenance_authorship), bindings)

        def run_gate(
            output: dict[str, Any],
            context: dict[str, Any],
            _node: dict[str, Any],
            _gate_runner=gate_runner,
        ) -> list[dict[str, Any]]:
            return invoke_gate_runner(
                _gate_runner,
                output,
                context,
                validator,
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )

        handlers[method_id] = handler
        gate_runners[index] = run_gate
    return handlers, gate_runners


def build_registered_capability_adapters(
    capability_catalog: CapabilityCatalog,
    capability_ids: list[str],
    *,
    project_sources: list[dict[str, Any]] | None = None,
) -> CapabilityAdapterRegistry:
    """Build the explicit, side-effect-free adapter set shared by API and CLI.

    Raw-media transcription is intentionally not registered here.
    ``literature_search`` is the deterministic offline synthetic-corpus adapter
    by default -- Cognitive OS does not reach out to any external network provider
    for data search (operator directive 2026-09-17: data collection is
    `/ops/collect`'s job, not a capability duplicated here; see
    `agency-os/memory/feedback_route_data_fetch_through_ops_collect.md`). When
    ``project_sources`` is given (RESEARCH_LINES_MASTER_PLAN WC-P2-07a), the run has a
    Project, and ``literature_search`` instead returns that Project's own active
    ``source_class=academic`` Sources -- still no network call, just a different local
    corpus. Both existing callers (``main.py``, ``run_recipe.py``) omit the argument and
    keep the offline-fixture behaviour unchanged.
    """
    adapters = CapabilityAdapterRegistry(capability_catalog)
    # Built only when actually requested: project_literature_search(project_sources) is
    # fail-closed (raises on zero matching Sources), so building it for every call --
    # including recipes that never invoke literature_search, e.g. life-decision-v1 -- would
    # wrongly break an unrelated run whose Project simply has no academic Sources yet.
    literature_search_handler = offline_literature_search
    if project_sources is not None and "literature_search" in capability_ids:
        literature_search_handler = project_literature_search(project_sources)
    registered = {
        "literature_search": literature_search_handler,
        "transcribe": pre_transcribed_input_adapter,
        "run_statistics": run_statistics_adapter,
        "artifact.generate_research_paper": research_paper_artifact_adapter,
        "artifact.generate_proposal": proposal_artifact_adapter,
        "artifact.generate_chart": generate_chart_artifact,
    }
    for capability_id in capability_ids:
        handler = registered.get(capability_id)
        if handler is not None:
            adapters.register(capability_id, handler)
    return adapters


def persist_artifact_output(tenant_id: str, artifact_store: JsonArtifactStore, output: Any) -> Any:
    """OQ-PROPOSAL-1 (answered 2026-09-17): any capability output shaped ``{"artifact": {"artifact_type": str,
    "content": str, ...}}`` is CAS-persisted, in addition to being returned inline -- a class fix (every
    artifact-emitting capability, not just ``artifact.generate_proposal``), matching this module's own
    documented scope (shared runtime, not one capability's special case).

    The reference is named ``cas_reference`` deliberately, NOT ``portable_artifact_uri``: the Portable Artifact
    URI grammar (``specs/artifact/portable-uri.schema.yaml``) is scoped to a Project+Source pair a Recipe-run
    artifact does not have; this stores a real, tenant-scoped, content-addressed reference readable via
    ``JsonArtifactStore.read`` (``POST /artifacts/read``), not a claim of that other schema's URI shape."""
    if not isinstance(output, Mapping):
        return output
    artifact = output.get("artifact")
    if not isinstance(artifact, Mapping) or not isinstance(artifact.get("artifact_type"), str) or not isinstance(artifact.get("content"), str):
        return dict(output)
    reference = artifact_store.put(tenant_id, artifact["artifact_type"], dict(artifact))
    enriched = dict(output)
    enriched["artifact"] = {**artifact, "cas_reference": reference}
    return enriched


def wrap_capability_handlers_with_artifact_persistence(
    handlers: Mapping[str, Callable[[dict[str, Any], dict[str, Any]], Any]],
    tenant_id: str,
    artifact_store: JsonArtifactStore,
) -> dict[str, Callable[[dict[str, Any], dict[str, Any]], Any]]:
    """Wrap every capability handler so its output passes through ``persist_artifact_output``. Handlers that do
    not emit an artifact-shaped value are returned unchanged (dict-copied, never mutated in place)."""

    def make_wrapper(inner: Callable[[dict[str, Any], dict[str, Any]], Any]) -> Callable[[dict[str, Any], dict[str, Any]], Any]:
        def wrapped(payload: dict[str, Any], node: dict[str, Any]) -> Any:
            return persist_artifact_output(tenant_id, artifact_store, inner(payload, node))

        return wrapped

    return {capability_id: make_wrapper(handler) for capability_id, handler in handlers.items()}


def build_registered_workflow_gate_registry(validator: str) -> WorkflowGateRegistry:
    """Build the shared registry of gates already implemented by the OS."""
    registry = WorkflowGateRegistry()
    registry.register(
        "workflow_execution_integrity",
        lambda context, workflow: [
            evaluate_workflow_completion_gate(
                context,
                workflow,
                validator,
                datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )
        ],
    )
    registry.register(
        "research_workflow_integrity",
        lambda context, workflow: evaluate_research_workflow_integrity_gate(
            context,
            workflow,
            "ai_lego.modules.research.gates",
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
        ),
    )
    registry.register(
        "art_therapy_project_safety",
        lambda context, workflow: evaluate_art_therapy_project_workflow_gate(
            context,
            workflow,
            "ai_lego.modules.art_therapy.workflow_gates",
            datetime.datetime.now(datetime.timezone.utc).isoformat(),
        ),
    )
    return registry
