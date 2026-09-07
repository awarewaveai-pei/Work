"""F05 root-cause-family methods -- COMPLETE, 9 of 9 table rows. Tenants: ``root_cause.fishbone``
(see ``fishbone.py``), ``root_cause.five_whys`` (see ``five_whys.py``), ``root_cause.pareto`` (see ``pareto.py``),
``root_cause.fault_tree`` (see ``fault_tree.py`` -- AND/OR gate DAG over basic_events, distinct from
``security.attack_tree``'s embedded tree shape), ``root_cause.bow_tie`` (see ``bow_tie.py`` -- threats/top_event/
consequences with a mandatory owner+test control invariant), ``root_cause.kepner_tregoe``
(see ``kepner_tregoe.py`` -- Is/Is-Not differential problem specification), ``root_cause.event_tree``
(see ``event_tree.py`` -- forward ordered-barrier propagation from a single initiating event, structural
opposite of ``fault_tree``'s backward AND/OR decomposition), ``root_cause.change_analysis``
(see ``change_analysis.py`` -- flat ranked before/after change list, structurally incapable of asserting
causation: no caused_by/root_cause field exists anywhere in the type), ``root_cause.barrier_analysis``
(see ``barrier_analysis.py`` -- Hazard->Target->Barrier->failure chain with a no-blame structural invariant,
distinct from ``bow_tie``'s accountability invariant)."""
