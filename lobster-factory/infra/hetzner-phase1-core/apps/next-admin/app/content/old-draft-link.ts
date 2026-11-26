// Until U16 /content was the editor, so a saved /content?draft=<id> link opens a draft: send it to /write with the whole
// query (org, site). Kept out of page.tsx: page-names.test.ts skips the <h1> check of a page file that calls redirect().
import { redirect } from "next/navigation";

export type PageQuery = Record<string, string | string[] | undefined>;

export function redirectOldDraftLink(query: PageQuery): void {
  if (query.draft === undefined) return;
  const out = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) for (const v of [value].flat()) if (v !== undefined) out.append(name, v);
  redirect(`/write?${out}`);
}
