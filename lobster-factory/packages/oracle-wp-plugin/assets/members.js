/**
 * [aw_oracle_my_charts] / [aw_oracle_persons]: list, add, edit and delete the member's entries through
 * REST aworacle/v1 (cookie + X-WP-Nonce). Every piece of member data is written with textContent / value,
 * never as HTML. Choices are visible radios and checkboxes (no dropdowns).
 * Config: window.AWORACLE_MEMBERS = { root, nonce, labels }.
 */
(function () {
  'use strict';
  var cfg = window.AWORACLE_MEMBERS;
  if (!cfg || !cfg.root) return;
  var L = cfg.labels || {};
  var uid = 0;

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
        if (k === 'text') node.textContent = props[k];
        else if (k === 'className') node.className = props[k];
        else if (k === 'on') node.addEventListener('click', props[k]);
        else node.setAttribute(k, props[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function api(method, path, body) {
    var init = {
      method: method,
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': cfg.nonce, Accept: 'application/json' }
    };
    if (body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(cfg.root + path, init).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (json) {
          return { ok: res.ok, status: res.status, json: json };
        });
    });
  }

  function birthText(b) {
    if (!b) return '';
    function two(n) {
      return (n < 10 ? '0' : '') + n;
    }
    var cal = b.calendar === 'lunar' ? L.lunar + (b.isLeapMonth ? ' ' + L.leap : '') : L.solar;
    var place = b.place && b.place.label ? ' · ' + b.place.label : '';
    return cal + ' ' + b.year + '-' + two(b.month) + '-' + two(b.day) + ' ' + two(b.hour) + ':' + two(b.minute) + ' · ' + (b.gender === '男' ? L.male : L.female) + place;
  }

  function radios(name, current, choices) {
    var wrap = el('span', { className: 'aworacle-choices' });
    choices.forEach(function (c) {
      var input = el('input', { type: 'radio', name: name, value: c[0] });
      input.checked = current === c[0];
      wrap.appendChild(el('label', null, [input, document.createTextNode(' ' + c[1] + ' ')]));
    });
    return wrap;
  }

  function field(label, control, key) {
    return el('p', { className: 'aworacle-field', 'data-field': key }, [el('label', null, [el('span', { text: label + ' ' }), control])]);
  }

  function num(value, min, max, size, label) {
    var input = el('input', { type: 'number', min: String(min), max: String(max), step: 'any', size: String(size || 4), 'aria-label': label });
    if (value !== undefined && value !== null) input.value = String(value);
    return input;
  }

  function mount(box) {
    var kind = box.getAttribute('data-aworacle-kind');
    var state = { items: [], editing: null, error: '' };
    var group = 'aworacle-' + kind + '-' + ++uid;

    function render() {
      box.textContent = '';
      box.appendChild(el('h3', { text: kind === 'persons' ? L.persons : L.charts }));
      if (kind === 'persons') box.appendChild(el('p', { className: 'aworacle-note', text: L.personsNote }));
      if (state.error) box.appendChild(el('p', { className: 'aworacle-error', role: 'alert', text: state.error }));
      if (state.editing) {
        box.appendChild(form(state.editing));
        return;
      }
      if (!state.items.length) box.appendChild(el('p', { text: L.empty }));
      var list = el('ul', { className: 'aworacle-list' });
      state.items.forEach(function (item) {
        var row = el('li');
        if (item.locked) {
          row.appendChild(el('span', { text: L.locked + ' ' }));
        } else {
          row.appendChild(el('strong', { text: item.name }));
          row.appendChild(el('span', { text: ' — ' + birthText(item.birth) + ' ' }));
          row.appendChild(
            el('button', {
              type: 'button',
              text: L.edit,
              on: function () {
                state.editing = item;
                state.error = '';
                render();
              }
            })
          );
        }
        row.appendChild(
          el('button', {
            type: 'button',
            text: L['delete'],
            on: function () {
              if (!window.confirm(L.confirm)) return;
              api('DELETE', kind + '/' + item.id).then(function (r) {
                state.error = r.ok ? '' : (r.json && r.json.message) || L.error;
                load();
              }, fail);
            }
          })
        );
        list.appendChild(row);
      });
      box.appendChild(list);
      box.appendChild(
        el('button', {
          type: 'button',
          className: 'button',
          text: L.add,
          on: function () {
            state.editing = { id: 0, name: '', birth: null };
            state.error = '';
            render();
          }
        })
      );
    }

    function form(item) {
      var b = item.birth || {
        calendar: 'solar',
        gender: '男',
        dayDivide: 'current',
        trueSolar: false,
        isLeapMonth: false
      };
      var place = window.awOraclePlace(b.place);
      var c = {
        name: el('input', { type: 'text', maxlength: '100' }),
        year: num(b.year, 1800, 2200, 6, L.year),
        month: num(b.month, 1, 12, 4, L.month),
        day: num(b.day, 1, 31, 4, L.day),
        hour: num(b.hour, 0, 23, 4, L.hour),
        minute: num(b.minute, 0, 59, 4, L.minute),
        leap: el('input', { type: 'checkbox' }),
        trueSolar: el('input', { type: 'checkbox' })
      };
      c.name.value = item.name || '';
      c.leap.checked = !!b.isLeapMonth;
      c.trueSolar.checked = !!b.trueSolar;
      var cal = radios(group + '-cal', b.calendar, [['solar', L.solar], ['lunar', L.lunar]]);
      var gender = radios(group + '-gender', b.gender, [['男', L.male], ['女', L.female]]);
      var divide = radios(group + '-divide', b.dayDivide || 'current', [['current', L.sameDay], ['forward', L.nextDay]]);

      function picked(wrap) {
        var on = wrap.querySelector('input:checked');
        return on ? on.value : '';
      }
      function int(input) {
        return input.value === '' ? null : Number(input.value);
      }

      var f = el('form', { className: 'aworacle-form', novalidate: 'novalidate' }, [
        field(L.name, c.name, 'name'),
        field(L.calendar, cal, 'birth.calendar'),
        field(L.leap, c.leap, 'birth.isLeapMonth'),
        el('p', { className: 'aworacle-field', 'data-field': 'birth.year birth.month birth.day' }, [el('span', { text: L.date + ' ' }), c.year, c.month, c.day]),
        el('p', { className: 'aworacle-field', 'data-field': 'birth.hour birth.minute' }, [el('span', { text: L.time + ' ' }), c.hour, c.minute]),
        field(L.gender, gender, 'birth.gender'),
        el('div', { className: 'aworacle-field', 'data-field': 'birth.place birth.place.label birth.place.lat birth.place.lon birth.place.zone' }, [el('span', { text: L.place + ' ' }), place.node]),
        field(L.trueSolar, c.trueSolar, 'birth.trueSolar'),
        field(L.dayDivide, divide, 'birth.dayDivide'),
        el('p', null, [
          el('button', { type: 'submit', className: 'button button-primary', text: L.save }),
          document.createTextNode(' '),
          el('button', {
            type: 'button',
            className: 'button',
            text: L.cancel,
            on: function () {
              state.editing = null;
              state.error = '';
              render();
            }
          })
        ])
      ]);

      f.addEventListener('submit', function (event) {
        event.preventDefault();
        var body = {
          name: c.name.value,
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
            dayDivide: picked(divide)
          }
        };
        var req = item.id ? api('PUT', kind + '/' + item.id, body) : api('POST', kind, body);
        req.then(function (r) {
          if (r.ok) {
            state.editing = null;
            state.error = '';
            load();
            return;
          }
          var bad = (r.json && r.json.data && r.json.data.fields) || [];
          var marks = f.querySelectorAll('[data-field]');
          for (var i = 0; i < marks.length; i++) {
            var keys = marks[i].getAttribute('data-field').split(' ');
            var hit = keys.some(function (k) {
              return bad.indexOf(k) !== -1;
            });
            marks[i].classList.toggle('aworacle-invalid', hit);
            marks[i].style.outline = hit ? '2px solid currentColor' : '';
          }
          var msg = r.status === 400 ? L.invalid : (r.json && r.json.message) || L.error;
          var shown = f.querySelector('.aworacle-error');
          if (!shown) {
            shown = el('p', { className: 'aworacle-error', role: 'alert' });
            f.insertBefore(shown, f.firstChild);
          }
          shown.textContent = msg;
        }, function () {
          var shown = f.querySelector('.aworacle-error');
          if (!shown) {
            shown = el('p', { className: 'aworacle-error', role: 'alert' });
            f.insertBefore(shown, f.firstChild);
          }
          shown.textContent = L.error;
        });
      });
      return f;
    }

    function fail() {
      state.error = L.error;
      render();
    }

    function load() {
      api('GET', kind).then(function (r) {
        if (!r.ok) {
          state.error = (r.json && r.json.message) || L.error;
          state.items = [];
        } else {
          state.items = (r.json && r.json.items) || [];
        }
        render();
      }, fail);
    }

    load();
  }

  function init() {
    var boxes = document.querySelectorAll('.aworacle-members[data-aworacle-kind]');
    for (var i = 0; i < boxes.length; i++) mount(boxes[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
