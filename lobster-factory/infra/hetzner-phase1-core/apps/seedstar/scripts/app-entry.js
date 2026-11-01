(async function () {
  function message(title, lines) {
    const panel = document.createElement("main"), heading = document.createElement("h1");
    panel.style.cssText = "max-width:42rem;margin:8vh auto;padding:2rem;height:auto;overflow:visible;font:18px/1.7 system-ui;color:CanvasText;background:Canvas";
    heading.textContent = title;
    panel.append(heading);
    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      panel.append(p);
    }
    document.body.replaceChildren(panel);
  }
  if (location.protocol === "file:") {
    message("請從 start.cmd 啟動工作台", [
      "這個頁面需要本機服務才能使用。",
      "回到這個 index.html 所在的資料夾，雙擊 start.cmd。啟動成功後會自動開啟工作台。",
      "若啟動視窗提示 4178 已被占用，請先關閉舊版的啟動視窗，再重新啟動新版。",
    ]);
    return;
  }
  try {
    for (const file of ["config.js", "shared/models.js", "shared/adapters.js", "shared/purify.js", "shared/runtime.js", "shared/security.js", "shared/theme.js", "shared/jobs-view.js", "shared/workflows.js", "shared/assets-ui.js", "scripts/index-boot.js"]) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL(file, document.baseURI).href;
        script.onload = resolve;
        script.onerror = () => reject(Error("無法載入 " + file));
        document.body.append(script);
      });
    }
  } catch (error) {
    message("工作台載入失敗", [error.message, "請確認整個壓縮檔已解壓縮，關閉舊版服務後，再執行這個資料夾的 start.cmd。"]);
  }
})();
