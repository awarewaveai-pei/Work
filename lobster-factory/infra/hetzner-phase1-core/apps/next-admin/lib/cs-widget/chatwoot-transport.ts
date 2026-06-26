// Real Chatwoot Client API + ActionCable transport (_uiux_design.md §3.2, Pattern A consumer side).
// Flow: create contact → create conversation → send messages via REST; subscribe to RoomChannel over
// WebSocket (pubsub_token) for live message.created / typing / status events. Caches the contact
// identifier + pubsub_token + conversation id in localStorage so a returning visitor resumes.
//
// ⚠️ Browser-only (localStorage + WebSocket). Code-complete against the documented Client API but
// NOT exercised — wires live once Chatwoot is deployed (U6). Endpoints per Chatwoot docs:
//   POST /public/api/v1/inboxes/:inbox/contacts
//   POST /public/api/v1/inboxes/:inbox/contacts/:contact/conversations
//   POST /public/api/v1/inboxes/:inbox/contacts/:contact/conversations/:id/messages

import type { ContentType, WidgetConfig, WidgetEvent, WidgetMessage, WidgetTransport } from "@/lib/cs-widget/types";

interface ChatwootContact {
  source_id: string;
  pubsub_token: string;
}

function lsKey(inbox: string, suffix: string): string {
  return `cs_widget:${inbox}:${suffix}`;
}

function mapSender(m: { message_type?: number; sender?: { type?: string } }): WidgetMessage["sender"] {
  // Chatwoot: message_type 0 = incoming (customer), 1 = outgoing (agent/bot).
  if (m.message_type === 0) return "user";
  return m.sender?.type === "agent_bot" ? "bot" : "agent";
}

export class ChatwootTransport implements WidgetTransport {
  private cfg: WidgetConfig;
  private contact: ChatwootContact | null = null;
  private conversationId: number | null = null;
  private ws: WebSocket | null = null;
  private onEvent: ((e: WidgetEvent) => void) | null = null;

  constructor(cfg: WidgetConfig) {
    this.cfg = cfg;
  }

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/$/, "")}/public/api/v1/inboxes/${this.cfg.inboxIdentifier}${path}`;
  }

  private async postJson<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`chatwoot_${res.status}`);
    return (await res.json()) as T;
  }

  private async ensureContact(): Promise<ChatwootContact> {
    if (this.contact) return this.contact;
    const cachedId = localStorage.getItem(lsKey(this.cfg.inboxIdentifier, "contact"));
    const cachedToken = localStorage.getItem(lsKey(this.cfg.inboxIdentifier, "pubsub"));
    if (cachedId && cachedToken) {
      this.contact = { source_id: cachedId, pubsub_token: cachedToken };
      return this.contact;
    }
    const c = await this.postJson<ChatwootContact>("/contacts");
    localStorage.setItem(lsKey(this.cfg.inboxIdentifier, "contact"), c.source_id);
    localStorage.setItem(lsKey(this.cfg.inboxIdentifier, "pubsub"), c.pubsub_token);
    this.contact = c;
    return c;
  }

  private async ensureConversation(): Promise<number> {
    if (this.conversationId != null) return this.conversationId;
    const cached = localStorage.getItem(lsKey(this.cfg.inboxIdentifier, "conversation"));
    if (cached) {
      this.conversationId = Number(cached);
      return this.conversationId;
    }
    const contact = await this.ensureContact();
    const conv = await this.postJson<{ id: number }>(`/contacts/${contact.source_id}/conversations`);
    localStorage.setItem(lsKey(this.cfg.inboxIdentifier, "conversation"), String(conv.id));
    this.conversationId = conv.id;
    return conv.id;
  }

  async connect(onEvent: (e: WidgetEvent) => void): Promise<void> {
    this.onEvent = onEvent;
    const contact = await this.ensureContact();
    await this.ensureConversation();

    const wsBase = this.cfg.baseUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const ws = new WebSocket(`${wsBase}/cable`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        command: "subscribe",
        identifier: JSON.stringify({ channel: "RoomChannel", pubsub_token: contact.pubsub_token }),
      }));
    };
    ws.onmessage = (ev) => this.handleWs(ev.data);
    ws.onerror = () => this.onEvent?.({ type: "error", reason: "ws_error" });
  }

  private handleWs(raw: string): void {
    let frame: { type?: string; message?: { event?: string; data?: Record<string, unknown> } };
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame.type === "welcome") return this.onEvent?.({ type: "connected" });
    if (frame.type === "ping" || frame.type === "confirm_subscription") return;
    const inner = frame.message;
    if (!inner?.event) return;
    const data = inner.data ?? {};
    switch (inner.event) {
      case "message.created": {
        const sender = mapSender(data as { message_type?: number; sender?: { type?: string } });
        if (sender === "user") return; // our own echo — already shown optimistically
        const msg: WidgetMessage = {
          id: String(data.id ?? Date.now()),
          sender,
          text: typeof data.content === "string" ? data.content : "",
          contentType: ((data.content_type as ContentType) ?? "text"),
          content: data.content_attributes,
          createdAt: Date.now(),
          isAiReply: sender === "bot",
        };
        this.onEvent?.({ type: "message", message: msg });
        break;
      }
      case "conversation.typing_on":
        this.onEvent?.({ type: "typing", on: true });
        break;
      case "conversation.typing_off":
        this.onEvent?.({ type: "typing", on: false });
        break;
      case "conversation.status_changed":
        this.onEvent?.({ type: "status", status: (data.status as "open" | "pending" | "resolved") ?? "pending" });
        break;
      default:
        break;
    }
  }

  async sendText(text: string): Promise<void> {
    const contact = await this.ensureContact();
    const convId = await this.ensureConversation();
    await this.postJson(`/contacts/${contact.source_id}/conversations/${convId}/messages`, { content: text });
  }

  async sendPostback(payload: string): Promise<void> {
    // Chatwoot client API has no dedicated postback endpoint — send the payload as message content;
    // the AgentBot interprets it (input_select / card postback). Label is shown optimistically by UI.
    await this.sendText(payload);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.onEvent = null;
  }
}
