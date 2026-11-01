function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
function assColor(rgb, alpha = "00") {
  return "&H" + alpha + rgb.slice(5, 7) + rgb.slice(3, 5) + rgb.slice(1, 3);
}
function buildAss(settings) {
  const cues = settings.cues;
  if (
    !Array.isArray(cues) ||
    !cues.length ||
    cues.length > 2000 ||
    cues.some(
      (c) =>
        !Number.isFinite(c.start) ||
        c.start < 0 ||
        !Number.isFinite(c.end) ||
        c.end <= c.start ||
        c.end > 7200 ||
        typeof c.text !== "string" ||
        c.text.length > 4000,
    )
  )
    throw Error("字幕時間或內容格式無效");
  const width = Number(settings.width) || 1280,
    height = Number(settings.height) || 720,
    size = Number(settings.size ?? 52);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 8192 ||
    height > 8192 ||
    !Number.isFinite(size) ||
    size < 20 ||
    size > 100
  )
    throw Error("字幕畫面或大小無效");
  const style = settings.style || "白字黑邊",
    position = settings.position || "下方";
  if (
    ![
      "白字黑邊",
      "白字灰底",
      "半透明底框",
      "黑底白字",
      "白底黑字",
      "白字陰影",
      "黃字黑邊",
    ].includes(style) ||
    !["下方", "中下", "中間", "上方"].includes(position)
  )
    throw Error("字幕樣式無效");
  let color = /^#[\da-f]{6}$/i.test(settings.color || "")
    ? settings.color
    : "#ffffff";
  if (style === "黃字黑邊") color = "#facc15";
  if (style === "白底黑字") color = "#111111";
  const box = ["白字灰底", "半透明底框", "黑底白字", "白底黑字"].includes(
      style,
    ),
    border = ["白字黑邊", "黃字黑邊"].includes(style) ? 2 : box ? 6 : 0;
  const back =
    style === "白底黑字"
      ? assColor("#ffffff")
      : style === "白字灰底"
        ? assColor("#666666", "55")
        : style === "黑底白字"
          ? assColor("#000000")
          : assColor("#000000", "88");
  const alignment = position === "上方" ? 8 : position === "中間" ? 5 : 2,
    margin = Math.round(
      height * (position === "下方" ? 0.1 : position === "中下" ? 0.25 : 0.08),
    );
  const font =
    process.platform === "win32" ? "Microsoft JhengHei" : "sans-serif";
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${font},${Math.round((height * size) / 1000)},${assColor(color)},${assColor(color)},${box ? back : assColor("#000000")},${back},0,0,0,0,100,100,0,0,${box ? 3 : 1},${border},${style === "白字陰影" ? 3 : 0},${alignment},20,20,${margin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return (
    header +
    cues
      .filter((cue) => cue.text.trim())
      .map(
        (cue) =>
          `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${cue.text.replace(/\\/g, "＼").replace(/{/g, "｛").replace(/}/g, "｝").replace(/\r?\n/g, "\\N")}`,
      )
      .join("\n") +
    "\n"
  );
}
function filterPath(file) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}
module.exports = { buildAss, filterPath, assTime, assColor };
