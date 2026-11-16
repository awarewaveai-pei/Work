// video-unify-plan-20261116 §4 U3: a ScriptForge script becomes a workbench episode's shots -- one per scene, picture
// and every spoken line kept, stage directions out of the line (they would be read aloud).
import { describe, expect, it } from "vitest";
import { shotsFromScript } from "../video-handoff";

describe("shotsFromScript", () => {
  it("one shot per scene: the picture, the whole line without stage directions, the scene's seconds", () => {
    const script = { title: "保溫杯", scenes: [
      { time: "0-3秒", visual: "清晨廚房，手倒熱水進保溫杯", dialogue: "早上五分鐘，（微笑）熱到下班。" },
      { time: "3-8秒", visual: "辦公桌上的保溫杯冒著熱氣", dialogue: "【停】你也可以。(旁白/字幕)" },
      { visual: "產品特寫", dialogue: "" },
    ] };
    expect(shotsFromScript(script)).toEqual([
      { text: "清晨廚房，手倒熱水進保溫杯", seconds: 3, line: "早上五分鐘，熱到下班。" },
      { text: "辦公桌上的保溫杯冒著熱氣", seconds: 5, line: "你也可以。" },
      { text: "產品特寫", seconds: 5, line: "" },
    ]);
  });

  it("the host script's segments are its scenes, delivery marks out of the line", () => {
    const host = { title: "主持人稿", segments: [{ duration: "0-15秒", marked_text: "大家好【停】今天【加重】只講一件事（眼神直視鏡頭）" }] };
    expect(shotsFromScript(host)).toEqual([{ text: "", seconds: 15, line: "大家好今天只講一件事" }]);
  });
});
