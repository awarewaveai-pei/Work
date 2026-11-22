/**
 * Parent-page side of the same-origin embed (iframe src="/embed/<lang>/<tool>" on this site's domain).
 * Same origin, so no message protocol: the page reads the frame's #aw-oracle-root directly.
 *  - Height: the frame is as tall as #aw-oracle-root (a ResizeObserver from the frame's own window, so it
 *    also fires when the content gets shorter). Root not found (engine down, error page) -> the frame keeps
 *    cfg.minHeight; it never grows to fit a document that is not the tool.
 *  - Result: after a submit or a button click inside the frame, the first growth of the content scrolls this
 *    page to the newly added block (the result), or to the frame's top when no block can be told apart.
 *  - Tool links: a link inside the frame to another tool (/<lang>/<tool> or /embed/<lang>/<tool>) opens the
 *    WordPress page mapped to that tool (Settings → Tool pages), when there is one.
 * Config: window.AWORACLE_SAME = { rootId, minHeight, pages: { slug: url } }.
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_SAME;
  if (!cfg || !cfg.rootId) return;

  var MIN_HEIGHT = Math.max(150, Number(cfg.minHeight) || 600);
  var ARM_MS = 30000; // a result counts when it shows up within this long after the visitor acted
  var GROWTH_PX = 80; // smaller changes are hints, spinners, validation messages
  var RESULT_MIN_PX = 60; // an added block shorter than this is not "the result"
  var TOP_GAP_PX = 16;
  var TOOL_PATH = /^\/(?:embed\/)?(?:zh-TW|en)\/([a-z0-9][a-z0-9-]{0,39})\/?$/;

  function attach(frame) {
    var state = { observer: null, mutations: null, root: null, height: 0, armedAt: 0, added: [] };

    function reset() {
      if (state.observer) state.observer.disconnect();
      if (state.mutations) state.mutations.disconnect();
      state.observer = state.mutations = state.root = null;
      state.added = [];
      state.armedAt = 0;
    }

    function setHeight(px) {
      frame.style.height = px + 'px';
    }

    function measure() {
      var root = state.root;
      if (!root || !root.isConnected) return;
      var h = Math.ceil(root.getBoundingClientRect().height);
      if (!(h > 0)) return;
      var grew = h - state.height;
      state.height = h;
      setHeight(h);
      if (state.armedAt && grew >= GROWTH_PX && Date.now() - state.armedAt < ARM_MS) {
        state.armedAt = 0;
        scrollToResult();
      }
    }

    function scrollToResult() {
      var frameTop = frame.getBoundingClientRect().top;
      var target = null;
      for (var i = 0; i < state.added.length; i++) {
        var el = state.added[i];
        if (!el.isConnected) continue;
        var r = el.getBoundingClientRect();
        if (r.height >= RESULT_MIN_PX && (!target || r.top < target.top)) target = r;
      }
      state.added = [];
      var offset = target ? frameTop + target.top : frameTop;
      // Already in the upper part of the viewport: leave the visitor where they are.
      if (offset >= 0 && offset < window.innerHeight / 3) return;
      window.scrollTo({ top: window.pageYOffset + offset - TOP_GAP_PX, behavior: 'smooth' });
    }

    function arm() {
      state.armedAt = Date.now();
      state.added = [];
    }

    function onClick(event) {
      var t = event.target;
      var link = t && t.closest ? t.closest('a[href]') : null;
      var plain = !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      // Modified clicks and target links keep the browser's own behaviour (new tab, download, …).
      if (link && cfg.pages && plain && !link.getAttribute('target')) {
        var url;
        try {
          url = new URL(link.getAttribute('href'), link.ownerDocument.baseURI);
        } catch (e) {
          url = null;
        }
        var m = url && url.origin === window.location.origin ? TOOL_PATH.exec(url.pathname) : null;
        if (m && Object.prototype.hasOwnProperty.call(cfg.pages, m[1])) {
          event.preventDefault();
          window.location.assign(cfg.pages[m[1]]);
          return;
        }
      }
      if (t && t.closest && t.closest('button, [role="button"], input[type="submit"]')) arm();
    }

    function bind() {
      reset();
      var doc;
      try {
        doc = frame.contentDocument;
      } catch (e) {
        doc = null; // not same-origin after all (proxy misrouted): keep the minimum height
      }
      var win = frame.contentWindow;
      var root = doc && doc.getElementById(cfg.rootId);
      if (!root || !win || typeof win.ResizeObserver !== 'function') {
        state.height = 0;
        setHeight(MIN_HEIGHT);
        return;
      }
      state.root = root;
      state.height = 0;
      // Observers from the frame's own window: they are tied to the frame document's rendering.
      state.observer = new win.ResizeObserver(measure);
      state.observer.observe(root);
      state.mutations = new win.MutationObserver(function (records) {
        if (!state.armedAt) return;
        for (var i = 0; i < records.length; i++) {
          var nodes = records[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) if (nodes[j].nodeType === 1) state.added.push(nodes[j]);
        }
      });
      state.mutations.observe(root, { childList: true, subtree: true });
      doc.addEventListener('submit', arm, true);
      doc.addEventListener('click', onClick, true);
      measure();
    }

    // Every load: the first one, and any navigation inside the frame (a new document needs new observers).
    frame.addEventListener('load', bind);
    try {
      if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentDocument.URL !== 'about:blank') bind();
    } catch (e) {
      /* bind on load */
    }
  }

  function init() {
    var frames = document.querySelectorAll('.aworacle-embed[data-aworacle-mode="same-origin"] iframe');
    for (var i = 0; i < frames.length; i++) attach(frames[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
