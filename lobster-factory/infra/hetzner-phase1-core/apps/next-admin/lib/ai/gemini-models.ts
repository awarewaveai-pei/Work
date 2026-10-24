// Google retires Gemini model ids: gemini-2.0-flash-lite answered 404 "no longer available" (2026-10-24) while it was
// spelled in three files whose paths rarely run, so nothing failed loudly. One id here; its price is in cost-model.ts
// (a test fails if it is missing). Changing it = this line + that price row. 3.5, not the cheaper 3.1: on 2026-10-24
// five calls each, 3.1 took 1.2-8.1 s with one failure, 3.5 a steady 3.4-5.0 s -- both callers are fallbacks.
export const GEMINI_LITE_MODEL = "gemini-3.5-flash-lite";
