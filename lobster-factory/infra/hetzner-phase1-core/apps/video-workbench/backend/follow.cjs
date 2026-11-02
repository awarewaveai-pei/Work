const fs = require("node:fs"),
  { inspectMedia } = require("./media-inspect.cjs"),
  { filterPath } = require("./subtitle-burn.cjs"),
  math = require("../shared/follow-math.js");
async function follow(input, { file, output, signal, run }) {
  const settings = input.settings || {},
    start = Number(settings.start),
    end = Number(settings.end),
    points = settings.points;
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(end) ||
    end - start < 5 ||
    end - start > 180 ||
    !Array.isArray(points) ||
    points.length < 2 ||
    points.length > 2000 ||
    points.some(
      (p, i) =>
        !Number.isFinite(p.time) ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.time < start - 0.001 ||
        p.time > end + 0.001 ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1 ||
        (i && p.time <= points[i - 1].time),
    )
  )
    throw Error("跟拍軌跡或片段時間無效");
  if (points[0].time > start + 0.15 || points.at(-1).time < end - 0.15)
    throw Error("追蹤軌跡沒有涵蓋完整片段，請重新追蹤");
  const source = file(input.references?.src?.url),
    info = await inspectMedia(source, signal);
  if (!info.video || !info.duration || end > info.duration + 0.05)
    throw Error("跟拍區間超出來源影片");
  const width = info.displayWidth || info.width,
    height = info.displayHeight || info.height;
  const geometry = math.crop(width, height, points[0]),
    commands = output("txt"),
    result = output("mp4"),
    lines = [];
  // One small command per output frame, avoiding enormous Windows command lines.
  for (let frame = 0; frame < Math.ceil((end - start) * 30); frame++) {
    const time = frame / 30,
      position = math.crop(width, height, math.sample(points, start + time));
    lines.push(
      `${time.toFixed(6)} crop@follow x ${position.x}, crop@follow y ${position.y};`,
    );
  }
  fs.writeFileSync(commands.file, lines.join("\n"), "utf8");
  try {
    await run(
      [
        "-y",
        "-hide_banner",
        "-ss",
        String(start),
        "-i",
        source,
        "-t",
        String(end - start),
        "-vf",
        `setpts=PTS-STARTPTS,fps=30,scale=${geometry.width}:${geometry.height},sendcmd=filename='${filterPath(commands.file)}',crop@follow=720:1280:${geometry.x}:${geometry.y},setsar=1`,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        result.file,
      ],
      signal,
    );
    return { type: "video", url: result.url, width: 720, height: 1280 };
  } finally {
    fs.rmSync(commands.file, { force: true });
  }
}
module.exports = { follow };
