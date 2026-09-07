"""F20 資安／隱私套件 (Security / Privacy Pack) -- the fourth pack family this session opens, after F18's
own Software Architecture Pack (8 of 10 table rows built, 2 disclosed scope skips -- NOT complete), F19's
own DevOps／SRE／可靠性套件 (13/13, complete), and F21's own database_data pack (9 built + 1 confirmed-
covered, complete). Tenants: ``security.stride`` (see ``stride.py``), ``security.linddun`` (see
``linddun.py`` -- deliberately mirrors ``stride.py``'s own shape, see its own module docstring),
``security.attack_tree`` (see ``attack_tree.py`` -- the FIRST F20 member to structurally DIVERGE from the
stride/linddun shared shape, and the first F20 ``genuine_compute`` module), ``security.pasta`` (see
``pasta.py`` -- a genuinely THIRD structural shape: a fixed-length, positionally-ordered seven-stage
pipeline, neither the stride/linddun flat-DFD shape nor attack_tree's own recursive tree),
``security.dpia_pia`` (see ``dpia_pia.py`` -- the FIRST F20 member that is NOT one of Execution Contract
§32's own four named Threat Review methods; shares pasta.py's own ordered-pipeline class but adds
cross-stage risk-to-control-to-residual traceability and a high-residual-risk escalation rule, both
grounded in real external DPIA/GDPR practice, not Atlas), ``security.zero_trust_review``,
``security.secrets_threat_review``, ``security.supply_chain_threat_model``, ``security.abuse_case``, and
``security.security_control_mapping`` (see each module's own docstring) -- **F20 complete, 10/10**.
``security_control_mapping.py`` is the family's first downstream CONSUMER, taking an existing
``security.stride``/``security.linddun`` record as real input rather than describing a system from scratch.

Not to be confused with ``ai_lego.security`` (crypto-shred key-lifecycle runtime infrastructure, a
different concern under a same-named path segment)."""
