// Card ED.0: the 「貼圖」 left pane (spec §3 檔案歸屬: ED.7). Registered with edRegisterPane in tools-editor.js.
edRegisterPane("stickers", {
  title: "貼圖",
  icon: "▣",
  render: (p, c) => `<h3>貼圖／品牌圖</h3>${edButton("選擇圖片", "library:image")}${edButton("上傳透明 PNG", "upload:image")}<p class="note">以主影片軌之上的影片軌疊加圖片，可設定時間、位置、大小與透明度。</p>`,
});
