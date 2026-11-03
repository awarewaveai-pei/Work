(function () {
  const allowedUrl = (value) => {
    try {
      const v = String(value).trim();
      if (/^data:/i.test(v))
        return /^data:(image\/(png|jpeg|webp|gif|svg\+xml)|audio\/|video\/)/i.test(
          v,
        );
      return ["http:", "https:", "blob:"].includes(
        new URL(v, location.href).protocol,
      );
    } catch {
      return false;
    }
  };
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    for (const a of [...(node.attributes || [])]) {
      if (
        ["src", "href", "poster", "xlink:href"].includes(a.name) &&
        !allowedUrl(a.value)
      )
        node.removeAttribute(a.name);
      if (
        a.name === "style" &&
        /url\s*\(|expression|@import|javascript/i.test(a.value)
      )
        node.removeAttribute(a.name);
    }
    if (node.tagName === "A" && node.target === "_blank")
      node.rel = "noopener noreferrer";
  });
  VideoWorkbench.sanitize = (value) =>
    DOMPurify.sanitize(String(value ?? ""), {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["video", "audio", "source"],
      FORBID_TAGS: ["iframe", "object", "embed", "style"],
      FORBID_ATTR: ["srcdoc", "action", "formaction"],
    });
  VideoWorkbench.safeUrl = (value) => (allowedUrl(value) ? String(value) : "");
})();
