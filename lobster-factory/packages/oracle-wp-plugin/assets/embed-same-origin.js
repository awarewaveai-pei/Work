/**
 * Parent-page side of the same-origin embed (iframe src="/embed/<lang>/<tool>" on this site's domain).
 * Same origin, so no message protocol: the page reads the frame's #aw-oracle-root directly.
 *  - Height: the frame is as tall as #aw-oracle-root (a ResizeObserver from the frame's own window, so it
 *    also fires when the content gets shorter). Root not found (engine down, error page) -> the frame keeps
 *    cfg.minHeight; it never grows to fit a document that is not the tool.
 *  - Result: after a submit or a button click inside the frame, when an element marked [data-aw-result]
 *    (the engine marks each tool's result container, card E5) appears or is re-rendered, this page scrolls to
 *    it. An engine without the marker never triggers a scroll: no guessing from height changes.
 *  - Tool links: a link inside the frame to another tool (/<lang>/<tool> or /embed/<lang>/<tool>) opens the
 *    WordPress page mapped to that tool (Settings → Tool pages), when there is one.
 *  - Member ticket (logged-in visitors only): window.awOracleTicket() resolves to
 *    { ticket, signature } from REST aworacle/v1/ticket (cookie + X-WP-Nonce), or null. The framed engine page
 *    calls window.parent.awOracleTicket() right before an AI reading and sends the two values as headers
 *    X-AwareWave-Oracle-Ticket / X-AwareWave-Oracle-Signature (never in a URL). Each call is a fresh,
 *    single-use, 60-second ticket. Not defined for anonymous visitors: the engine then reads anonymously.
 *  - Own birth data (logged-in visitors only): window.awOracleBirth() resolves to the member's stored birth
 *    fields from REST aworacle/v1/me, or null; the framed tool uses it to prefill its form.
 *  - Theme fonts: the frame's host-theme font names (Embed\ThemeTokens) get this page's same-origin
 *    @font-face files copied in (copyFonts); colours need no script, they are in the frame URL.
 * Config: window.AWORACLE_SAME ={ rootId, minHeight, pages: { slug: url }, ticket: { url, nonce } | null,
 *   me: { url, nonce } | null }.
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_SAME;
  if (!cfg || !cfg.rootId) return;

  var MIN_HEIGHT = Math.max(150, Number(cfg.minHeight) || 600);
  var ARM_MS = 30000; // a result counts when it shows up within this long after the visitor acted
  var RESULT_SELECTOR = '[data-aw-result]';
  var TOP_GAP_PX = 16;
  var TOOL_PATH = /^\/(?:embed\/)?(?:zh-TW|en)\/([a-z0-9][a-z0-9-]{0,39})\/?$/;

  if (cfg.ticket && cfg.ticket.url && typeof window.fetch === 'function') {
    window.awOracleTicket = function () {
      return fetch(cfg.ticket.url, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-WP-Nonce': cfg.ticket.nonce, Accept: 'application/json' }
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (json) {
          return json && json.ticket && json.signature ? { ticket: json.ticket, signature: json.signature } : null;
        })
        .catch(function () {
          return null;
        });
    };
  }

  // The member's own birth data for the framed tool's form: window.parent.awOracleBirth() resolves to the stored
  // birth fields (engine BIRTH_FIELDS) or null. Same origin only (a function call, nothing in a URL or message);
  // fetched on demand, so no birth data sits in the page or its cache.
  if (cfg.me && cfg.me.url && typeof window.fetch === 'function') {
    window.awOracleBirth = function () {
      return fetch(cfg.me.url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-WP-Nonce': cfg.me.nonce, Accept: 'application/json' }
      })
        .then(function (res) {
          return res.ok ? res.json() : null;
        })
        .then(function (json) {
          return (json && json.item && json.item.birth) || null;
        })
        .catch(function () {
          return null;
        });
    };
  }

  /** Lower-cased family names in a font-family list ('"Inter", Roboto, sans-serif' -> ['inter','roboto','sans-serif']). */
  function familyNames(list) {
    return String(list || '')
      .split(',')
      .map(function (f) {
        return f.trim().replace(/^["']|["']$/g, '').toLowerCase();
      })
      .filter(Boolean);
  }

  /**
   * Host theme fonts (ThemeTokens → --global-body-font-family / --global-heading-font-family in the frame) are only names; the frame does
   * not load this page's web fonts. Copy this page's @font-face rules for those families into the frame as
   * FontFace objects. Only same-origin font files load (the engine CSP is font-src 'self'): fonts served by
   * WordPress itself (theme.json fonts, Kadence "load fonts locally") work, third-party font hosts fall back.
   */
  function copyFonts(doc, win) {
    if (!doc.fonts || typeof win.FontFace !== 'function' || doc.__awOracleFonts) return;
    doc.__awOracleFonts = true;
    var css = win.getComputedStyle(doc.documentElement);
    var want = familyNames(css.getPropertyValue('--global-body-font-family') + ',' + css.getPropertyValue('--global-heading-font-family'));
    if (!want.length) return;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var rules;
      try {
        rules = sheets[i].cssRules; // a third-party stylesheet throws: skip it
      } catch (e) {
        continue;
      }
      var base = sheets[i].href || document.baseURI;
      for (var j = 0; rules && j < rules.length; j++) {
        var r = rules[j];
        if (r.type !== 5 /* CSSRule.FONT_FACE_RULE */) continue;
        var family = familyNames(r.style.getPropertyValue('font-family'))[0];
        if (!family || want.indexOf(family) < 0) continue;
        var src = r.style.getPropertyValue('src').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, function (m, q, u) {
          try {
            return 'url("' + new URL(u, base).href + '")';
          } catch (e) {
            return m;
          }
        });
        try {
          var face = new win.FontFace(r.style.getPropertyValue('font-family').replace(/^["']|["']$/g, ''), src, {
            weight: r.style.getPropertyValue('font-weight') || 'normal',
            style: r.style.getPropertyValue('font-style') || 'normal',
            unicodeRange: r.style.getPropertyValue('unicode-range') || 'U+0-10FFFF',
            display: 'swap'
          });
          doc.fonts.add(face);
          face.load().catch(function () {});
        } catch (e) {
          /* a rule the frame cannot use: the engine's own fallback font stays */
        }
      }
    }
  }

  function attach(frame) {
    var state = { observer: null, mutations: null, root: null, height: 0, armedAt: 0 };

    function reset() {
      if (state.observer) state.observer.disconnect();
      if (state.mutations) state.mutations.disconnect();
      state.observer = state.mutations = state.root = null;
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
      state.height = h;
      setHeight(h);
    }

    /** The [data-aw-result] element a mutation added or changed, or null. */
    function resultIn(records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target; // an element, or a text node for characterData records
        var host = t && (t.nodeType === 1 ? t : t.parentElement);
        var inside = host && host.closest ? host.closest(RESULT_SELECTOR) : null;
        if (inside) return inside;
        var nodes = records[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.nodeType !== 1) continue;
          if (n.matches(RESULT_SELECTOR)) return n;
          var found = n.querySelector(RESULT_SELECTOR);
          if (found) return found;
        }
      }
      return null;
    }

    function scrollTo(result) {
      // After layout: the frame height follows the content in the same frame.
      window.requestAnimationFrame(function () {
        if (!result.isConnected) return;
        var offset = frame.getBoundingClientRect().top + result.getBoundingClientRect().top;
        // Already in the upper part of the viewport: leave the visitor where they are.
        if (offset >= 0 && offset < window.innerHeight / 3) return;
        window.scrollTo({ top: window.pageYOffset + offset - TOP_GAP_PX, behavior: 'smooth' });
      });
    }

    function arm(event) {
      var t = event && event.target;
      if (t && t.closest && t.closest(RESULT_SELECTOR)) return; // a form inside the shown result
      state.armedAt = Date.now();
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
      // Buttons inside a shown result (tabs, expanders) change the result in place: no scroll for those.
      if (t && t.closest && t.closest('button, [role="button"], input[type="submit"]')) arm(event);
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
      try {
        copyFonts(doc, win);
      } catch (e) {
        /* fonts are cosmetic: never let them stop height tracking */
      }
      // Observers from the frame's own window: they are tied to the frame document's rendering.
      state.observer = new win.ResizeObserver(measure);
      state.observer.observe(root);
      state.mutations = new win.MutationObserver(function (records) {
        if (!state.armedAt) return;
        if (Date.now() - state.armedAt >= ARM_MS) {
          state.armedAt = 0;
          return;
        }
        var result = resultIn(records);
        if (!result) return;
        state.armedAt = 0;
        scrollTo(result);
      });
      state.mutations.observe(root, { childList: true, subtree: true, characterData: true });
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
