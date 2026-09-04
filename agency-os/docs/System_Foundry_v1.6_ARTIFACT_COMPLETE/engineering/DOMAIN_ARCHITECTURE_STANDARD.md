# Domain Architecture Standard

Every bounded context has exactly one owner and one authoritative model for its concepts; no other context may reach in and mutate its state directly.

Required: explicit bounded-context map with a ubiquitous language glossary per context (a term meaning two different things in two contexts MUST be renamed, not silently overloaded), documented invariants each context enforces on its own data, explicit state machines for entities with lifecycle (not implicit status strings with undocumented legal transitions), and an anti-corruption layer at every boundary where an external or legacy model would otherwise leak into the domain model.

Cross-context reads/writes MUST go through the owning context's published contract (API/event), never direct database access into another context's tables. A context boundary that is routinely bypassed "for convenience" is not a real boundary and MUST be either enforced or formally dissolved — it MUST NOT be left as an ignored rule.
