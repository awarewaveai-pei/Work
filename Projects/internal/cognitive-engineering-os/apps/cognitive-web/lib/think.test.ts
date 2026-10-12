import { describe, expect, it } from "vitest";
import { LOOK_BACK_NOTE, askConclusionCard, lookBackCard } from "./think";

describe("THINK.ask_conclusion as code: a fixed question card", () => {
  it("asks for the conclusion, the grounds and what would change it, and puts the person's own version under the grounds without adding a conclusion", () => {
    const card = askConclusionCard(["觀察：他第三次改條件", "我不知道：他為什麼改"]);
    expect(card.map((item) => item.ask)).toEqual([
      "你現在的結論是什麼？用你自己的話寫一句。", "你的依據是什麼？是你這一輪寫的哪幾條？", "什麼會改變它？看到什麼，你就會改變這個結論？",
    ]);
    expect(card.map((item) => item.said)).toEqual([[], ["觀察：他第三次改條件", "我不知道：他為什麼改"], []]);
  });

  it("is the same every time, and says so plainly when no version of their own was kept", () => {
    expect(askConclusionCard([]).map((item) => item.ask)).toEqual(askConclusionCard(["x"]).map((item) => item.ask));
    expect(askConclusionCard([])[1].said).toEqual(["你這一輪還沒有留下自己的版本。"]);
  });
});

describe("THINK.look_back as code: fixed look-back questions", () => {
  const facts = { own: ["假設或替代解釋：他可能怕損失"], rewrittenCards: 2, confirmed: 1, rewrote: 3, denied: 0, picked: 3, pickedAsIs: 2, reflection: " 我太快相信第一個想法 " };

  it("asks what you wrote first, how many times you changed your mind and which habit you keep, with this round's facts under each", () => {
    const card = lookBackCard(facts);
    expect(card.map((item) => item.ask)).toEqual(["這一輪，你一開始先寫了什麼？", "這一輪，你換過幾次想法？", "你想留下哪個習慣、改掉哪個習慣？"]);
    expect(card[0].said).toEqual(["假設或替代解釋：他可能怕損失"]);
    expect(card[1].said).toEqual(["你改寫了 2 張 AI 給的卡。", "AI 回給你的整理，你確認了 1 次、改寫了 3 次、說「不對」0 次。"]);
    expect(card[2].said).toEqual(["你選了 3 張卡帶走，其中 2 張是 AI 的卡，你一個字沒改。", "你寫的「這次我是怎麼想的」：我太快相信第一個想法"]);
  });

  it("counts a round with nothing in it as nothing, never as a grade, and says what is missing", () => {
    const card = lookBackCard({ own: [], rewrittenCards: 0, confirmed: 0, rewrote: 0, denied: 0, picked: 0, pickedAsIs: 0 });
    expect(card[0].said).toEqual(["你這一輪沒有留下自己的版本。"]);
    expect(card[2].said[1]).toBe("你還沒寫「這次我是怎麼想的」。");
    const everything = JSON.stringify([card, LOOK_BACK_NOTE]);
    expect(everything).toContain("不是分數");
    expect(everything).not.toMatch(/強項|做得好|做得不好|過早閉合|偏差/);   // no judgment of how well they thought
  });
});
