/**
 * Parent-page side of the embed protocol v1 (engine side = W2, lib/embed/protocol.ts there).
 * Accepts a message only when event.origin is the configured engine origin AND event.source is one of
 * this page's oracle iframes; every reply is posted to that origin only. Config: window.AWORACLE.
 *
 * engine -> parent: oracle:ready {v} | oracle:resize {height} | oracle:need-login {} |
 *                   oracle:navigate {slug} | oracle:save-chart {system,input} (re-dispatched for P2)
 * parent -> engine: oracle:init {v, locale, theme, member}
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE;
  if (!cfg || !cfg.engineOrigin) return;

  var MIN_HEIGHT = 200;
  var MAX_HEIGHT = 20000;

  function frames() {
    return Array.prototype.slice.call(document.querySelectorAll('.aworacle-embed iframe'));
  }

  function frameFor(source) {
    var list = frames();
    for (var i = 0; i < list.length; i++) {
      if (list[i].contentWindow === source) return list[i];
    }
    return null;
  }

  /** Kadence palette variables if the theme defines them; otherwise {} and the engine keeps its defaults. */
  function theme() {
    var out = {};
    var style = window.getComputedStyle(document.documentElement);
    for (var i = 1; i <= 9; i++) {
      var name = '--global-palette' + i;
      var value = style.getPropertyValue(name).trim();
      if (value && /^[#a-zA-Z0-9(),.%\s-]{1,64}$/.test(value)) out[name] = value;
    }
    return out;
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== cfg.engineOrigin) return;
    var frame = frameFor(event.source);
    if (!frame) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'oracle:ready':
        if (msg.v !== cfg.v) return;
        frame.contentWindow.postMessage(
          { type: 'oracle:init', v: cfg.v, locale: cfg.locale, theme: theme(), member: !!cfg.member },
          cfg.engineOrigin
        );
        break;
      case 'oracle:resize': {
        var h = Number(msg.height);
        if (isFinite(h)) {
          frame.style.height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(h))) + 'px';
          frame.style.minHeight = '0';
        }
        break;
      }
      case 'oracle:need-login':
        if (cfg.loginUrl) window.location.assign(cfg.loginUrl);
        break;
      case 'oracle:navigate':
        if (typeof msg.slug === 'string' && cfg.pages && Object.prototype.hasOwnProperty.call(cfg.pages, msg.slug)) {
          window.location.assign(cfg.pages[msg.slug]);
        }
        break;
      case 'oracle:save-chart':
        // Saving is P2 (member charts); hand the event to whoever listens on the embed container.
        frame.parentNode.dispatchEvent(
          new CustomEvent('aworacle:save-chart', { bubbles: true, detail: { system: msg.system, input: msg.input } })
        );
        break;
      default:
        break;
    }
  });
})();
