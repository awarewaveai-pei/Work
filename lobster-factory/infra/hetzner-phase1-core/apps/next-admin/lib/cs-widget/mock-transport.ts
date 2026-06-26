// Local mock transport — a scripted bot so the widget UI renders, animates, and is testable WITHOUT
// Chatwoot (which only exists once the big-memory machine is up, U6). Mirrors the demo conversation
// flow: greeting + quick replies → order card / policy / hours / human handoff.

import type { WidgetEvent, WidgetMessage, WidgetTransport } from "@/lib/cs-widget/types";

let seq = 0;
const nextId = () => `mock-${++seq}`;

function botText(text: string, isAiReply = true): WidgetMessage {
  return { id: nextId(), sender: "bot", text, contentType: "text", createdAt: Date.now(), isAiReply };
}

export class MockTransport implements WidgetTransport {
  private onEvent: ((e: WidgetEvent) => void) | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  private emit(e: WidgetEvent): void {
    this.onEvent?.(e);
  }
  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }
  private typeThen(ms: number, msg: WidgetMessage): void {
    this.emit({ type: "typing", on: true });
    this.later(ms, () => {
      this.emit({ type: "typing", on: false });
      this.emit({ type: "message", message: msg });
    });
  }

  async connect(onEvent: (e: WidgetEvent) => void): Promise<void> {
    this.onEvent = onEvent;
    this.emit({ type: "connected" });
    this.later(300, () => {
      this.emit({ type: "message", message: botText("嗨，我是 AwareWave 小幫手，很高興為你服務。想先了解哪一項呢？", true) });
      this.emit({
        type: "message",
        message: {
          id: nextId(), sender: "bot", contentType: "input_select", createdAt: Date.now(),
          content: [
            { title: "查訂單狀態", value: "order_status" },
            { title: "退換貨政策", value: "return_policy" },
            { title: "營業時間", value: "hours" },
            { title: "想找真人", value: "human" },
          ],
        },
      });
    });
  }

  async sendText(text: string): Promise<void> {
    this.respond(text);
  }
  async sendPostback(payload: string): Promise<void> {
    this.respond(payload);
  }

  private respond(input: string): void {
    if (input.includes("order_status") || input.includes("訂單")) {
      this.typeThen(1100, {
        id: nextId(), sender: "bot", contentType: "cards", createdAt: Date.now(), isAiReply: true,
        text: "好的，幫你查到最近一筆訂單：",
        content: [{
          title: "訂單 #AW-20847",
          description: "已出貨 · 預計 6/27 送達",
          actions: [{ type: "link", text: "追蹤物流", uri: "https://example.com/track/AW-20847" }],
        }],
      });
    } else if (input.includes("return_policy") || input.includes("退換")) {
      this.typeThen(1000, botText("我們提供 7 天鑑賞期，商品保持全新可申請退換；客製商品除瑕疵外恕不退換。需要我幫你開啟退換流程嗎？"));
    } else if (input.includes("hours") || input.includes("營業")) {
      this.typeThen(900, botText("線上 AI 客服全天候即時回覆；真人專員服務時間為週一至週五 10:00–18:00（台北時間）。"));
    } else if (input.includes("human") || input.includes("真人")) {
      this.typeThen(700, botText("沒問題，正在為你轉接真人專員…", false));
      this.later(1600, () => this.emit({ type: "status", status: "open" }));
    } else {
      this.typeThen(1000, botText("我了解你的問題了。根據我們的資料，這通常可以這樣處理…若需要更精確的協助，我也能立刻為你轉接真人專員。"));
    }
  }

  disconnect(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.onEvent = null;
  }
}
