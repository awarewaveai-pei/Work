"""F09 systems thinking family (Atlas L541-559) -- COMPLETE, 8 of 8. Tenants: ``systems.causal_loop_diagram``
(loop_type GENUINE_COMPUTE-recomputed from edge polarity parity, never caller-trusted; edge_ids must form a
verified closed cycle), ``systems.stock_and_flow`` (every flow's target_stock_id must resolve to a real stock;
every stock must be touched by >=1 flow), ``systems.iceberg_model`` (top-down completeness -- a deeper level may
only be non-empty if every shallower level already is), ``systems.behavior_over_time`` (points strictly
increasing in time, >=2 required, values finite), ``systems.systems_archetypes`` (closed 10-value compiled
archetype vocabulary + >=1 observed_symptoms per match), ``systems.rich_picture`` (>=1 actor and >=1 issue
required; every issue's involves_actor_ids non-empty and resolves to a real actor), ``systems.leverage_point_analysis``
(tier_rank GENUINE_COMPUTE from Atlas's own 5-tier parameters->feedback->rules->goals->paradigm chain, never
caller-supplied), ``systems.agent_based_modeling`` (every agent requires >=1 rule; every run's
agent_ids_involved resolves to real declared agents). 1 critic pass (Standard tier, hand-tamper-verified)
found 2 Major (nested-list aliasing in causal_loop_diagram/systems_archetypes/rich_picture's builders -- a
shallow ``dict(item)`` copy did not deep-copy the item's own nested list field, so the "validated" returned
record still shared a mutable list object with the caller's input) + 1 Minor (systems.iceberg_model's
``ICE-`` id prefix collided with the pre-existing ``decision.ice`` method) -- all fixed same-day before
registry sync, see WORKLOG 2026-09-12 F09 entry.
"""
