import { createHash } from "node:crypto";
import { validateStoryBible } from "./story-bible";

export type StoryBibleDocument = Record<string, unknown>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalStoryBibleSha256(document: StoryBibleDocument): string {
  return createHash("sha256").update(canonical(document)).digest("hex");
}

/** Server owns organization/revision/state; browser cannot forge approval. */
export function prepareStoryBibleDraft(input: unknown, organizationId: string, revision: number): StoryBibleDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("storyBible must be an object");
  const document = { ...(input as Record<string, unknown>), organizationId, revision, state: "draft" };
  const validation = validateStoryBible(document);
  if (!validation.ok) throw new StoryBibleValidationError(validation.findings);
  return document;
}

export class StoryBibleValidationError extends Error {
  constructor(readonly findings: ReturnType<typeof validateStoryBible>["findings"]) {
    super("Story Bible v1 validation failed");
    this.name = "StoryBibleValidationError";
  }
}

export function storyBibleAssetIds(document: StoryBibleDocument): string[] {
  const ids = new Set<string>();
  const add = (value: unknown) => { if (Array.isArray(value)) for (const id of value) if (typeof id === "string") ids.add(id); };
  for (const field of ["characters", "locations", "props"]) {
    const rows = document[field];
    if (Array.isArray(rows)) for (const row of rows) if (row && typeof row === "object") add((row as Record<string, unknown>).referenceAssetIds);
  }
  const provenance = document.provenance;
  if (provenance && typeof provenance === "object") add((provenance as Record<string, unknown>).sourceArtifactIds);
  return [...ids];
}
