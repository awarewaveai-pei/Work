"""F04 associative mapping & combination family -- COMPLETE, 6 of 6. Tenants: ``association.mind_map`` (fixed
4-level nested tree -- central_topic -> main_branches[] -> sub_branches[] -> keywords[], untyped edges,
whole-tree id uniqueness; distinct from concept_map's typed-edge graph), ``association.concept_map``
(nodes + typed-relationship edges, referential integrity on every edge's from/to node id, GENUINE_COMPUTE
``orphan_node_ids`` re-derived by an independent gate; sourced-vs-inferred edge coherence reuses the shared
``provenance.epistemic_type`` axis rather than inventing a redundant field, same precedent
``causal.dag``/``framing.five_w_one_h`` already establish), ``association.affinity_diagram`` (one-idea-per-card
-> silent grouping -> post-hoc naming; every card belongs to exactly one group, GENUINE_COMPUTE
``ungrouped_card_refs`` re-derived independently), ``association.morphological_analysis`` (dimensions x
options x compatibility constraints, GENUINE_COMPUTE ``legal_combinations``/``legal_combination_count``
re-derived via cartesian-product-minus-constraints, defensive ``MAX_RAW_COMBINATION_SPACE`` cap before
enumeration), ``association.attribute_listing`` (decompose-transform-recombine: attributes each carrying
>=1 transformed_variant that must genuinely differ from the original, optional recombination stage with
referential integrity back to real ``(attribute_name, variant_id)`` pairs), ``association.analogy_mapping``
(3-stage transfer pipeline -- source_domain_description -> abstracted_mechanism -> target_mapping, all
pairwise genuinely distinct; syntactic-only distinctness check, deliberately not a semantic
"is this genuinely more abstract" judgment no runtime gate can honestly perform)."""
