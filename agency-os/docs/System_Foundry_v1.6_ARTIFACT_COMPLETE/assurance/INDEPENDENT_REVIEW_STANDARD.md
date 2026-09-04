# Independent Review Standard

A review is only "independent" if the reviewer did not design the thing being reviewed and has no incentive to wave it through — a self-review or a rubber-stamp from the same team does not satisfy this standard for anything above the lowest risk tier.

Required: the reviewer MUST be a different individual (or, for the highest-risk changes, a different team) than the author (`kernel/04_SUBAGENT_INHERITANCE.md` independence-of-roles requirement), the review MUST cover the actual surrounding context of the change, not only the diff in isolation, findings MUST be recorded with severity and an explicit disposition (fixed, accepted-with-expiry, disputed-and-escalated), and conflicts of interest (reviewer has a stake in the outcome) MUST be disclosed and, where material, disqualifying.

A review that produces zero findings on a nontrivial change is not automatically evidence of quality — it MUST be distinguishable from "the reviewer did not look closely," for example by the reviewer stating what was specifically checked. Rubber-stamping (approving without evidence of having read the change) is a rejected practice, not a time-saving shortcut.
