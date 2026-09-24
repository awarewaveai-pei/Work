// Shared type guards: isTelegramUpdate (runtime validation of an untrusted webhook
// body) and getTelegramText (the edited_message exclusion is a deliberate security/
// correctness choice, not an oversight -- worth a dedicated assertion).
import { describe, expect, it } from "vitest";
import { getTelegramText, isTelegramUpdate } from "../types";

describe("isTelegramUpdate", () => {
  it("accepts a minimal valid update", () => {
    expect(isTelegramUpdate({ update_id: 1 })).toBe(true);
  });

  it("rejects null", () => {
    expect(isTelegramUpdate(null)).toBe(false);
  });

  it("rejects a non-object (string/number/array)", () => {
    expect(isTelegramUpdate("not an object")).toBe(false);
    expect(isTelegramUpdate(42)).toBe(false);
    expect(isTelegramUpdate([1, 2])).toBe(false);
  });

  it("rejects an object missing update_id", () => {
    expect(isTelegramUpdate({ message: { text: "hi" } })).toBe(false);
  });

  it("rejects an object whose update_id is not a number", () => {
    expect(isTelegramUpdate({ update_id: "1" })).toBe(false);
  });
});

describe("getTelegramText", () => {
  const chat = { id: 1, type: "private" as const };

  it("returns message.text when present", () => {
    expect(
      getTelegramText({ update_id: 1, message: { message_id: 1, chat, date: 0, text: "/status" } }),
    ).toBe("/status");
  });

  it("returns null when there is no message at all", () => {
    expect(getTelegramText({ update_id: 1 })).toBeNull();
  });

  it("returns null when message has no text field", () => {
    expect(getTelegramText({ update_id: 1, message: { message_id: 1, chat, date: 0 } })).toBeNull();
  });

  it("deliberately IGNORES edited_message -- never re-executes a command on edit", () => {
    const result = getTelegramText({
      update_id: 1,
      edited_message: { message_id: 1, chat, date: 0, text: "/drop_table" },
    });
    expect(result).toBeNull();
  });
});
