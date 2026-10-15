// Every row of a select. PostgREST stops one select at its row cap (1000 here) without saying so; a list read
// through one call silently loses the rest.

type PgError = { code?: string; message: string };

export const PAGE = 1000;

/** `page(from, to)` = the same select with .range(from, to) and a stable .order(); `onError` throws its own error. */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PgError | null }>,
  onError: (error: PgError) => never,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) onError(error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
