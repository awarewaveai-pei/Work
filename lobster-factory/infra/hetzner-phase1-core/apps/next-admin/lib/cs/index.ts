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
export { runEval, gradeIntent, examIntent } from "@/lib/cs/eval";
// Ops-console CRUD (intents only — knowledge CRUD lives in "@/lib/kb").
export { loadIntents, loadIntent, upsertIntent, updateIntent, deleteIntent, graduationOf, loadIntentMetadata, setIntentGraduation, loadGraduations, listEvalCases, replaceEvalCases, loadEvalCases, loadEvalCasesByIntent, rowGraduated, knowledgeFloorOf, loadKnowledgeFloor } from "@/lib/cs/db";
export type { IntentFields, EvalCaseRow } from "@/lib/cs/db";
export { ACTION_LEVELS, ANSWER_LEVELS, examInFlight, intentBehavior, parseEvalCases, parseIntentPatch } from "@/lib/cs/intent-config";
export { applyChatwootBaseline, desiredChatwootBaseline, planChatwootBaseline, AUTO_RESOLVE_MINUTES, CLOSING_MACRO_NAME } from "@/lib/cs/chatwoot-baseline";
export type { BaselineChange } from "@/lib/cs/chatwoot-baseline";

export type {
  InboundMessage,
  CsDecision,
  CsActionKind,
  HandoffReason,
  CisProfile,
  EvalSummary,
  IntentGrade,
  IntentGraduation,
  EvalCase,
} from "@/lib/cs/types";
