// video-unify-plan-20261116 §4 U3: a ScriptForge script becomes a workbench episode's shots -- one per scene, picture
// and every spoken line kept, stage directions out of the line (they would be read aloud).
import { describe, expect, it } from "vitest";
import { keepCharacterIds, shotsFromScript } from "../video-handoff";

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

// Card U9 (U3 leftover): a platform version of a Story Bible script keeps who speaks in each scene.
describe("keepCharacterIds", () => {
  const original = { scenes: [{ dialogue: "a", character_id: "char_1" }, { dialogue: "b", character_id: "char_2" }, { dialogue: "c" }] };
  it("keeps the version's ids the original has; an unknown or missing id takes the original's at the same place", () => {
    const version = { title: "v", scenes: [{ dialogue: "A", character_id: "char_2" }, { dialogue: "B", character_id: "小美" }, { dialogue: "C" }] };
    expect(keepCharacterIds(original, version).scenes.map((s: { character_id: string }) => s.character_id)).toEqual(["char_2", "char_2", ""]);
    expect(shotsFromScript(keepCharacterIds(original, version)).map((s) => s.character)).toEqual(["char_2", "char_2", undefined]);
  });
  it("a version with another number of scenes keeps only known ids", () => {
    const version = { scenes: [{ dialogue: "A", character_id: "char_1" }, { dialogue: "B" }] };
    expect(keepCharacterIds(original, version).scenes.map((s: { character_id: string }) => s.character_id)).toEqual(["char_1", ""]);
  });
});
