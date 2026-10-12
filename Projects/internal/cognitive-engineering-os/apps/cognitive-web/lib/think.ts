// THINK's two fixed cards: asking the person for their own conclusion, and the look back at how they thought. They were the AI turns
// ask_conclusion and look_back until 2026-10-12; they are the system's own fixed questions now (docs/platform/AI_TO_CODE_AUDIT.md §1), so
// they cost no credits. The questions are the same every time. What stands under them is only what the person wrote and did this round,
// counted or quoted as it is -- never a score, a grade, a judgment of how well they thought, or a conclusion for them.

export type Question = { ask: string; said: string[] };

/** 請你自己下結論: the three questions (conclusion, grounds, what would change it), with the person's own version quoted under the grounds. */
export function askConclusionCard(own: string[]): Question[] {
  return [
    { ask: "你現在的結論是什麼？用你自己的話寫一句。", said: [] },
    { ask: "你的依據是什麼？是你這一輪寫的哪幾條？", said: own.length ? own : ["你這一輪還沒有留下自己的版本。"] },
    { ask: "什麼會改變它？看到什麼，你就會改變這個結論？", said: [] },
  ];
}

export type LookBackFacts = {
  own: string[];            // the person's own version of the round, as written
  rewrittenCards: number;   // AI cards the person rewrote
  confirmed: number; rewrote: number; denied: number;   // their answers to the AI's replies of the round: 確認, 改寫, 否定
  picked: number; pickedAsIs: number;   // cards picked, and those among them that are the AI's and untouched
  reflection?: string;      // 這次我是怎麼想的, if written
};

/** 回看你怎麼想: three fixed questions -- what you wrote first, how many times you changed your mind, which habit you keep -- each with the
 *  facts of this round under it, and a last line saying the facts are not a score. */
export function lookBackCard(facts: LookBackFacts): Question[] {
  return [
    { ask: "這一輪，你一開始先寫了什麼？", said: facts.own.length ? facts.own : ["你這一輪沒有留下自己的版本。"] },
    { ask: "這一輪，你換過幾次想法？", said: [
      `你改寫了 ${facts.rewrittenCards} 張 AI 給的卡。`,
      `AI 回給你的整理，你確認了 ${facts.confirmed} 次、改寫了 ${facts.rewrote} 次、說「不對」${facts.denied} 次。`,
    ] },
    { ask: "你想留下哪個習慣、改掉哪個習慣？", said: [
      `你選了 ${facts.picked} 張卡帶走，其中 ${facts.pickedAsIs} 張是 AI 的卡，你一個字沒改。`,
      facts.reflection?.trim() ? `你寫的「這次我是怎麼想的」：${facts.reflection.trim()}` : "你還沒寫「這次我是怎麼想的」。",
    ] },
  ];
}

/** Said under the look back: it lists what the person did; it grades nothing. */
export const LOOK_BACK_NOTE = "這些只是把你這一輪做過的列出來，不是分數，也不跟任何人比。想留下或改掉的，寫在下面「這次我是怎麼想的」。";
