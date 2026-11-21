// Which My Designs source a document's saves take (ctx-contract.md "My Designs 分類"). The dock tags the document a
// handoff opened (openInCanvas saveAs: a composite → "mockup", a tarot card → its tarot source); blocks/my-designs.js
// saveToMyDesigns reads the tag of the active document (ctx.documentName). Untagged = the host's own saveTag.source.
// Keyed by document name: PhotoCraft opens a file under exactly the name it was given and has no other document id.
const tags = new Map();

export function tagDocument(name, source) {
  if (name && source) tags.set(name, source);
}

export async function documentSource(ctx) {
  if (typeof ctx.documentName !== "function") return undefined;
  try {
    return tags.get(await ctx.documentName());
  } catch {
    return undefined; // no document open: nothing to tag
  }
}
