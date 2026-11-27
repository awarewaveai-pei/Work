/**
 * The daily-letter signup shown by Fluent Forms: puts the birthplace search (assets/birthplace.js) and the
 * human check into the form and writes their values, the browser's time zone and the page language into
 * hidden fields. Fluent Forms does the sending; the server side is Daily\FluentFormsEntry.
 * Config: window.AWORACLE_FF = { locale, turnstile, action, place }.
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_FF;
  var $ = window.jQuery;
  if (!cfg || !$ || !window.awOraclePlace) return;

  function set(form, name, value) {
    var input = form.querySelector('input[name="' + name + '"]');
    if (input) input.value = value;
  }

  function zone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return '';
    }
  }

  function mount(form) {
    var slot = form.querySelector('.aworacle-ff-place');
    if (!slot || slot.getAttribute('data-ready')) return;
    slot.setAttribute('data-ready', '1');

    // The hidden fields follow the picker at once: Fluent Forms may read them in any submit path.
    var chosen = null;
    function fill() {
      set(form, 'aw_place_label', chosen.label);
      set(form, 'aw_place_lat', String(chosen.lat));
      set(form, 'aw_place_lon', String(chosen.lon));
      set(form, 'aw_place_zone', chosen.zone);
      set(form, 'aw_tz', zone() || chosen.zone);
      set(form, 'aw_locale', cfg.locale);
    }
    var place = window.awOraclePlace(null, function (value) {
      chosen = value;
      fill();
    });
    var title = document.createElement('div');
    title.className = 'ff-el-input--label';
    title.appendChild(document.createTextNode(cfg.place));
    slot.className += ' ff-el-group';
    slot.appendChild(title);
    slot.appendChild(place.node);

    var widget = null;
    var box = form.querySelector('.aworacle-ff-turnstile');
    function render() {
      if (widget !== null || !cfg.turnstile || !box || !window.turnstile) return;
      widget = window.turnstile.render(box, {
        sitekey: cfg.turnstile,
        action: cfg.action,
        'response-field': false,
        callback: function (token) {
          set(form, 'aw_turnstile', token);
        },
        'expired-callback': function () {
          set(form, 'aw_turnstile', '');
        }
      });
    }
    render();
    window.addEventListener('load', render);
    // A token is good for one check: after a refused submission, ask for a new one.
    $(form).on('fluentform_submission_failed', function () {
      set(form, 'aw_turnstile', '');
      if (widget !== null) window.turnstile.reset(widget);
    });
    // Fluent Forms empties the form after a success or a reset: put the values back.
    $(form).on('fluentform_reset reset', function () {
      setTimeout(fill, 0);
    });
  }

  function init() {
    var slots = document.querySelectorAll('.aworacle-ff-place');
    for (var i = 0; i < slots.length; i++) {
      var form = slots[i].closest('form');
      if (form) mount(form);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
