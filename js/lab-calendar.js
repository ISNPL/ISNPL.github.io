/* ISNP Lab calendar — dependency-free month grid + upcoming list + detail popup.
   Data source (priority):
     1) Google Calendar API, IF window.LAB_CAL_CONFIG has googleCalendarId + googleApiKey
        (admin edits events in Google Calendar; auto-synced, includes the event memo/description).
     2) Fallback: window.LAB_EVENTS (from tools/events.json) — used when Google is not
        configured OR the fetch fails, so the page never breaks.
   Event shape: { date:'YYYY-MM-DD', end?:'YYYY-MM-DD', time?:'HH:MM', title, location?, url?, description?, type? } */
(function () {
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var TYPES = { seminar: 'Seminar', meeting: 'Meeting', deadline: 'Deadline', holiday: 'Holiday', event: 'Event' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function typeOf(e) { return TYPES[e.type] ? e.type : 'event'; }
  // memo rendering:
  //  - Google descriptions are often HTML (links, <br>, <p>, <b>, lists) -> sanitize (whitelist) and render.
  //  - plain text (events.json) -> escape, keep line breaks, auto-link bare URLs.
  var ALLOWED_TAGS = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, P: 1, DIV: 1, SPAN: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1 };
  function sanitizeNode(node) {
    var kids = [].slice.call(node.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c.nodeType === 1) { // element
        var tag = c.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') { c.parentNode.removeChild(c); continue; }
        if (!ALLOWED_TAGS[tag]) {                 // disallowed: unwrap (keep its text/children)
          sanitizeNode(c);
          var p = c.parentNode;
          while (c.firstChild) p.insertBefore(c.firstChild, c);
          p.removeChild(c);
          continue;
        }
        [].slice.call(c.attributes).forEach(function (a) {     // strip all attrs except a safe href
          if (!(tag === 'A' && a.name.toLowerCase() === 'href')) c.removeAttribute(a.name);
        });
        if (tag === 'A') {
          var href = c.getAttribute('href') || '';
          if (!/^(https?:|mailto:)/i.test(href)) c.removeAttribute('href');
          else { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
        }
        sanitizeNode(c);
      } else if (c.nodeType === 8) { // comment
        c.parentNode.removeChild(c);
      }
    }
  }
  function descHtml(s) {
    s = String(s == null ? '' : s);
    if (/<\/?[a-z][\s\S]*>/i.test(s)) {           // looks like HTML -> sanitize & render
      var tpl = document.createElement('template');
      tpl.innerHTML = s;
      sanitizeNode(tpl.content);
      return tpl.innerHTML;
    }
    return esc(s).replace(/\r\n|\r|\n/g, '<br>')   // plain text -> linkify
      .replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; });
  }
  function fmtWhen(e) {
    var d = parseDate(e.date);
    var s = MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (e.end) { var ed = parseDate(e.end); s += ' – ' + MONTHS[ed.getMonth()] + ' ' + ed.getDate() + (ed.getFullYear() !== d.getFullYear() ? ', ' + ed.getFullYear() : ''); }
    return s + (e.time ? ' · ' + e.time : '');
  }

  // ----- mutable data state -----
  var EVENTS = [], byDay = {};
  var view = (function () { var n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; })();

  function setEvents(list) {
    EVENTS = (list || []).filter(function (e) { return e && e.date; });
    EVENTS.forEach(function (e, i) { e._i = i; });
    byDay = {};
    EVENTS.forEach(function (e) {
      var start = parseDate(e.date), end = e.end ? parseDate(e.end) : start;
      for (var d = new Date(start); d <= end; d = addDays(d, 1)) (byDay[key(d)] = byDay[key(d)] || []).push(e);
    });
    Object.keys(byDay).forEach(function (k) { byDay[k].sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); }); });
    renderMonth(); renderUpcoming();
  }

  function chipHtml(e) {
    var t = typeOf(e);
    var label = (e.time ? e.time + ' ' : '') + e.title;
    var tip = (e.time ? e.time + '  ' : '') + e.title + (e.location ? '  @ ' + e.location : '');
    return '<span class="cal-chip ev-' + t + '" data-ev="' + e._i + '" role="button" tabindex="0" title="' + esc(tip) + '">' +
      '<span class="cal-dot ev-' + t + '"></span><span class="cal-chip-txt">' + esc(label) + '</span></span>';
  }

  function renderMonth() {
    var root = document.getElementById('lab-calendar');
    if (!root) return;
    var today = new Date();
    var first = new Date(view.y, view.m, 1);
    var gridStart = addDays(first, -first.getDay());

    var html = '<div class="cal-bar">';
    html += '<button type="button" class="cal-nav" data-go="-1" aria-label="Previous month">&#8249;</button>';
    html += '<h2 class="cal-title">' + MONTHS[view.m] + ' ' + view.y + '</h2>';
    html += '<button type="button" class="cal-nav" data-go="1" aria-label="Next month">&#8250;</button>';
    html += '<button type="button" class="cal-today" data-go="0">Today</button>';
    html += '</div><div class="cal-grid">';
    WD.forEach(function (w, i) { html += '<div class="cal-wd' + (i === 0 ? ' cal-sun' : (i === 6 ? ' cal-sat' : '')) + '">' + w + '</div>'; });
    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i);
      var cls = 'cal-cell' + (d.getMonth() === view.m ? '' : ' cal-out');
      if (sameDay(d, today)) cls += ' cal-today-cell';
      if (d.getDay() === 0) cls += ' cal-sun'; else if (d.getDay() === 6) cls += ' cal-sat';
      var evs = byDay[key(d)] || [];
      html += '<div class="' + cls + '"><div class="cal-daynum">' + d.getDate() + '</div>';
      if (evs.length) html += '<div class="cal-evs">' + evs.map(chipHtml).join('') + '</div>';
      html += '</div>';
      if (i >= 34 && d.getMonth() !== view.m && d > first) break;
    }
    html += '</div><div class="cal-legend">' + Object.keys(TYPES).map(function (t) {
      return '<span class="cal-leg"><span class="cal-dot ev-' + t + '"></span>' + TYPES[t] + '</span>';
    }).join('') + '</div>';

    root.innerHTML = html;
    root.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var go = +b.getAttribute('data-go');
        if (go === 0) { var n = new Date(); view.y = n.getFullYear(); view.m = n.getMonth(); }
        else { view.m += go; if (view.m < 0) { view.m = 11; view.y--; } else if (view.m > 11) { view.m = 0; view.y++; } }
        renderMonth();
      });
    });
  }

  function renderUpcoming() {
    var box = document.getElementById('lab-upcoming');
    if (!box) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var up = EVENTS.filter(function (e) { return (e.end ? parseDate(e.end) : parseDate(e.date)) >= today; })
      .sort(function (a, b) { return parseDate(a.date) - parseDate(b.date) || (a.time || '').localeCompare(b.time || ''); })
      .slice(0, 8);
    if (!up.length) { box.innerHTML = '<p class="text-muted">No upcoming events.</p>'; return; }
    box.innerHTML = '<ul class="cal-up-list">' + up.map(function (e) {
      var d = parseDate(e.date);
      var range = e.end ? (' &ndash; ' + (parseDate(e.end).getMonth() + 1) + '/' + parseDate(e.end).getDate()) : '';
      var when = MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + range + (e.time ? ', ' + e.time : '');
      var loc = e.location ? ' <span class="cal-up-loc">@ ' + esc(e.location) + '</span>' : '';
      var memo = e.description ? ' <i class="fas fa-sticky-note cal-up-memo" aria-hidden="true"></i>' : '';
      return '<li class="cal-up-item" data-ev="' + e._i + '" role="button" tabindex="0"><span class="cal-dot ev-' + typeOf(e) + '"></span>' +
        '<span class="cal-up-when">' + when + '</span><span class="cal-up-title">' + esc(e.title) + loc + memo + '</span></li>';
    }).join('') + '</ul>';
  }

  // ----- detail popup -----
  var modal;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'cal-modal'; modal.id = 'cal-modal'; modal.hidden = true;
    modal.innerHTML = '<div class="cal-modal-backdrop" data-close></div>' +
      '<div class="cal-modal-card" role="dialog" aria-modal="true" aria-labelledby="cal-m-title">' +
      '<button type="button" class="cal-modal-x" data-close aria-label="Close">&times;</button>' +
      '<div class="cal-modal-body"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (ev) { if (ev.target.hasAttribute('data-close')) closeModal(); });
    return modal;
  }
  function openModal(e) {
    if (!e) return;
    var t = typeOf(e), m = ensureModal();
    var h = '<div class="cal-m-badge ev-' + t + '"><span class="cal-dot ev-' + t + '"></span>' + TYPES[t] + '</div>';
    h += '<h3 class="cal-m-title" id="cal-m-title">' + esc(e.title) + '</h3>';
    h += '<div class="cal-m-row"><span class="cal-m-ic">🕒</span><span>' + esc(fmtWhen(e)) + (e.time ? '' : ' <span class="cal-m-dim">(All day)</span>') + '</span></div>';
    if (e.location) h += '<div class="cal-m-row"><span class="cal-m-ic">📍</span><span>' + esc(e.location) + '</span></div>';
    if (e.description) h += '<div class="cal-m-desc">' + descHtml(e.description) + '</div>';
    m.querySelector('.cal-modal-body').innerHTML = h;
    m.hidden = false; document.body.classList.add('cal-modal-open');
  }
  function closeModal() { if (modal) { modal.hidden = true; document.body.classList.remove('cal-modal-open'); } }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeModal(); });
  // event delegation: click / Enter on a chip or upcoming row opens its popup
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-ev]');
    if (el) openModal(EVENTS[+el.getAttribute('data-ev')]);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var el = ev.target.closest && ev.target.closest('[data-ev]');
    if (el) { ev.preventDefault(); openModal(EVENTS[+el.getAttribute('data-ev')]); }
  });

  // ----- Google Calendar source -----
  var GCOLOR = { '11': 'deadline', '4': 'deadline', '6': 'deadline', '7': 'seminar', '9': 'seminar', '1': 'seminar', '10': 'event', '2': 'meeting', '8': 'holiday' };
  function mapGoogle(items) {
    return (items || []).filter(function (e) { return e.status !== 'cancelled' && e.start && (e.start.date || e.start.dateTime); })
      .map(function (e) {
        var o = { title: e.summary || '(No title)', location: e.location || '', url: e.htmlLink || '', description: e.description || '', type: GCOLOR[e.colorId] || 'event' };
        if (e.start.dateTime) {
          o.date = e.start.dateTime.slice(0, 10); o.time = e.start.dateTime.slice(11, 16);
          if (e.end && e.end.dateTime && e.end.dateTime.slice(0, 10) !== o.date) o.end = e.end.dateTime.slice(0, 10);
        } else {
          o.date = e.start.date;
          if (e.end && e.end.date) { var endK = key(addDays(parseDate(e.end.date), -1)); if (endK !== o.date) o.end = endK; }
        }
        return o;
      });
  }
  var KR_HOLIDAYS = 'ko.south_korea#holiday@group.v.calendar.google.com';
  function gcalUrl(cfg, calId, timeMin) {
    return 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) + '/events'
      + '?key=' + encodeURIComponent(cfg.googleApiKey)
      + '&singleEvents=true&orderBy=startTime&maxResults=250'
      + '&timeZone=' + encodeURIComponent(cfg.timeZone || 'Asia/Seoul')
      + '&timeMin=' + encodeURIComponent(timeMin.toISOString());
  }
  function fetchCal(cfg, calId, timeMin, forcedType) {
    return fetch(gcalUrl(cfg, calId, timeMin)).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.items) throw new Error(d && d.error ? d.error.message : 'no items');
      var evs = mapGoogle(d.items);
      if (forcedType) evs.forEach(function (e) { e.type = forcedType; });
      return evs;
    });
  }
  function loadGoogle(cfg) {
    var root = document.getElementById('lab-calendar');
    if (root) root.innerHTML = '<p class="text-muted" style="padding:1.5rem 0">Loading calendar&hellip;</p>';
    var timeMin = new Date(); timeMin.setMonth(timeMin.getMonth() - (cfg.monthsBack || 2)); timeMin.setDate(1); timeMin.setHours(0, 0, 0, 0);
    var jobs = [fetchCal(cfg, cfg.googleCalendarId, timeMin, null)];                 // primary (lab) calendar
    if (cfg.koreanHolidays) jobs.push(                                              // + Korean public holidays (gray)
      fetchCal(cfg, KR_HOLIDAYS, timeMin, 'holiday').catch(function (e) {
        console.warn('[calendar] Korean holidays fetch failed (continuing without).', e); return [];
      }));
    Promise.all(jobs).then(function (lists) {
      setEvents([].concat.apply([], lists));
    }).catch(function (err) {                                                        // primary failed -> fall back to events.json
      console.warn('[calendar] Google Calendar fetch failed; using local events.json instead.', err);
      setEvents(window.LAB_EVENTS || []);
    });
  }

  function init() {
    var cfg = window.LAB_CAL_CONFIG || {};
    if (cfg.googleCalendarId && cfg.googleApiKey) loadGoogle(cfg);
    else setEvents(window.LAB_EVENTS || []);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
