// UserPromptSubmit: inject the VBC protocol into context when the prompt
// claims some other session/AI already handled something.
//
// Mechanizes the AGENTS.md trigger row 「別的 AI 處理好了 / 另一個 session 做了 X /
// 之前已經做過 / 似乎完成了 → VBC 協議（強制）」 — previously semantic-only
// (rank #8 in the 2026-07-02 audit's high-consequence semantic gap list; the
// 2026-06-04 CF-WAF false alarm is the incident class this prevents).
//
// Non-blocking by design: it injects the protocol reminder as context (the
// runner routes { context } to stdout on UserPromptSubmit, which Claude Code
// adds to the conversation). A false positive costs three lines of context.
const TRIGGERS = [
  /(別的|另一個|其他)[^\n]{0,8}(AI|ai|session|代理|視窗|窗口)/,
  /(之前|上次|昨天)[^\n]{0,6}(已經)?(做過|處理過|修過|弄好)/,
  /(已經|好像|似乎|應該)[^\n]{0,6}(處理好|完成|修好|做完)/,
  /\banother (session|claude|ai|agent)\b/i,
  /\balready (done|handled|fixed|completed)\b/i,
];

module.exports = {
  check(ctx) {
    const prompt = String(ctx.payload.prompt || '');
    if (!prompt) return null;
    if (!TRIGGERS.some((re) => re.test(prompt))) return null;
    return {
      context: [
        '[Hook][VBC] 偵測到「他方已完成」語境 — VBC 協議（AGENTS.md R4，強制）：',
        '[Hook][VBC] ① 先讀 agency-os/WORKLOG.md 最近 3 個日期區塊，找對應 [已修改] / AUTO_TASK_DONE / REALTEST_EVIDENCE，理解「做了什麼、用什麼替代方案」',
        '[Hook][VBC] ② 才做正向驗證（確認效果符合記錄）③ 禁止只查單點系統（CF API / git diff / VPS 單一服務）就宣告「沒做好」— 單層消失可能代表另一層已接手（根因：2026-06-04 CF WAF 誤報）。',
      ],
    };
  },
};
