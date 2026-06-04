---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase — refactors that turn shallow modules into deep ones. Generates a visual HTML report with before/after diagrams. Use when user wants to improve architecture, find refactoring opportunities, reduce coupling, make code more testable or AI-navigable, or mentions "架構改善", "重構機會", "模組太分散", "很難測試", "run this every few days". See LANGUAGE.md for vocabulary.
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. See [LANGUAGE.md](LANGUAGE.md) for full definitions.

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md)):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

## Process

### 1. Explore

Read the project's domain glossary (`CONTEXT.md` if present) and any ADRs in `docs/architecture/decisions/` first.

Then use the Agent tool with `subagent_type=Explore` to walk the codebase. Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Resolve the temp dir from `$TMPDIR`, falling back to `/tmp` (or `$env:TEMP` on Windows), and write to `<tmpdir>/architecture-review-<timestamp>.html`. Open it for the user — `start <path>` on Windows — and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams. Mix Mermaid (for call graphs, dependencies, sequences) with hand-crafted CSS/SVG visuals (for mass diagrams, cross-sections). Each candidate gets a **before/after visualisation**.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction (one sentence)
- **Solution** — what would change (one sentence)
- **Benefits** — in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn
- **Recommendation strength** — `Strong`, `Worth exploring`, or `Speculative`

End the report with a **Top recommendation** section.

**Use CONTEXT.md vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture.**

**ADR conflicts**: if a candidate contradicts an existing ADR in `docs/architecture/decisions/`, only surface it when the friction is real enough to warrant revisiting. Mark it clearly.

Do NOT propose interfaces yet. After the file is written, ask: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallise:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist. See [CONTEXT-FORMAT.md](../grill-with-docs/CONTEXT-FORMAT.md).
- **Sharpening a fuzzy term?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR in `docs/architecture/decisions/`. See [ADR-FORMAT.md](../grill-with-docs/ADR-FORMAT.md).
- **Want to explore alternative interfaces?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).

See [DEEPENING.md](DEEPENING.md) for dependency classification and testing strategy.
