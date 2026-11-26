/**
 * [aw_oracle_daily]: the daily-letter signup form, posted to REST aworacle/v1/daily/subscribe.
 * Time zone: taken from the browser, editable in a search box (input + datalist of every IANA zone),
 * never a long dropdown. Choices are visible radios / checkboxes. Values are set with textContent / value.
 * Config: window.AWORACLE_DAILY = { url, nonce, locale, turnstile, labels }. turnstile = Cloudflare Turnstile site key
 * ('' = not set up); its widget is rendered above the button and the token posted as `turnstile`.
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_DAILY;
  if (!cfg || !cfg.url) return;
  var L = cfg.labels || {};
  var uid = 0;

  function el(tag, props, children) {
    var node = document.createElement(tag);
    for (var k in props || {}) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (k === 'text') node.textContent = props[k];
      else if (k === 'className') node.className = props[k];
      else node.setAttribute(k, props[k]);
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function zone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return '';
    }
  }

  function zones() {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch (e) {
      return [];
    }
  }

  function num(min, max, label) {
    return el('input', { type: 'number', min: String(min), max: String(max), step: 'any', size: '6', 'aria-label': label });
  }

  function radios(name, current, choices) {
    var wrap = el('span');
    choices.forEach(function (c) {
      var input = el('input', { type: 'radio', name: name, value: c[0] });
      input.checked = current === c[0];
      wrap.appendChild(el('label', null, [input, document.createTextNode(' ' + c[1] + ' ')]));
    });
    return wrap;
  }

  function row(label, key, controls) {
    return el('p', { className: 'aworacle-field', 'data-field': key }, [el('span', { text: label + ' ' })].concat(controls));
  }

  function mount(box) {
    var id = 'aworacle-daily-' + ++uid;
    var list = el('datalist', { id: id + '-zones' });
    zones().forEach(function (z) {
      list.appendChild(el('option', { value: z }));
    });
    var c = {
      email: el('input', { type: 'email', required: 'required', maxlength: '190', autocomplete: 'email' }),
      tz: el('input', { type: 'text', list: id + '-zones', maxlength: '64', autocomplete: 'off' }),
      year: num(1800, 2200, L.year),
      month: num(1, 12, L.month),
      day: num(1, 31, L.day),
      hour: num(0, 23, L.hour),
      minute: num(0, 59, L.minute),
      leap: el('input', { type: 'checkbox' }),
      trueSolar: el('input', { type: 'checkbox' }),
      website: el('input', { type: 'text', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' })
    };
    c.tz.value = zone();
    var place = window.awOraclePlace();
    var cal = radios(id + '-cal', 'solar', [['solar', L.solar], ['lunar', L.lunar]]);
    var gender = radios(id + '-gender', '男', [['男', L.male], ['女', L.female]]);
    var msg = el('p', { className: 'aworacle-daily-message', role: 'alert' });
    var trap = el('p', { style: 'position:absolute;left:-9999px' }, [c.website]);

    var form = el('form', { className: 'aworacle-daily-form', novalidate: 'novalidate' }, [
      el('h3', { text: L.title }),
      el('p', { text: L.intro }),
      row(L.email, 'email', [c.email]),
      row(L.tz, 'tz', [c.tz]),
      row(L.calendar, 'birth.calendar', [cal]),
      row(L.leap, 'birth.isLeapMonth', [c.leap]),
      row(L.date, 'birth.year birth.month birth.day birth', [c.year, c.month, c.day]),
      row(L.time, 'birth.hour birth.minute', [c.hour, c.minute]),
      row(L.gender, 'birth.gender', [gender]),
      el('div', { className: 'aworacle-field', 'data-field': 'birth.place birth.place.label birth.place.lat birth.place.lon birth.place.zone' }, [el('span', { text: L.place + ' ' }), place.node]),
      row(L.trueSolar, 'birth.trueSolar', [c.trueSolar]),
      trap,
      list,
      msg, // next to the button: a refusal must be seen where it was pressed
      el('p', null, [el('button', { type: 'submit', className: 'button button-primary', text: L.submit })])
    ]);

    var widget = null;
    if (cfg.turnstile && window.turnstile) {
      var slot = el('div', { className: 'aworacle-turnstile' });
      form.insertBefore(slot, form.lastChild);
      widget = window.turnstile.render(slot, { sitekey: cfg.turnstile, action: 'aworacle-daily' });
    }

    function picked(wrap) {
      var on = wrap.querySelector('input:checked');
      return on ? on.value : '';
    }
    function int(input) {
      return input.value === '' ? null : Number(input.value);
    }
    function refused(why) {
      msg.textContent = L.notSubscribed + ' ' + why;
      if (msg.scrollIntoView) msg.scrollIntoView({ block: 'nearest' });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var token = widget !== null ? window.turnstile.getResponse(widget) || '' : '';
      if (cfg.turnstile && !token) {
        refused(window.turnstile ? L.captcha : L.captchaBlocked);
        return;
      }
      var body = {
        email: c.email.value.trim(),
        tz: c.tz.value.trim(),
        locale: cfg.locale,
        website: c.website.value,
        turnstile: token,
        birth: {
          calendar: picked(cal),
          year: int(c.year),
          month: int(c.month),
          day: int(c.day),
          hour: int(c.hour),
          minute: int(c.minute),
          isLeapMonth: c.leap.checked,
          gender: picked(gender),
          place: place.value(),
          trueSolar: c.trueSolar.checked,
          dayDivide: 'current'
        }
      };
      msg.textContent = '';
      var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (cfg.nonce) headers['X-WP-Nonce'] = cfg.nonce;
      fetch(cfg.url, { method: 'POST', credentials: 'same-origin', headers: headers, body: JSON.stringify(body) })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (json) {
              var bad = (json && json.data && json.data.fields) || [];
              var marks = form.querySelectorAll('[data-field]');
              var names = [];
              for (var i = 0; i < marks.length; i++) {
                var hit = marks[i]
                  .getAttribute('data-field')
                  .split(' ')
                  .some(function (k) {
                    return bad.indexOf(k) !== -1;
                  });
                marks[i].style.outline = hit ? '2px solid currentColor' : '';
                if (hit) names.push(marks[i].querySelector('span').textContent.trim());
              }
              if (res.ok) {
                box.textContent = '';
                box.appendChild(el('p', { className: 'aworacle-daily-done', role: 'status', text: json.message || '' }));
                return;
              }
              // A token is good for one check: a refused post needs a fresh one.
              if (widget !== null) window.turnstile.reset(widget);
              if (res.status === 400) refused(names.length ? L.invalid + ' ' + names.join(L.listSeparator) : L.error);
              else refused((json && json.message) || L.error);
            });
        })
        .catch(function () {
          refused(L.error);
        });
    });
    box.appendChild(form);
  }

  function init() {
    var boxes = document.querySelectorAll('.aworacle-daily');
    for (var i = 0; i < boxes.length; i++) mount(boxes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
