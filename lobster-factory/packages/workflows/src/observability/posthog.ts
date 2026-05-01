import { PostHog } from "posthog-node";

type WorkflowEventProperties = {
  workflowId: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  siteId?: string;
  [key: string]: unknown;
};

let client: PostHog | null = null;
let initialized = false;

function getClient(): PostHog | null {
  if (initialized) {
    return client;
  }

  const apiKey = process.env.POSTHOG_API_KEY || "";
  const host = process.env.POSTHOG_HOST || "";

  if (apiKey && host) {
    client = new PostHog(apiKey, { host });
  }

  initialized = true;
  return client;
}

export function captureWorkflowEvent(
  event: string,
  properties: WorkflowEventProperties
) {
  const ph = getClient();
  if (!ph) {
    return;
  }

  ph.capture({
    distinctId: properties.organizationId ?? "system",
    event,
    properties,
  });
}

export async function shutdownPostHog() {
  if (client) {
    await client.shutdown();
  }
}
