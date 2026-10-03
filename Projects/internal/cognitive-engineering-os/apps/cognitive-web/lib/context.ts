// 規範與脈絡 as the page holds it: the notes' shape (ai_lego/core/domain/kinds/context.py `context.notes`) and the small
// rules the page applies. The words (facets, questions, checks) come from GET /blocks/context/spec, not from here.
export type FacetNote = { facet: string; relevant: boolean; defines_normal?: string; is_cause?: string; custom?: boolean; definition?: string };
export type Notes = {
  facets_version?: string; facets?: FacetNote[]; jurisdictions?: string[]; rights_duties?: string; norm_origin?: string;
  stance_kind?: string; stance?: string; recheck_when?: string; interface?: Record<string, string>;
};
export type ContextSpec = {
  version: string;
  facets: Array<{ facet: string; definition: string }>;
  facet_questions: Array<{ key: "defines_normal" | "is_cause"; question: string }>;
  checks: Array<{ key: string; question: string; how: string }>;
  stances: string[];
  own_first: { facets: string[]; note: string };
  public_issue: { package: string; questions: string[] };
};
export type FacetState = "relevant" | "irrelevant" | "undecided";

export const facetState = (notes: Notes, name: string): FacetState => {
  const found = notes.facets?.find((item) => item.facet === name);
  return !found ? "undecided" : found.relevant ? "relevant" : "irrelevant";
};

/** Mark a facet 有關 or 無關, or write one of its two answers; a facet not decided yet is added. */
export function setFacet(notes: Notes, name: string, patch: Partial<FacetNote>): Notes {
  const facets = notes.facets ?? [];
  return facets.some((item) => item.facet === name)
    ? { ...notes, facets: facets.map((item) => (item.facet === name ? { ...item, ...patch } : item)) }
    : { ...notes, facets: [...facets, { facet: name, relevant: false, ...patch }] };
}

export const removeFacet = (notes: Notes, name: string): Notes => ({ ...notes, facets: (notes.facets ?? []).filter((item) => item.facet !== name) });

/** Where this matter happened and where the people are, as the intake wrote them (no place is assumed). */
export function placesOf(intake: { happened_in?: string[]; you_are_in?: string; others_in?: string[] }): string[] {
  return [...new Set([...(intake.happened_in ?? []), intake.you_are_in ?? "", ...(intake.others_in ?? [])].map((place) => place.trim()).filter(Boolean))];
}

export const toggled = (list: string[] | undefined, value: string): string[] => ((list ?? []).includes(value) ? (list ?? []).filter((item) => item !== value) : [...(list ?? []), value]);

/** The AI's pointers the person has not acted on: a facet already ticked or marked 無關 is not pointed at again. */
export const openPointers = <P extends { facet: string }>(pointers: P[] | undefined, notes: Notes): P[] => (pointers ?? []).filter((pointer) => facetState(notes, pointer.facet) === "undecided");
