// Public surface of the cs-engine deep module. External callers — the Chatwoot AgentBot webhook
// route, the /ops/cs admin, knowledge-ingestion jobs — import ONLY from here. Internals (db, llm,
// guardrails, …) stay private so the module can be extracted to a standalone service later (plan §2).

export { handleInbound } from "@/lib/cs/orchestrator";
export { ingestKnowledge, retrieve, getEmbeddingProvider, setEmbeddingProvider } from "@/lib/cs/rag";
export { registerTool } from "@/lib/cs/tools";
export { loadCis } from "@/lib/cs/cis";
export { runEval, gradeIntent } from "@/lib/cs/eval";
// Ops-console CRUD (data-entry surfaces — knowledge + intents).
export { loadIntents, upsertIntent, deleteIntent, listKnowledgeSources, deleteKnowledgeSource } from "@/lib/cs/db";

export type {
  InboundMessage,
  CsDecision,
  CsActionKind,
  HandoffReason,
  KnowledgeInput,
  EmbeddingProvider,
  CisProfile,
  EvalSummary,
  IntentGrade,
} from "@/lib/cs/types";
