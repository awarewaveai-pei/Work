async function openLibrary(kind, target) {
  try {
    close();
    const bucket = target || "images",
      current = state.refs[state.mode][bucket];
    if (!current) throw Error("此模式不支援這類素材");
    const cap = max[state.mode][bucket] || 1;
    if (current.length >= cap) throw Error("參考素材已達上限，請先移除");
    const picked = await SeedStar.pickAssets({
      kind,
      multiple: true,
      limit: cap - current.length,
      sources: kind === "image",
      parityControls: true,
    });
    current.push(
      ...picked.map((a) => ({
        ...a,
        type: a.type || SeedStar.mediaKind(a) + "/",
      })),
    );
    render();
  } catch (e) {
    SeedStar.reportError(e);
  }
}

async function replaceReference(bucket, index) {
  const mode = state.mode, rows = state.refs[mode]?.[bucket], previous = rows?.[index];
  if (!previous) return;
  close();
  try {
    const [asset] = await SeedStar.pickAssets({ kind: SeedStar.mediaKind(previous) || "image", limit: 1, immediate: true, sources: SeedStar.mediaKind(previous) === "image", parityControls: true });
    if (!asset || state.refs[mode]?.[bucket]?.[index] !== previous) return;
    rows[index] = { ...asset, type: asset.type || SeedStar.mediaKind(asset) + "/", tag: previous.tag, purpose: previous.purpose };
    if (state.mode === mode) render();
  } catch (error) { SeedStar.reportError(error); }
}
