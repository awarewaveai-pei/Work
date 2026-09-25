// Command Plane shared types and runtime guards.
// Style follows existing lib/ops-inbox/types.ts (manual type guards, no external schema lib).

export type CommandSource =
  | "telegram"
  | "slack"
  | "email"
  | "webhook"
  | "schedule"
  | "internal"
  | "github";

export type ActorType = "human" | "agent" | "system";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type CommandStatus =
  | "received"
  | "validated"
  | "rejected"
  | "queued"
  | "dispatched"
  | "completed"
  | "failed"
  | "blocked_by_killswitch"
  | "blocked_by_policy";

export type SystemMode = "normal" | "maintenance" | "read_only" | "emergency_stop";

// "unavailable" is never persisted -- it is what getActiveMode returns when
// system_modes could not be read, so evaluateKillSwitch can fail closed on it.
export type ModeLookup = SystemMode | "unavailable";

export interface NormalizedCommand {
  source: CommandSource;
  sourceEventId: string;
  actorType: ActorType;
  actorRef: string | null;
  command: string;
  args: Record<string, unknown>;
  organizationId: string;
  workspaceId: string | null;
  metadata: Record<string, unknown>;
}

export interface CommandRequestRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  source: CommandSource;
  source_event_id: string;
  actor_type: ActorType;
  actor_ref: string | null;
  command: string;
  args: Record<string, unknown>;
  risk_level: RiskLevel;
  status: CommandStatus;
  workflow_run_id: string | null;
  approval_id: string | null;
  rejection_reason: string | null;
  result: Record<string, unknown>;
  trace_id: string;
  received_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

export interface RouterResult {
  traceId: string;
  status: CommandStatus;
  commandRequestId: string;
  workflowRunId?: string | null;
  approvalId?: string | null;
  reason?: string;
  result?: Record<string, unknown>;
}

export interface PolicyDecision {
  outcome: "allow" | "block" | "require_approval";
  riskLevel: RiskLevel;
  reason?: string;
}

// Minimal Telegram payload shape (we only consume what we use).
export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  is_bot?: boolean;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.update_id === "number";
}

export function getTelegramText(update: TelegramUpdate): string | null {
  // We deliberately ignore edited_message (do NOT re-execute on edits).
  return update.message?.text ?? null;
}
