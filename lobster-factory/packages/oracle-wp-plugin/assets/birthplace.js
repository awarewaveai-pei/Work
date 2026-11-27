/**
 * Birthplace picker for the signup and member forms: window.awOraclePlace(saved, changed) → { node, value() };
 * changed(value) is called with the first value and every later one.
 * `saved` = a stored place {label, lat, lon, zone}, kept as it is until another city is picked; without it
 * the default is the main city of the browser's time zone, else cfg.fallback. Search results are visible
 * buttons (no dropdown); everything is written with textContent.
 * Config: window.AWORACLE_PLACE = { url, locale, fallback, labels } (Places\Birthplace).
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_PLACE;
  if (!cfg) return;
  var L = cfg.labels || {};

  // Browsers may still report a zone by its old name; the city data uses the new one.
  // Same pairs as the engine's ZONE_RENAMES (ziwei-doushu lib/timezone.ts), old → new.
  var RENAMED = {
    'Europe/Kiev': 'Europe/Kyiv',
    'Pacific/Enderbury': 'Pacific/Kanton',
    'America/Godthab': 'America/Nuuk',
    'Asia/Rangoon': 'Asia/Yangon',
    'Asia/Calcutta': 'Asia/Kolkata',
    'Asia/Saigon': 'Asia/Ho_Chi_Minh',
    'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
    'Africa/Asmera': 'Africa/Asmara',
    'Atlantic/Faeroe': 'Atlantic/Faroe',
    'Pacific/Truk': 'Pacific/Chuuk',
    'Pacific/Ponape': 'Pacific/Pohnpei'
  };

  function el(tag, props) {
    var node = document.createElement(tag);
    for (var k in props || {}) {
      if (k === 'text') node.textContent = props[k];
      else node.setAttribute(k, props[k]);
    }
    return node;
  }

  function search(query, limit) {
    var q = '?q=' + encodeURIComponent(query) + '&locale=' + encodeURIComponent(cfg.locale) + '&limit=' + limit;
    return fetch(cfg.url + q, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('places ' + res.status);
      return res.json().then(function (json) {
        return (json && json.places) || [];
      });
    });
  }

  window.awOraclePlace = function (saved, changed) {
    var current = saved && saved.zone ? saved : cfg.fallback;
    var picked = !!(saved && saved.zone);
    var shown = el('strong');
    var input = el('input', { type: 'search', maxlength: '64', autocomplete: 'off', placeholder: L.search, 'aria-label': L.search });
    var results = el('span', { 'aria-live': 'polite' });
    var node = el('span', { class: 'aworacle-place' });
    [shown, el('br'), input, el('br'), results, el('br'), el('small', { text: L.credit })].forEach(function (c) {
      node.appendChild(c);
    });

    function value() {
      return { label: String(current.label || '').slice(0, 100), lat: current.lat, lon: current.lon, zone: current.zone };
    }
    function show() {
      shown.textContent = (current.label ? current.label + ' · ' : '') + current.zone;
      if (changed) changed(value());
    }
    show();

    if (!picked) {
      var zone = '';
      try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (e) {}
      zone = RENAMED[zone] || zone;
      if (zone && zone !== current.zone) {
        search(zone.split('/').pop().replace(/_/g, ' '), 20).then(
          function (places) {
            var hit = places.filter(function (p) {
              return p.zone === zone;
            })[0];
            if (hit && !picked) {
              current = hit;
              show();
            }
          },
          function () {} // the default stays, visible
        );
      }
    }

    var timer = null;
    var round = 0;
    function say(text) {
      results.textContent = text;
    }
    input.addEventListener('input', function () {
      var query = input.value.trim();
      var mine = ++round;
      clearTimeout(timer);
      say(query ? L.searching : '');
      if (!query) return;
      timer = setTimeout(function () {
        search(query, 8).then(
          function (places) {
            if (mine !== round) return;
            say(places.length ? '' : L.none);
            places.forEach(function (p) {
              var button = el('button', { type: 'button', class: 'button wp-element-button', text: p.label });
              button.addEventListener('click', function () {
                current = p;
                picked = true;
                input.value = '';
                say('');
                show();
              });
              results.appendChild(button);
            });
          },
          function () {
            if (mine === round) say(L.failed);
          }
        );
      }, 250);
    });
    // Enter in the search box must not submit the form around it.
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') event.preventDefault();
    });

    return { node: node, value: value };
  };
})();
