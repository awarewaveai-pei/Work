import type { Incident, NotificationRule, NotificationStatus } from "../types";

export interface NotificationContext {
  incident: Incident;
  rule: NotificationRule;
  publicUrl: string;
}

export interface NotificationResult {
  status: NotificationStatus;
  reason?: string;
  externalRef?: string;
  error?: string;
}

export interface Notifier {
  readonly id: string;
  send(ctx: NotificationContext): Promise<NotificationResult>;
}
