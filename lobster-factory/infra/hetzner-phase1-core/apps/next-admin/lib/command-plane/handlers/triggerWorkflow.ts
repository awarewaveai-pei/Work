// /trigger_staging_workflow <task_name> — kicks off a Trigger.dev task via REST.
// Phase 2b design: handler returns immediately after the API call. The actual
// task runs async on Trigger.dev EU. Status is observable via:
//   - Trigger.dev dashboard (https://trigger.aware-wave.com)
//   - workflow_runs table (when task wires its run record)
//   - /list_failed_runs from Telegram if it failed
//
// Allowlist constrains which tasks Telegram can launch — adding new tasks is
// an explicit operator decision, not a default capability.

import type { CommandHandler } from "../commandRouter";

const ALLOWED_TASKS = new Set<string>([
  "ao-infrastructure-check",
]);

export const triggerWorkflowHandler: CommandHandler = async (request) => {
  const raw = (request.args as { raw?: string }).raw?.trim() ?? "";
  const taskName = raw.split(/\s+/)[0] ?? "";

  if (!taskName) {
    return {
      text: [
        "⚠️ *Usage*: `/trigger_staging_workflow <task_name>`",
        "",
        `Allowed tasks: ${[...ALLOWED_TASKS].map((t) => `\`${t}\``).join(", ")}`,
      ].join("\n"),
      error: "missing_task_name",
    };
  }

  if (!ALLOWED_TASKS.has(taskName)) {
    return {
      text: [
        `🚫 *Task not allowed*: \`${taskName}\``,
        "",
        `Allowlist: ${[...ALLOWED_TASKS].map((t) => `\`${t}\``).join(", ")}`,
        "",
        "_To allowlist a new task: edit `lib/command-plane/handlers/triggerWorkflow.ts` ALLOWED_TASKS, redeploy._",
      ].join("\n"),
      error: "task_not_allowlisted",
    };
  }

  const apiUrl = process.env.TRIGGER_API_URL;
  const token = process.env.TRIGGER_ACCESS_TOKEN;
  if (!apiUrl || !token) {
    throw new Error("TRIGGER_API_URL / TRIGGER_ACCESS_TOKEN not configured in container env");
  }

  // 30s budget: Telegram webhook will retry after 60s, so we want to fail
  // fast and let the user retry from the chat rather than risk Telegram dupes.
  const triggerUrl = `${apiUrl.replace(/\/$/, "")}/api/v1/tasks/${encodeURIComponent(taskName)}/trigger`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: {
          organizationId: request.organization_id,
          triggeredBy: "command-plane",
          commandRequestId: request.id,
          actorRef: request.actor_ref,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("trigger_api_timeout: Trigger.dev did not respond within 30s");
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `trigger_api_failed: HTTP ${response.status} — ${responseText.slice(0, 300)}`,
    );
  }

  let data: { id?: string; status?: string } = {};
  try {
    data = JSON.parse(responseText);
  } catch {
    /* keep responseText as is */
  }

  return {
    text: [
      `📤 *Task queued: ${taskName}*`,
      "",
      `run_id: \`${data.id ?? "?"}\``,
      `status: \`${data.status ?? "?"}\``,
      "",
      `_Track on dashboard: ${apiUrl} or query workflow_runs._`,
    ].join("\n"),
    task_name: taskName,
    trigger_run_id: data.id ?? null,
    trigger_status: data.status ?? null,
  };
};

export const TRIGGER_WORKFLOW_ALLOWLIST = ALLOWED_TASKS;
