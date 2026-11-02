(function () {
  let previous = null;
  function sync() {
    const active = [
      ...document.querySelectorAll(
        ".modal-back.show,#overlay:not([hidden]),.modal:not(.hidden):not([hidden]),.job-view,#detailRoot,.asset-workspace",
      ),
    ].some((el) => el.getClientRects().length > 0);
    if (active && previous === null) {
      previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else if (!active && previous !== null) {
      document.body.style.overflow = previous;
      previous = null;
    }
  }
  new MutationObserver(sync).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class"],
  });
  sync();
})();
