import { describe, expect, it } from "vitest";
import { matchFaq, sanitizeFaq } from "@/lib/cs/faq";

const COURSES = { id: "courses", keywords: ["課程", "療癒模組", "上課"], answer: "我們有四個療癒模組……" };
const BOOKING = { id: "booking", keywords: ["預約", "上課", "時間"], answer: "預約請……" };
const SHIRT = { id: "shirt", keywords: ["T恤", "衣服"], answer: "T 恤……" };

describe("matchFaq", () => {
  it("the entry with the most keywords in the message wins", () => {
    expect(matchFaq([COURSES, BOOKING], "請問你們有哪些療癒課程？")?.id).toBe("courses");
    expect(matchFaq([COURSES, BOOKING], "想預約，上課時間是？")?.id).toBe("booking");
  });

  it("a tie for the best match is nobody's answer", () => {
    expect(matchFaq([COURSES, BOOKING], "上課")).toBeNull();
  });

  it("no keyword, no answer", () => {
    expect(matchFaq([COURSES], "你好")).toBeNull();
    expect(matchFaq([COURSES], "")).toBeNull();
  });

  it("full-width and case differences still match", () => {
    expect(matchFaq([SHIRT], "請問Ｔ恤有哪些尺寸")?.id).toBe("shirt");
    expect(matchFaq([SHIRT], "t恤多少")?.id).toBe("shirt");
  });

  it("money, legal and complaint messages always go to a human", () => {
    expect(matchFaq([COURSES], "課程可以退款嗎")).toBeNull();
    expect(matchFaq([COURSES], "我要投訴這個課程")).toBeNull();
  });

  it("full-width spelling does not get past the human-only words", () => {
    expect(matchFaq([COURSES], "課程可以ｒｅｆｕｎｄ嗎")).toBeNull();
  });

  it("an entry with a blank answer never matches", () => {
    expect(matchFaq([{ ...COURSES, answer: " " }], "課程")).toBeNull();
  });
});

describe("sanitizeFaq", () => {
  it("drops entries without keywords or answer, trims, dedupes keywords and ids", () => {
    const out = sanitizeFaq([
      { id: "a", keywords: [" 課程 ", "課程", ""], answer: " 答 ", handoff: true },
      { id: "a", keywords: ["預約"], answer: "答二" },
      { keywords: [], answer: "沒有關鍵字" },
      { keywords: ["x"], answer: "" },
      "junk",
    ]);
    expect(out).toEqual([
      { id: "a", keywords: ["課程"], answer: "答", handoff: true },
      { id: "faq-2", keywords: ["預約"], answer: "答二" },
    ]);
  });

  it("non-arrays are empty", () => {
    expect(sanitizeFaq(undefined)).toEqual([]);
    expect(sanitizeFaq({})).toEqual([]);
  });
});
