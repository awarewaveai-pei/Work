// Public surface of the cs-engine deep module. External callers — the Chatwoot AgentBot webhook
// route, the /ops/cs admin — import ONLY from here. Internals (db, llm, guardrails, …) stay
// private so the module can be extracted to a standalone service later (plan §2).
//
// K0 (ADR 011 §決策 3): the knowledge base is no longer re-exported from here. It is a separate
// product with its own public surface — import it from "@/lib/kb". cs is one of its consumers,
// not its owner.

export { handleInbound } from "@/lib/cs/orchestrator";
export { registerTool } from "@/lib/cs/tools";
export { loadCis } from "@/lib/cs/cis";
export { runEval, gradeIntent } from "@/lib/cs/eval";
// Ops-console CRUD (intents only — knowledge CRUD lives in "@/lib/kb").
export { loadIntents, upsertIntent, deleteIntent } from "@/lib/cs/db";

export type {
  InboundMessage,
  CsDecision,
  CsActionKind,
  HandoffReason,
  CisProfile,
  EvalSummary,
  IntentGrade,
} from "@/lib/cs/types";
