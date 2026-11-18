(function () {
  // No independent catalog: /capabilities carries next-admin's canonical rows, including the legacy mapping.
  const rows = () => VideoWorkbench.capabilities?.visualStyles || [];
  const get = value => rows().find(s => typeof value === "number" ? s.legacyIndex === value : s.id === value || s.zh === value);
  window.VideoWorkbenchStyles = {
    rows, get,
    name: value => get(value)?.zh || "自訂（既有風格）",
    prompt: value => {
      if (!rows().length) throw Error("風格清單尚未載入，請重新整理頁面");
      return get(value)?.prompt || "";
    },
    select(project, id) {
      const row = get(id);
      if (!row) throw Error("風格清單已變更，請重新開啟");
      project.styleId = row.id;
      project.style = row.legacyIndex ?? 8; // old builds display custom; customStyle still carries the actual prompt
    },
    migrate(project) {
      const row = get(project.styleId ?? project.style);
      if (!row || project.styleId === row.id) return false;
      this.select(project, row.id);
      return true;
    },
  };
})();
