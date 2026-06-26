// cs-widget — headless customer chat widget that talks to Chatwoot's Client API (NOT the default
// iframe widget, which is style-locked — _uiux_design.md §3.1). Transport-abstracted so the same UI
// runs against a MockTransport (local render/test, no backend) or the real ChatwootTransport
// (Client API + ActionCable WebSocket). Design language = 清新自然 (_uiux_design.md §1–2).
// ⚠️ Code-complete but NOT live until Chatwoot is deployed on the big-memory machine (U6).

export type Sender = "user" | "agent" | "bot";

export type ContentType = "text" | "input_select" | "cards" | "form" | "article";

// Chatwoot interactive content blocks, rendered headless (_uiux_design.md §3.3).
export interface InputSelectItem {
  title: string;
  value: string;
}
export interface CardAction {
  type: "link" | "postback";
  text: string;
  uri?: string;
  payload?: string;
}
export interface Card {
  title: string;
  description?: string;
  mediaUrl?: string;
  actions: CardAction[];
}
export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "select";
  options?: string[];
}
export interface ArticleItem {
  title: string;
  url: string;
}

export interface WidgetMessage {
  id: string;
  sender: Sender;
  text?: string;
  contentType: ContentType;
  /** Structured payload for non-text content types (InputSelectItem[] | Card[] | FormField[] | ArticleItem[]). */
  content?: unknown;
  createdAt: number;
  /** Marks an AI-generated reply (transparency badge "AI 已回"). */
  isAiReply?: boolean;
}

export type WidgetEvent =
  | { type: "connected" }
  | { type: "message"; message: WidgetMessage }
  | { type: "typing"; on: boolean }
  | { type: "status"; status: "open" | "pending" | "resolved" } // open = a human agent took over
  | { type: "error"; reason: string };

/** Transport abstraction — implemented by ChatwootTransport (real) and MockTransport (local). */
export interface WidgetTransport {
  connect(onEvent: (e: WidgetEvent) => void): Promise<void>;
  sendText(text: string): Promise<void>;
  sendPostback(payload: string, label: string): Promise<void>;
  disconnect(): void;
}

export interface WidgetConfig {
  /** Chatwoot host, e.g. https://support.aware-wave.com */
  baseUrl: string;
  /** Web-widget API inbox identifier (from the Chatwoot inbox settings). */
  inboxIdentifier: string;
  /** CIS standard primary colour (#hex) → derives the whole 清新自然 palette. */
  brandSeed?: string;
  mode?: "light" | "dark";
  /** csVoice persona (BI/MI). */
  personaName?: string;
  greeting?: string;
}
