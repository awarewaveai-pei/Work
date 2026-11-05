// AwareWave theme receiver — injected into the VectorCraft dist index.html by build.sh
// (<script> before </body>); no upstream Rust beyond api-settheme.patch's setTheme().
// Protocol (SSOT: apps/next-admin/components/tools/AwareWaveThemeFrame.tsx):
//   child → parent {channel:'awarewave:theme-ready'}    when setTheme is callable
//   parent → child {channel:'awarewave:theme', tokens:{'--card-bg':'#…', …}}  (same-origin only)
//   child → parent {channel:'awarewave:theme-applied'}  after vectorcraft.setTheme resolves
// The parent re-sends on every theme change (MutationObserver on <html>), so re-applies flow
// through the same path. Cross-origin parents are ignored by design: in production both sides
// are the same host (/vector-pro/ behind app.aware-wave.com); the awarewaveParentOrigin query
// param the parent sets is therefore not trusted here.
(function () {
  'use strict';

  // The one place the AwareWave CSS tokens map onto VectorCraft theme tokens.
  var MAP = {
    app_bar: '--body-bg',
    panel: '--card-bg',
    panel_darker: '--bg-subtle',
    tab_strip: '--bg-subtle',
    pasteboard: '--bg-subtle',
    input: '--card-bg',
    input_border: '--border',
    border: '--border',
    divider: '--border-subtle',
    text: '--text-primary',
    text_strong: '--text-primary',
    icon: '--text-primary',
    text_dim: '--text-muted',
    hover: '--bg-hover',
    tool_active: '--bg-hover',
    row_selected: '--bg-hover',
    button: '--btn-secondary-bg',
    button_border: '--btn-secondary-border',
    accent: '--accent',
    accent_strong: '--accent-hover'
  };

  function hex(v) {
    v = (v || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    var m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(function (n) {
        return ('0' + Math.min(255, Number(n)).toString(16)).slice(-2);
      }).join('');
    }
    return null;
  }

  function toSpec(tokens) {
    var out = {}, any = false;
    Object.keys(MAP).forEach(function (field) {
      var c = hex(tokens[MAP[field]]);
      if (c) { out[field] = c; any = true; }
    });
    var r = parseFloat((tokens['--radius-sm'] || '').trim());
    if (!isNaN(r)) { out.radius = Math.max(0, Math.min(255, Math.round(r))); any = true; }
    return any ? out : null;
  }

  function reply(channel) {
    window.parent.postMessage({ channel: channel }, window.location.origin);
  }

  function apply(tokens, attempt) {
    var spec = toSpec(tokens);
    if (!spec) return;
    window.vectorcraft.setTheme(spec).then(function () {
      reply('awarewave:theme-applied');
    }).catch(function (e) {
      // The wasm installs setTheme before the app connects its control channel; retry briefly.
      if (/not running yet/.test(String(e)) && (attempt || 0) < 40) {
        setTimeout(function () { apply(tokens, (attempt || 0) + 1); }, 500);
      } else {
        console.warn('awarewave-theme-receiver:', e);
      }
    });
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var d = event.data;
    if (d && d.channel === 'awarewave:theme' && d.tokens && window.vectorcraft) apply(d.tokens, 0);
  });

  var tries = 0;
  (function announce() {
    if (window.vectorcraft && typeof window.vectorcraft.setTheme === 'function') {
      reply('awarewave:theme-ready');
      return;
    }
    if (++tries < 600) setTimeout(announce, 500); // the 33MB wasm can take a while on first load
  })();
})();
