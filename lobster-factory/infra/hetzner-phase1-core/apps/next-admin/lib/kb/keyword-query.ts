// Turning a person's question into something the keyword half can actually match.
//
// THE BUG THIS EXISTS TO FIX: retrieval passed the raw question straight to the keyword search,
// which matched it as one literal string (`strpos(content, '請問退貨運費要怎麼算')`). No chunk ever
// contains a whole question, so the keyword half returned nothing for essentially every real query
// and hybrid retrieval was vector-only in practice — silently, because "no keyword hits" and "this
// half is broken" look identical from the outside.
//
// WHY BIGRAMS FOR CJK: Chinese has no spaces, so there is nothing to split on, and Postgres' own
// full-text search does not segment it (migration 0051 said so and left the column unused for four
// months). PGroonga indexes CJK as character bigrams, so the query side must be bigrams too:
// 退貨運費 → 退貨, 貨運, 運費. A chunk matching more of them scores higher, which is the ranking the
// old ORDER BY last_modified never had.
//
// Latin words are kept whole — bigramming "shipping" into sh/hi/ip would match every English page.

/** PGroonga query syntax. Left in place, user text would be read as operators, not as words. */
const SYNTAX = /[()"'\\+\-|*:~<>=]/g;

/** One CJK character (Han, kana, Hangul). Ranges chosen to match what PGroonga bigram-tokenises. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

/**
 * Words too common to narrow anything down. Deliberately tiny: a long stopword list is a language
 * model in disguise, and dropping a word that mattered is worse than keeping one that did not —
 * PGroonga scores by how many terms matched, so a noise term costs rank, not correctness.
 */
const NOISE = new Set(["the", "and", "for", "with", "how", "what", "does", "can", "you", "your", "our"]);

/** Longest sensible query. Beyond this the OR list stops helping and starts costing. */
const MAX_TERMS = 32;

/**
 * Build a PGroonga query-syntax string from a user's question.
 * Returns "" when nothing usable is left — the caller must then SKIP the keyword half rather than
 * send an empty query, which would either error or match everything.
 */
export function buildKeywordQuery(query: string): string {
  const cleaned = query.replace(SYNTAX, " ");
  const terms: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    const term = t.trim();
    if (!term || seen.has(term) || terms.length >= MAX_TERMS) return;
    seen.add(term);
    terms.push(term);
  };

  // Split into runs of CJK and runs of everything else, so each is handled its own way.
  let run = "";
  let runIsCjk = false;
  const flush = () => {
    if (!run) return;
    if (runIsCjk) {
      // A single character on its own is kept: 貓 is a word, and dropping it would lose the query.
      if (run.length === 1) push(run);
      else for (let i = 0; i + 1 < run.length; i++) push(run.slice(i, i + 2));
    } else {
      for (const w of run.split(/[^\p{L}\p{N}]+/u)) {
        const word = w.toLowerCase();
        if (word.length >= 2 && !NOISE.has(word)) push(word);
      }
    }
    run = "";
  };

  for (const ch of cleaned) {
    const isCjk = CJK.test(ch);
    if (isCjk !== runIsCjk) {
      flush();
      runIsCjk = isCjk;
    }
    run += ch;
  }
  flush();

  return terms.join(" OR ");
}
