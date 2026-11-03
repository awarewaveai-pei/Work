(function () {
  VideoWorkbench.convertSubtitles = (input, type) => {
    const source = String(input)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/^WEBVTT[^\n]*\n+/, "");
    const blocks = source
      .trim()
      .split(/\n\s*\n/)
      .filter((x) => x.includes("-->"))
      .map((block) => {
        const lines = block.split("\n"),
          index = lines.findIndex((x) => x.includes("-->"));
        const timing = lines[index].replace(
          /(\d{2}:\d{2}:\d{2})[,.](\d{3})/g,
          (_, a, b) => a + (type === "vtt" ? "." : ",") + b,
        );
        return [timing, ...lines.slice(index + 1)].join("\n");
      });
    if (!blocks.length) throw Error("請輸入含時間碼的 SRT 或 VTT 字幕");
    return type === "vtt"
      ? "WEBVTT\n\n" + blocks.join("\n\n") + "\n"
      : blocks.map((x, i) => i + 1 + "\n" + x).join("\n\n") + "\n";
  };
})();
