(function () {
  'use strict';

  var BASE = window.ACTIVITIES || [];
  var KEY = 'activity-calendar-custom-v1';
  var custom = [];
  try { custom = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { custom = []; }
  if (!Array.isArray(custom)) custom = [];
  var DATA = [];
  function rebuild() {
    DATA = BASE.slice();
    custom.forEach(function (c, i) {
      var o = {}; for (var k in c) o[k] = c[k];
      o.id = 1000 + i; o.custom = true; DATA.push(o);
    });
  }
  function saveCustom() {
    try { localStorage.setItem(KEY, JSON.stringify(custom)); return true; } catch (e) { return false; }
  }
  rebuild();
  var TYPES = {
    contest:  { label: '공모전',   c: 'c1' },
    activity: { label: '대외활동', c: 'c3' },
    edu:      { label: '교육',     c: 'c0' }
  };
  var ORDER = ['contest', 'activity', 'edu'];
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var TITLES = { home: '활동 달력', contest: '공모전', activity: '대외활동', edu: '교육', field: '분야별' };
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK = 'http://www.w3.org/1999/xlink';

  var app = document.getElementById('app');
  var titleEl = document.getElementById('title');
  var modal = document.getElementById('modal');
  var mTitle = document.getElementById('m-title');
  var mBody = document.getElementById('m-body');
  var toastEl = document.getElementById('toast');
  var todayBtn = document.getElementById('btn-today');
  var lastFocus = null;
  var toastTimer = 0;

  /* ---------- 날짜 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var TODAY = ymd(new Date());
  function diffDays(s) { return Math.round((parse(s) - parse(TODAY)) / 86400000); }
  function fmt(s) {
    if (!s) return '';
    if (!DATE_RE.test(s)) return s;
    var d = parse(s);
    var base = (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')';
    return d.getFullYear() === parse(TODAY).getFullYear() ? base : d.getFullYear() + '.' + base;
  }
  function dday(a) {
    if (!a.end) return '상시·미정';
    var n = diffDays(a.end);
    if (n < 0) return '마감';
    return n === 0 ? 'D-DAY' : 'D-' + n;
  }
  function isEnded(a) { return !!a.end && diffDays(a.end) < 0; }
  function period(a) {
    if (a.start && a.end) return fmt(a.start) + ' ~ ' + fmt(a.end);
    if (a.end) return '~ ' + fmt(a.end);
    if (a.start) return fmt(a.start) + ' ~ 상시·모집 시 마감';
    return '상시·미정';
  }

  /* ---------- DOM 도우미 ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function icon(name, cls) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(SVG_NS, 'use');
    u.setAttribute('href', '#i-' + name);
    u.setAttributeNS(XLINK, 'xlink:href', '#i-' + name);
    s.appendChild(u);
    return s;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function dot(type) { return el('span', 'dot ' + TYPES[type].c); }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  /* ---------- 정렬 · 필터 ---------- */
  function byDeadline(a, b) {
    var ra = isEnded(a) ? 2 : (a.end ? 0 : 1);
    var rb = isEnded(b) ? 2 : (b.end ? 0 : 1);
    if (ra !== rb) return ra - rb;
    if (ra === 2) return a.end < b.end ? 1 : (a.end > b.end ? -1 : 0);
    if (a.end !== b.end) return (a.end || '') < (b.end || '') ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  }
  function haystack(a) {
    return (a.name + ' ' + a.tags.join(' ') + ' ' + a.prize + ' ' + a.note).toLowerCase();
  }
  function tagCounts(list) {
    var m = {};
    list.forEach(function (a) { a.tags.forEach(function (t) { m[t] = (m[t] || 0) + 1; }); });
    return Object.keys(m).map(function (t) { return { tag: t, n: m[t] }; })
      .sort(function (x, y) { return y.n - x.n || (x.tag < y.tag ? -1 : 1); });
  }

  /* ---------- 상태 ---------- */
  var now = new Date();
  var state = {
    y: now.getFullYear(), m: now.getMonth(), sel: TODAY,
    calTypes: { contest: true, activity: true, edu: true },
    showEnded: false, q: '', tag: '', typeFilter: 'all'
  };

  /* ---------- 카드 · 상세 ---------- */
  function card(a) {
    var b = el('button', 'card' + (isEnded(a) ? ' done' : ''));
    b.type = 'button';
    var top = el('span', 'top');
    top.appendChild(el('span', 'tag', TYPES[a.type].label));
    top.appendChild(el('span', 'd', dday(a)));
    b.appendChild(top);
    var nm = el('span', 'name');
    nm.appendChild(el('mark', TYPES[a.type].c, a.name));
    b.appendChild(nm);
    var meta = a.end ? '마감 ' + fmt(a.end) : '마감 상시·미정';
    if (a.prize && a.prize !== '미기재' && a.prize !== '없음') meta += ' · ' + a.prize;
    b.appendChild(el('span', 'meta', meta));
    var tg = el('span', 'tags');
    a.tags.forEach(function (t) { tg.appendChild(el('span', 'tag', t)); });
    b.appendChild(tg);
    b.addEventListener('click', function () { openDetail(a, b); });
    return b;
  }
  function cardList(items) {
    var ul = el('ul', 'list');
    items.forEach(function (a) { var li = el('li'); li.appendChild(card(a)); ul.appendChild(li); });
    return ul;
  }
  function kv(dl, label, val, tags) {
    if (!val && !tags) return;
    var row = el('div');
    row.appendChild(el('dt', null, label));
    var dd = el('dd');
    if (tags) {
      var t = el('div', 'tags');
      tags.forEach(function (x) { t.appendChild(el('span', 'tag', x)); });
      dd.appendChild(t);
    } else {
      dd.textContent = val;
    }
    row.appendChild(dd);
    dl.appendChild(row);
  }
  function openDetail(a, from) {
    lastFocus = from || document.activeElement;
    mTitle.textContent = a.name;
    clear(mBody);
    var head = el('div', 'row');
    head.appendChild(el('mark', TYPES[a.type].c, TYPES[a.type].label));
    head.appendChild(el('span', 'num', dday(a)));
    mBody.appendChild(head);
    var dl = el('dl', 'kv');
    kv(dl, '분야', null, a.tags);
    kv(dl, '접수 기간', period(a));
    kv(dl, '발표', fmt(a.announce));
    kv(dl, '상금', a.prize);
    kv(dl, '지급 시기', a.pay);
    kv(dl, '비고', a.note);
    mBody.appendChild(dl);
    if (a.custom) {
      var del = el('button', 'btn danger block');
      del.type = 'button';
      del.textContent = '이 활동 삭제';
      del.addEventListener('click', function () {
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm'); del.textContent = '한 번 더 누르면 삭제돼요'; return;
        }
        var idx = a.id - 1000;
        custom.splice(idx, 1); saveCustom(); rebuild();
        closeDetail(); render(); toast('삭제했어요');
      });
      mBody.appendChild(del);
    }
    if (a.link) {
      var go = el('a', 'btn solid block');
      go.href = a.link; go.target = '_blank'; go.rel = 'noopener noreferrer';
      go.appendChild(icon('link'));
      go.appendChild(document.createTextNode('공식 페이지 열기'));
      mBody.appendChild(go);
      var cp = el('button', 'btn block');
      cp.type = 'button';
      cp.appendChild(icon('copy'));
      cp.appendChild(document.createTextNode('링크 복사'));
      cp.addEventListener('click', function () {
        var done = function () { toast('링크를 복사했어요'); };
        var fail = function () { toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요'); };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(a.link).then(done, fail);
          } else { fail(); }
        } catch (e) { fail(); }
      });
      mBody.appendChild(cp);
    } else {
      mBody.appendChild(el('div', 'empty', '등록된 링크가 없어요'));
    }
    modal.hidden = false;
    document.getElementById('m-close').focus();
  }
  function closeDetail() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  document.getElementById('m-close').addEventListener('click', closeDetail);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeDetail(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  /* ---------- 활동 추가 (프롬프트 복사 → 코드 붙여넣기) ---------- */
  function buildPrompt() {
    var tags = tagCounts(DATA).slice(0, 40).map(function (t) { return t.tag; }).join(', ');
    return [
      '아래 링크의 공모전/대외활동/교육 정보를 읽고, 내 활동 달력에 붙여넣을 코드만 출력해줘.',
      '설명 없이 JSON 코드블록 하나만 써줘.',
      '',
      '형식:',
      '[{"type":"contest","tags":["분야"],"name":"활동명","start":"YYYY-MM-DD","end":"YYYY-MM-DD","announce":"","prize":"","pay":"","note":"","link":""}]',
      '',
      '규칙:',
      '① type: 공모전=contest, 대외활동=activity, 교육=edu',
      '② tags: 분야 1~4개. 가능하면 기존 태그를 써줘: ' + tags,
      '③ start/end: 접수 시작일/마감일(YYYY-MM-DD). 연도가 없으면 2026년. 모르거나 상시면 ""',
      '④ announce: 발표·시상일. 날짜를 모르면 "12월 중"처럼 글로',
      '⑤ prize: 상금(예: "대상 100만 / 최우수 50만")',
      '⑥ pay: 상금 지급 시기. 모르면 "미기재"',
      '⑦ note: 자격·유의사항을 짧게. 링크가 안 열리면 여기에 적고 아는 만큼만 채워줘',
      '⑧ link: 활동 링크',
      '',
      '활동 링크: '
    ].join('\n');
  }
  function copyText(text, okMsg) {
    var fail = function () { toast('복사하지 못했어요. 직접 복사해 주세요'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fail);
      } else { fail(); }
    } catch (e) { fail(); }
  }
  function str(v) { return typeof v === 'string' ? v.trim() : ''; }
  function normalize(o, n) {
    var p = '(' + n + '번째) ';
    if (!o || typeof o !== 'object') return { err: p + '활동 형식이 아니에요' };
    var type = str(o.type);
    if (!TYPES[type]) return { err: p + 'type은 contest, activity, edu 중 하나여야 해요' };
    var name = str(o.name);
    if (!name) return { err: p + '활동명이 비어 있어요' };
    var tags = Array.isArray(o.tags) ? o.tags.map(str).filter(Boolean) : [];
    var start = str(o.start), end = str(o.end);
    if (start && !DATE_RE.test(start)) return { err: p + 'start는 YYYY-MM-DD 형식이어야 해요' };
    if (end && !DATE_RE.test(end)) return { err: p + 'end는 YYYY-MM-DD 형식이어야 해요' };
    if (isNaN(parse(end || '2000-01-01')) || isNaN(parse(start || '2000-01-01'))) return { err: p + '날짜가 올바르지 않아요' };
    var link = str(o.link);
    if (link && !/^https?:\/\//i.test(link)) link = '';
    return { v: {
      type: type, tags: tags, name: name, start: start, end: end,
      announce: str(o.announce), prize: str(o.prize) || '미기재', pay: str(o.pay) || '미기재',
      note: str(o.note), link: link
    } };
  }
  function importCode(text) {
    var t = text.trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    if (!t) return { err: '붙여넣은 코드가 없어요' };
    var data;
    try { data = JSON.parse(t); } catch (e) { return { err: '코드를 읽지 못했어요. 코드블록 안의 내용을 통째로 붙여넣어 주세요' }; }
    if (!Array.isArray(data)) data = [data];
    var items = [], i, r;
    for (i = 0; i < data.length; i++) {
      r = normalize(data[i], i + 1);
      if (r.err) return r;
      items.push(r.v);
    }
    var added = 0, dup = 0;
    items.forEach(function (it) {
      var exists = DATA.some(function (a) { return a.name === it.name && (!it.link || !a.link || a.link === it.link); });
      if (exists) { dup++; return; }
      custom.push(it); rebuild(); added++;
    });
    if (added && !saveCustom()) return { err: '이 브라우저에서는 저장할 수 없어요 (시크릿 모드인지 확인해 주세요)' };
    return { added: added, dup: dup };
  }
  function openAdd() {
    lastFocus = document.getElementById('btn-add');
    mTitle.textContent = '활동 추가';
    clear(mBody);

    var s1 = el('div', 'note');
    s1.appendChild(el('b', null, '추가하는 순서'));
    s1.appendChild(el('p', null, '① 프롬프트 복사를 누르고 Claude에게 붙여넣어요.'));
    s1.appendChild(el('p', null, '② 프롬프트 끝에 활동 링크를 붙여서 보내요.'));
    s1.appendChild(el('p', null, '③ 받은 코드를 아래 칸에 붙여넣고 저장해요.'));
    mBody.appendChild(s1);

    var cp = el('button', 'btn solid block');
    cp.type = 'button';
    cp.appendChild(icon('copy'));
    cp.appendChild(document.createTextNode('프롬프트 복사'));
    cp.addEventListener('click', function () { copyText(buildPrompt(), '프롬프트를 복사했어요'); });
    mBody.appendChild(cp);

    var f = el('label', 'field');
    f.appendChild(el('span', null, 'Claude가 준 코드'));
    var ta = el('textarea', 'input');
    ta.placeholder = '[{"type":"contest", ...}]';
    ta.spellcheck = false;
    f.appendChild(ta);
    mBody.appendChild(f);

    var msg = el('p', 'sub');
    msg.setAttribute('role', 'status');
    mBody.appendChild(msg);

    var save = el('button', 'btn block');
    save.type = 'button';
    save.textContent = '저장';
    save.addEventListener('click', function () {
      var r = importCode(ta.value);
      if (r.err) { msg.textContent = r.err; return; }
      if (!r.added) { msg.textContent = '이미 있는 활동이에요 (' + r.dup + '건)'; return; }
      closeDetail(); render();
      toast(r.added + '건 저장했어요' + (r.dup ? ' (중복 ' + r.dup + '건 제외)' : ''));
    });
    mBody.appendChild(save);

    mBody.appendChild(el('p', 'sub', '저장한 활동은 이 기기의 이 브라우저에만 남아요. 다른 기기에서도 보려면 data.js에 옮겨 적어야 해요.'));
    modal.hidden = false;
    ta.focus();
  }

  /* ---------- 홈: 달력 ---------- */
  function viewHome() {
    var wrap = el('div', 'home');
    var left = el('div', 'stack');
    var right = el('div', 'day-panel');
    wrap.appendChild(left);
    wrap.appendChild(right);

    /* 머리: 이전 / 연월 / 다음 */
    var head = el('div', 'cal-head');
    var h = el('h2', null, state.y + '년 ' + (state.m + 1) + '월');
    var nav = el('div', 'row');
    var prev = el('button', 'icon-btn'); prev.type = 'button'; prev.setAttribute('aria-label', '이전 달');
    prev.appendChild(icon('prev'));
    var next = el('button', 'icon-btn'); next.type = 'button'; next.setAttribute('aria-label', '다음 달');
    next.appendChild(icon('next'));
    prev.addEventListener('click', function () { shiftMonth(-1); });
    next.addEventListener('click', function () { shiftMonth(1); });
    nav.appendChild(prev); nav.appendChild(next);
    head.appendChild(h); head.appendChild(nav);
    left.appendChild(head);

    /* 유형 필터 (색 안내 겸용) */
    var legend = el('div', 'legend');
    ORDER.forEach(function (t) {
      var c = el('button', 'chip' + (state.calTypes[t] ? ' on' : ''));
      c.type = 'button';
      c.setAttribute('aria-pressed', state.calTypes[t] ? 'true' : 'false');
      c.appendChild(dot(t));
      c.appendChild(document.createTextNode(TYPES[t].label));
      c.addEventListener('click', function () { state.calTypes[t] = !state.calTypes[t]; render(); });
      legend.appendChild(c);
    });
    left.appendChild(legend);

    /* 달력 격자 */
    var byDay = {};
    DATA.forEach(function (a) {
      if (!a.end || !state.calTypes[a.type]) return;
      (byDay[a.end] = byDay[a.end] || []).push(a);
    });
    Object.keys(byDay).forEach(function (k) {
      byDay[k].sort(function (a, b) { return ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || (a.name < b.name ? -1 : 1); });
    });

    var cal = el('div', 'cal');
    DOW.forEach(function (d) { cal.appendChild(el('div', 'cal-dow', d)); });
    var first = new Date(state.y, state.m, 1);
    var days = new Date(state.y, state.m + 1, 0).getDate();
    var i;
    for (i = 0; i < first.getDay(); i++) cal.appendChild(el('div', 'cal-blank'));
    for (i = 1; i <= days; i++) {
      (function (day) {
        var key = state.y + '-' + pad(state.m + 1) + '-' + pad(day);
        var cls = 'cal-cell' + (key === TODAY ? ' today' : '') + (key === state.sel ? ' sel' : '');
        var b = el('button', cls);
        b.type = 'button';
        var items = byDay[key] || [];
        b.setAttribute('aria-label', (state.m + 1) + '월 ' + day + '일, 활동 ' + items.length + '건');
        b.appendChild(el('span', 'cal-d', '' + day));
        items.slice(0, 3).forEach(function (a) {
          b.appendChild(el('span', 'cal-item ' + TYPES[a.type].c, a.name));
        });
        if (items.length > 3) b.appendChild(el('span', 'cal-more', '+' + (items.length - 3) + '건'));
        b.addEventListener('click', function () { state.sel = key; render(); });
        cal.appendChild(b);
      })(i);
    }
    var tail = (7 - ((first.getDay() + days) % 7)) % 7;
    for (i = 0; i < tail; i++) cal.appendChild(el('div', 'cal-blank'));
    left.appendChild(cal);

    var note = el('div', 'note');
    note.appendChild(el('b', null, '보는 방법'));
    note.appendChild(el('p', null, '① 달력에는 각 활동의 마감일에 활동명이 표시돼요.'));
    note.appendChild(el('p', null, '② 날짜를 누르면 그날 마감되는 활동이 옆(아래)에 나와요.'));
    note.appendChild(el('p', null, '③ 활동을 누르면 발표일·상금·지급 시기를 볼 수 있어요.'));
    left.appendChild(note);

    /* 선택한 날 */
    var sd = parse(state.sel);
    var dh = el('header');
    dh.appendChild(el('h2', null, (sd.getMonth() + 1) + '월 ' + sd.getDate() + '일 (' + DOW[sd.getDay()] + ')'));
    var dayItems = (byDay[state.sel] || []);
    dh.appendChild(el('span', 'sub', '마감 ' + dayItems.length + '건'));
    right.appendChild(dh);
    if (dayItems.length) right.appendChild(cardList(dayItems));
    else right.appendChild(el('div', 'empty', '이 날 마감되는 활동이 없어요'));

    /* 상시·미정 */
    var open = DATA.filter(function (a) { return !a.end && state.calTypes[a.type]; });
    if (open.length) {
      var det = el('details');
      det.appendChild(el('summary', null, '마감일 미정·상시 (' + open.length + ')'));
      var body = el('div', 'det-body');
      body.appendChild(cardList(open));
      det.appendChild(body);
      right.appendChild(det);
    }
    return wrap;
  }
  function shiftMonth(n) {
    var d = new Date(state.y, state.m + n, 1);
    state.y = d.getFullYear(); state.m = d.getMonth();
    var key = state.y + '-' + pad(state.m + 1) + '-01';
    state.sel = key;
    render();
  }
  function goToday() {
    var d = new Date();
    state.y = d.getFullYear(); state.m = d.getMonth(); state.sel = TODAY;
    if (currentRoute().name !== 'home') location.hash = '#/home';
    render();
  }

  /* ---------- 목록 화면 공통 ---------- */
  function searchField(onInput) {
    var f = el('label', 'field');
    f.appendChild(el('span', null, '검색'));
    var inp = el('input', 'input');
    inp.type = 'search'; inp.placeholder = '활동명, 분야, 상금'; inp.value = state.q;
    inp.addEventListener('input', function () { state.q = inp.value.trim().toLowerCase(); onInput(); });
    f.appendChild(inp);
    return f;
  }
  function endedChip(onChange) {
    var c = el('button', 'chip' + (state.showEnded ? ' on' : ''));
    c.type = 'button';
    c.setAttribute('aria-pressed', state.showEnded ? 'true' : 'false');
    c.textContent = '마감 지난 활동 포함';
    c.addEventListener('click', function () {
      state.showEnded = !state.showEnded;
      c.classList.toggle('on', state.showEnded);
      c.setAttribute('aria-pressed', state.showEnded ? 'true' : 'false');
      onChange();
    });
    return c;
  }
  function filterItems(items) {
    return items.filter(function (a) {
      if (!state.showEnded && isEnded(a)) return false;
      if (state.tag && a.tags.indexOf(state.tag) < 0) return false;
      if (state.q && haystack(a).indexOf(state.q) < 0) return false;
      return true;
    }).sort(byDeadline);
  }
  function fillList(box, count, items) {
    clear(box);
    count.textContent = items.length + '건';
    if (items.length) box.appendChild(cardList(items));
    else box.appendChild(el('div', 'empty', '조건에 맞는 활동이 없어요'));
  }

  /* ---------- 유형별 ---------- */
  function viewType(type) {
    var all = DATA.filter(function (a) { return a.type === type; });
    var wrap = el('div', 'stack');
    var head = el('div', 'row between');
    var hh = el('div', 'row');
    hh.appendChild(el('mark', TYPES[type].c, TYPES[type].label));
    head.appendChild(hh);
    var count = el('span', 'num');
    head.appendChild(count);
    wrap.appendChild(head);

    var box = el('div');
    function refresh() { fillList(box, count, filterItems(all)); }

    wrap.appendChild(searchField(refresh));

    var tags = tagCounts(all);
    var det = el('details');
    det.appendChild(el('summary', null, '분야로 좁히기 (' + tags.length + ')'));
    var body = el('div', 'det-body');
    var chips = el('div', 'chips');
    function chipFor(label, val, n) {
      var c = el('button', 'chip' + (state.tag === val ? ' on' : ''));
      c.type = 'button';
      c.appendChild(document.createTextNode(label));
      if (n != null) c.appendChild(el('span', 'cnt', '' + n));
      c.addEventListener('click', function () {
        state.tag = val;
        Array.prototype.forEach.call(chips.children, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        refresh();
      });
      return c;
    }
    chips.appendChild(chipFor('전체', '', all.length));
    tags.forEach(function (t) { chips.appendChild(chipFor(t.tag, t.tag, t.n)); });
    body.appendChild(chips);
    det.appendChild(body);
    wrap.appendChild(det);

    var r = el('div', 'chips');
    r.appendChild(endedChip(refresh));
    wrap.appendChild(r);
    wrap.appendChild(box);
    refresh();
    return wrap;
  }

  /* ---------- 분야별 ---------- */
  function viewField(tag) {
    state.tag = tag || '';
    var wrap = el('div', 'stack');
    var head = el('div', 'row between');
    head.appendChild(el('h2', null, tag ? '분야 · ' + tag : '분야 전체'));
    var count = el('span', 'num');
    head.appendChild(count);
    wrap.appendChild(head);

    var seg = el('div', 'seg');
    var chipsBox = el('div', 'chips');
    var box = el('div');
    var det = el('details');
    if (!tag) det.open = true;

    function pool() {
      return DATA.filter(function (a) { return state.typeFilter === 'all' || a.type === state.typeFilter; });
    }
    function buildChips() {
      clear(chipsBox);
      var tags = tagCounts(pool());
      var all = document.createElement('a');
      all.className = 'chip' + (tag ? '' : ' on');
      all.href = '#/field';
      all.textContent = '전체';
      chipsBox.appendChild(all);
      tags.forEach(function (t) {
        var a = document.createElement('a');
        a.className = 'chip' + (t.tag === tag ? ' on' : '');
        a.href = '#/field/' + encodeURIComponent(t.tag);
        a.appendChild(document.createTextNode(t.tag));
        a.appendChild(el('span', 'cnt', '' + t.n));
        chipsBox.appendChild(a);
      });
      det.firstChild.textContent = '분야 고르기 (' + tags.length + ')';
    }
    function refresh() { fillList(box, count, filterItems(pool())); }

    [['all', '전체'], ['contest', '공모전'], ['activity', '대외활동'], ['edu', '교육']].forEach(function (p) {
      var b = el('button', state.typeFilter === p[0] ? 'on' : '', p[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.typeFilter = p[0];
        Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        buildChips(); refresh();
      });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);

    det.appendChild(el('summary', null, '분야 고르기'));
    var body = el('div', 'det-body');
    body.appendChild(chipsBox);
    det.appendChild(body);
    wrap.appendChild(det);
    buildChips();

    wrap.appendChild(searchField(refresh));
    var r = el('div', 'chips');
    r.appendChild(endedChip(refresh));
    wrap.appendChild(r);
    wrap.appendChild(box);
    refresh();
    return wrap;
  }

  /* ---------- 라우터 ---------- */
  function currentRoute() {
    var h = (location.hash || '#/home').replace(/^#\/?/, '');
    var parts = h.split('/');
    var name = parts[0] || 'home';
    if (!TITLES[name]) name = 'home';
    var arg = '';
    if (parts[1]) { try { arg = decodeURIComponent(parts.slice(1).join('/')); } catch (e) { arg = ''; } }
    return { name: name, arg: arg };
  }
  var lastName = '';
  function render() {
    var r = currentRoute();
    if (r.name !== lastName) { state.q = ''; state.tag = ''; state.showEnded = false; lastName = r.name; }
    titleEl.textContent = TITLES[r.name];
    document.title = TITLES[r.name] + ' · 활동 달력';
    todayBtn.hidden = r.name !== 'home';
    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      if (a.getAttribute('data-nav') === r.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var y = window.pageYOffset;
    clear(app);
    var v;
    if (r.name === 'home') v = viewHome();
    else if (r.name === 'field') v = viewField(r.arg);
    else v = viewType(r.name);
    app.appendChild(v);
    window.scrollTo(0, y);
  }

  window.addEventListener('hashchange', function () { closeDetail(); window.scrollTo(0, 0); render(); });
  todayBtn.addEventListener('click', goToday);
  document.getElementById('btn-add').addEventListener('click', openAdd);
  document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
  render();
})();
