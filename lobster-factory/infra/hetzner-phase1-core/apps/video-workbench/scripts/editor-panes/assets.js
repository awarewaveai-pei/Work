// Card ED.0: the 「素材」 left pane (spec §3 檔案歸屬: ED.4). Registered with edRegisterPane in tools-editor.js.
edRegisterPane("assets", {
  title: "素材",
  icon: "▤",
  render: (p, c) => `<h3>素材</h3>${edButton("從素材庫加入", "library")}${edButton("上傳素材", "upload")}<p class="note">影片／圖片加入 V1，音訊加入 A1。可在屬性更換軌道。</p>${p.assets.map((a) => `<div class="editor-asset">${esc(a.name || "素材")}${edButton("加入時間軸", "asset:" + a.id)}</div>`).join("")}`,
  actions: {
    "library": async (action, p, c) => {
      const kind = action.split(":")[1],
        rows = await VideoWorkbench.pickAssets({ kind: kind || "all" });
      if (rows[0] && edProject() === p)
        await edAdd(rows[0], kind === "image" ? "overlay" : undefined);
      return;
    },
    "upload": async (action, p, c) => {
      const kind = action.split(":")[1],
        input = document.createElement("input");
      input.type = "file";
      input.accept =
        kind === "image"
          ? "image/*"
          : kind === "audio"
            ? "audio/*"
            : ".mov,.mp4,.m4v,.webm,video/*,image/*,audio/*";
      input.onchange = async () => {
        try {
          if (input.files?.[0]) {
            const a = await VideoWorkbench.uploadAsset(input.files[0]);
            if (edProject() === p)
              await edAdd(a, kind === "image" ? "overlay" : undefined);
          }
        } catch (e) {
          VideoWorkbench.reportError(e);
        }
      };
      input.click();
      return;
    },
    "asset:": async (action, p, c) => {
      const a = p.assets.find((a) => String(a.id) === action.slice(6));
      if (a) await edAdd(a);
      return;
    },
  },
});
