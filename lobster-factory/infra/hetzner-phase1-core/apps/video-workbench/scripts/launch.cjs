const net = require("node:net");
const { spawn } = require("node:child_process");

function portNumber(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error("PORT 必須是 0–65535 的整數");
  return port;
}
function checkPort(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
function openBrowser(url) {
  const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", `Start-Process '${url}'`], { windowsHide: true, stdio: "ignore" });
  child.on("error", () => console.error("請手動開啟：" + url));
  child.unref();
}
async function start(options = {}) {
  const port = portNumber(options.port ?? process.env.PORT ?? 4178);
  await checkPort(port);
  const createServer = options.createServer || require("../server.cjs").createServer;
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const url = "http://127.0.0.1:" + server.address().port;
  console.log("AwareWave 工作台：" + url);
  await (options.openBrowser || openBrowser)(url);
  return { server, url };
}
if (require.main === module) {
  const port = portNumber(process.env.PORT ?? 4178);
  const work = process.argv.includes("--check") ? checkPort(port) : start({ port });
  work.catch((error) => {
    console.error(error.code === "EADDRINUSE"
      ? `連接埠 ${port} 已由另一份程式使用。請關閉舊版啟動視窗，再執行這份 start.cmd。`
      : "啟動失敗：" + error.message);
    process.exitCode = 1;
  });
}
module.exports = { start, checkPort };
