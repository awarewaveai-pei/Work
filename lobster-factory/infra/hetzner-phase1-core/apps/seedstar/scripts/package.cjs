const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const blocked = /^(?:\.data|\.git|\.env(?:\..*)?|\.npmrc|\.mcp\.json|mcp\.json|config\.toml|\.credentials\.json)$/i;
function include(file) {
  return !blocked.test(path.basename(file)) && !/\.(pem|key|pfx|p12|log)$/i.test(file) && !fs.lstatSync(file).isSymbolicLink();
}

(async () => {
  const args = process.argv.slice(2), lite = args.includes("--lite");
  const destination = path.resolve(args.find((arg) => arg !== "--lite") || "SeedStar_AwareWave.zip");
  if (fs.existsSync(destination)) throw Error("Output already exists: " + destination);
  const appDir = require("../backend/appearance.cjs").resolveSource(root, process.env);
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "awarewave-release-"));
  const content = path.join(build, "content"), app = path.join(content, "SeedStar-app");
  fs.mkdirSync(app, { recursive: true });
  for (const name of ["index.html", "server.cjs", "config.js", "package.json", "package-lock.json", "start.cmd", "README.md", "LICENSE-DOMPURIFY", "assets", "backend", "pages", "scripts", "shared", "styles", "tests", "docs", ...(lite ? [] : ["node_modules"])])
    fs.cpSync(path.join(root, name), path.join(app, name), { recursive: true, filter: include });
  if (!lite && !fs.existsSync(path.join(app, "node_modules/ffmpeg-static/ffmpeg.exe"))) throw Error("Install the Windows runtime dependencies before packaging");
  const sourceFiles = [
    "app/globals.css", "public/awarewave/forms.css", "lib/theme/tokens.ts", "lib/theme/fonts.ts",
    "lib/theme/__tests__/tokens-match-globals.test.ts", "app/__tests__/sidebar-coverage.test.ts",
    "components/tools/AwareWaveThemeFrame.tsx", "app/(shell)/tools/seedstar/page.tsx",
    "app/(shell)/tools/theme/page.tsx", "app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md",
  ];
  const manifest = { source: "AwareWave", mode: lite ? "lite" : "offline", node: process.version, files: {} };
  for (const name of sourceFiles) {
    const source = path.join(appDir, name), target = path.join(content, "AwareWave-source", name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    manifest.files[name] = sha(source);
  }
  fs.writeFileSync(path.join(app, "awarewave-source.json"), JSON.stringify({ appDir, bundledAppDir: "../AwareWave-source" }, null, 2));
  if (!lite) {
    const runtime = path.join(app, "runtime");
    fs.mkdirSync(runtime);
    fs.copyFileSync(process.execPath, path.join(runtime, "node.exe"));
    const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
    const response = await fetch(licenseUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error("Could not retrieve the Node.js license: " + response.status);
    fs.writeFileSync(path.join(runtime, "LICENSE-node.txt"), await response.text());
    manifest.nodeLicenseSource = licenseUrl;
    manifest.nodeSha256 = sha(path.join(runtime, "node.exe"));
  } else {
    const readme = path.join(app, "README.md");
    fs.writeFileSync(readme, fs.readFileSync(readme, "utf8").replace(/解壓縮整個壓縮檔後執行[^\n]+/, "這是輕量版。解壓縮後執行 SeedStar-app/start.cmd；需已安裝 Node.js 18 以上，第一次啟動會連網安裝 FFmpeg 與執行套件。完成後自動開啟 http://127.0.0.1:4178；啟動視窗使用期間保持開啟。"));
  }
  fs.writeFileSync(path.join(content, "build-manifest.json"), JSON.stringify(manifest, null, 2));
  const setup = lite ? "需先安裝 Node.js 18 以上；第一次啟動會連網安裝 FFmpeg 與執行套件。" : "本包已附 Windows 64 位元 Node.js 與 FFmpeg，不需另裝套件。";
  fs.writeFileSync(path.join(content, "開啟方式.txt"), "\ufeff解壓縮整個資料夾，再雙擊 SeedStar-app\\start.cmd。\r\n啟動視窗使用期間保持開啟。若已有舊版服務，先關閉舊版啟動視窗。\r\n" + setup + "\r\n優先連結本機 AwareWave 原始碼；無原始碼時使用包內由同一來源匯出的樣式。\r\nAwareWave-source 是主系統此次整合的來源匯出，不是完整的主系統；不會自動修改或部署主系統。\r\n包內沒有金鑰、使用者資料、生成檔案。AI 服務仍由伺服器環境設定。\r\n");
  const result = spawnSync("python", ["-c", "import pathlib,sys,zipfile; root=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6); [z.write(p,p.relative_to(root).as_posix()) for p in sorted(root.rglob('*')) if p.is_file()]; z.close()", content, destination], { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr || "ZIP creation failed");
  console.log(JSON.stringify({ zip: destination, bytes: fs.statSync(destination).size, sha256: sha(destination), staging: content }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
