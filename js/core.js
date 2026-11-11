// =====================================================================
// Trener gramatiky - core.js
// Ulozena hra, Leitner, vyber uloh, vyhodnoceni odpovedi
// 1. KONFIGURACE
// 2. POMOCNE FUNKCE (datum, nahoda)
// 3. ULOZENA HRA (nacteni, migrace, zaloha)
// 4. DATA (jevy a ulohy)
// 5. NORMALIZACE A KONTROLA ODPOVEDI
// 6. ZAZNAM ODPOVEDI (Leitner, slabiny, uroven, stav jevu)
// 7. VYBER ULOH (lekce, trenink, vstupni test)
// 8. STATISTIKY A SERIE
// 9. ODLOZENE MLUVENI
// =====================================================================
(function () {
  'use strict';

  // ---------- 1. KONFIGURACE ----------
  var CONFIG = {
    appVersion: '1.4',
    saveKey: 'trenerGramatiky.save',
    schemaVersion: 1,
    leitnerDays: [0, 1, 2, 4, 8, 16, 32],   // intervaly krabicek 0-6
    maxDaysPerUnit: 3,                        // pojistka proti zaseknuti
    lvlUp: 0.85, lvlDown: 0.60, lvlWindow: 6, // automaticka obtiznost
    doneAcc: 0.85, doneMin: 8,                // jev zvladnut
    firmAcc: 0.70,
    lesson: { review: 6, grammar: 6, speed: 4 },
    speedBaseSec: 8, speedPerWordSec: 1.5     // casovy limit pohotovosti
  };

  // ---------- 2. POMOCNE FUNKCE ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function addDays(str, n) {
    var p = str.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n); return dateStr(d);
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- 3. ULOZENA HRA ----------
  var MIGRATIONS = {
    // 1: function (s) { ...; return s; }   // priklad pro budouci zmeny
  };
  function freshState() {
    return {
      schemaVersion: CONFIG.schemaVersion, created: today(),
      settings: { offset: 0, voice: true },
      placementDone: false,
      units: {}, items: {}, weak: {}, words: {}, variants: {},
      later: { items: [], due: 0, notified: false },
      days: {}, streak: { n: 0, last: '' }, lessonDone: ''
    };
  }
  var S = null;
  function migrate(s) {
    while ((s.schemaVersion || 1) < CONFIG.schemaVersion) {
      var f = MIGRATIONS[s.schemaVersion || 1];
      if (f) s = f(s);
      s.schemaVersion = (s.schemaVersion || 1) + 1;
    }
    var base = freshState();
    for (var k in base) if (!(k in s)) s[k] = base[k];
    return s;
  }
  function load() {
    try {
      var raw = localStorage.getItem(CONFIG.saveKey);
      S = raw ? migrate(JSON.parse(raw)) : freshState();
    } catch (e) { S = freshState(); }
    return S;
  }
  function save() {
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(S)); } catch (e) { /* plne uloziste */ }
  }
  function exportSave() { return JSON.stringify(S, null, 1); }
  function importSave(text) {
    var s = JSON.parse(text);
    if (!s || typeof s !== 'object' || !s.units || !s.items) throw new Error('Neplatna zaloha');
    S = migrate(s); save();
  }
  function resetAll() { S = freshState(); save(); }

  // ---------- 4. DATA ----------
  var UNITS = (window.TG_DATA && window.TG_DATA.units) || [];
  var UNIT_BY_ID = {}, ITEM_BY_ID = {}, UNIT_OF_ITEM = {};
  UNITS.forEach(function (u) {
    UNIT_BY_ID[u.id] = u;
    u.items.forEach(function (it) { ITEM_BY_ID[it.id] = it; UNIT_OF_ITEM[it.id] = u.id; });
  });
  function unitState(id) {
    if (!S.units[id]) S.units[id] = { status: 'new', lvl: 1, hist: [], all: [], days: [] };
    return S.units[id];
  }
  function itemState(id) {
    if (!S.items[id]) S.items[id] = { box: 0, due: '', seen: 0, wrong: 0 };
    return S.items[id];
  }
  function effLvl(unitId) { return clamp(unitState(unitId).lvl + (S.settings.offset || 0), 1, 3); }

  // ---------- 5. NORMALIZACE A KONTROLA ODPOVEDI ----------
  function norm(s) {
    s = (' ' + String(s || '').toLowerCase() + ' ').replace(/[‘’`]/g, "'");
    s = s.replace(/won't/g, 'will not').replace(/can't/g, 'can not').replace(/cannot/g, 'can not');
    s = s.replace(/n't/g, ' not').replace(/'m\b/g, ' am').replace(/'re\b/g, ' are')
         .replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will');
    s = s.replace(/\b(he|she|it|that|what|where|there|who)'s\b/g, '$1 is');
    s = s.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }
  function correctList(item) {
    if (item.type === 'choice') return [item.ans];
    if (item.type === 'gap') return [item.ans.map(function (a) { return a.split('|')[0]; }).join(' ... ')];
    return item.en.concat(S.variants[item.id] || []);
  }
  // answer: choice = text, gap = pole textu, translate = text
  function check(item, answer) {
    if (item.type === 'choice') return answer === item.ans;
    if (item.type === 'gap') {
      if (!answer || answer.length !== item.ans.length) return false;
      for (var i = 0; i < item.ans.length; i++) {
        var alts = item.ans[i].split('|').map(norm);
        if (alts.indexOf(norm(answer[i])) < 0) return false;
      }
      return true;
    }
    var a = norm(answer);
    return correctList(item).some(function (c) { return norm(c) === a; });
  }
  function addVariant(itemId, text) {
    if (!S.variants[itemId]) S.variants[itemId] = [];
    if (S.variants[itemId].indexOf(text) < 0) S.variants[itemId].push(text);
    save();
  }
  function speedLimitSec(item) {
    var words = (item.en[0] || '').split(' ').length;
    return Math.round(CONFIG.speedBaseSec + CONFIG.speedPerWordSec * words);
  }

  // ---------- 6. ZAZNAM ODPOVEDI ----------
  function acc(arr) { if (!arr.length) return 0; var s = 0; arr.forEach(function (x) { s += x; }); return s / arr.length; }
  // vraci {lvlChange: -1|0|1}
  function record(itemId, ok, ms) {
    var t = today(), uid = UNIT_OF_ITEM[itemId], us = unitState(uid), is = itemState(itemId), out = { lvlChange: 0 };
    // 6.1 Leitner
    is.seen++;
    if (ok) { is.box = Math.min(is.box + 1, CONFIG.leitnerDays.length - 1); }
    else { is.box = 0; is.wrong++; }
    is.due = addDays(t, Math.max(1, CONFIG.leitnerDays[is.box]));
    // 6.2 Slabiny: vznik po prvni chybe, zmizi po dvou spravnych
    if (!ok) S.weak[itemId] = { streak: 0 };
    else if (S.weak[itemId]) { S.weak[itemId].streak++; if (S.weak[itemId].streak >= 2) delete S.weak[itemId]; }
    // 6.3 Historie jevu a automaticka obtiznost
    us.hist.push(ok ? 1 : 0); us.all.push(ok ? 1 : 0);
    if (us.all.length > 12) us.all.shift();
    if (us.days.indexOf(t) < 0) us.days.push(t);
    if (us.hist.length >= CONFIG.lvlWindow) {
      var a = acc(us.hist.slice(-CONFIG.lvlWindow));
      if (a >= CONFIG.lvlUp && us.lvl < 3) { us.lvl++; us.hist = []; out.lvlChange = 1; }
      else if (a < CONFIG.lvlDown && us.lvl > 1) { us.lvl--; us.hist = []; out.lvlChange = -1; }
    }
    // 6.4 Stav jevu
    var recent = us.all.slice(-CONFIG.doneMin), ra = acc(recent);
    if (us.lvl >= 2 && recent.length >= CONFIG.doneMin && ra >= CONFIG.doneAcc) us.status = 'done';
    else if (recent.length >= 4 && ra >= CONFIG.firmAcc) us.status = 'firming';
    else us.status = 'learning';
    // 6.5 Denni statistika
    var d = S.days[t] || (S.days[t] = { n: 0, ok: 0, ms: 0 });
    d.n++; if (ok) d.ok++; d.ms += (ms || 0);
    save();
    return out;
  }
  function setManualLvl(unitId, delta) {
    var us = unitState(unitId); us.lvl = clamp(us.lvl + delta, 1, 3); us.hist = []; save(); return us.lvl;
  }
  function lookup(word, saveIt) {
    var w = S.words[word] || (S.words[word] = { n: 0, saved: false });
    if (saveIt) w.saved = true; else w.n++;
    save();
  }

  // ---------- 7. VYBER ULOH ----------
  function unitAcc(uid) { return Math.round(acc(unitState(uid).all) * 100); }
  function currentUnit() {
    var t = today(), i, us;
    for (i = 0; i < UNITS.length; i++) {
      us = unitState(UNITS[i].id);
      if (us.status === 'done') continue;
      var past = us.days.filter(function (d) { return d !== t; }).length;
      if (past < CONFIG.maxDaysPerUnit) return UNITS[i];
    }
    // vse zvladnute nebo odlozene: vrat nejslabsi nezvladnuty jev
    var open = UNITS.filter(function (u) { return unitState(u.id).status !== 'done'; });
    open.sort(function (a, b) { return unitAcc(a.id) - unitAcc(b.id); });
    return open[0] || null;
  }
  function pickItems(unitId, lvl, n, exclude) {
    exclude = exclude || {};
    var u = UNIT_BY_ID[unitId], order = [lvl, lvl - 1, lvl + 1, lvl - 2, lvl + 2], out = [];
    order.forEach(function (L) {
      if (out.length >= n) return;
      var pool = shuffle(u.items.filter(function (it) { return it.lvl === L && !exclude[it.id]; }));
      pool.sort(function (a, b) { return itemState(a.id).seen - itemState(b.id).seen; });
      pool.forEach(function (it) { if (out.length < n) out.push(it); });
    });
    return out;
  }
  function dueItems(n) {
    var t = today(), ids = [];
    Object.keys(S.weak).forEach(function (id) { if (ITEM_BY_ID[id]) ids.push(id); });
    Object.keys(S.items).forEach(function (id) {
      var is = S.items[id];
      if (ITEM_BY_ID[id] && is.seen > 0 && is.due && is.due <= t && ids.indexOf(id) < 0) ids.push(id);
    });
    return ids.slice(0, n).map(function (id) { return ITEM_BY_ID[id]; });
  }
  function entry(item, block, timed) { return { item: item, unitId: UNIT_OF_ITEM[item.id], block: block, timed: !!timed }; }
  function buildLesson() {
    var q = [], used = {}, cu = currentUnit();
    dueItems(CONFIG.lesson.review).forEach(function (it) { used[it.id] = 1; q.push(entry(it, 'review')); });
    if (cu) pickItems(cu.id, effLvl(cu.id), CONFIG.lesson.grammar, used).forEach(function (it) { used[it.id] = 1; q.push(entry(it, 'grammar')); });
    // pohotovost: preklady z jevu, ktere uz nejsou nove, plus dnesni jev
    var pool = [];
    UNITS.forEach(function (u) {
      if (unitState(u.id).status !== 'new' || (cu && u.id === cu.id)) {
        u.items.forEach(function (it) { if (it.type === 'translate' && !used[it.id]) pool.push(it); });
      }
    });
    shuffle(pool).slice(0, CONFIG.lesson.speed).forEach(function (it) { q.push(entry(it, 'speed', true)); });
    return { kind: 'lesson', unitId: cu ? cu.id : null, queue: q };
  }
  function buildTraining(unitId, lvl) {
    return { kind: 'training', unitId: unitId, queue: pickItems(unitId, lvl, 8).map(function (it) { return entry(it, 'grammar'); }) };
  }
  function buildWeak() {
    var ids = shuffle(Object.keys(S.weak).filter(function (id) { return ITEM_BY_ID[id]; })).slice(0, 10);
    return { kind: 'weak', unitId: null, queue: ids.map(function (id) { return entry(ITEM_BY_ID[id], 'review'); }) };
  }
  function buildSpeed() {
    var pool = [];
    UNITS.forEach(function (u) { u.items.forEach(function (it) { if (it.type === 'translate') pool.push(it); }); });
    return { kind: 'speed', unitId: null, queue: shuffle(pool).slice(0, 8).map(function (it) { return entry(it, 'speed', true); }) };
  }
  function buildPlacement() {
    var q = [];
    UNITS.forEach(function (u) {
      [1, 2].forEach(function (L) {
        var pool = shuffle(u.items.filter(function (it) { return it.lvl === L; }));
        if (pool[0]) q.push(entry(pool[0], 'placement'));
      });
    });
    return { kind: 'placement', unitId: null, queue: q };
  }
  // results: [{itemId, ok}]
  function applyPlacement(results) {
    var per = {};
    results.forEach(function (r) { var uid = UNIT_OF_ITEM[r.itemId]; per[uid] = (per[uid] || 0) + (r.ok ? 1 : 0); });
    UNITS.forEach(function (u) {
      var us = unitState(u.id), n = per[u.id] || 0;
      us.lvl = n >= 2 ? 3 : (n === 1 ? 2 : 1);
      us.status = n >= 2 ? 'firming' : (n === 1 ? 'learning' : 'new');
    });
    S.placementDone = true; save();
  }

  // ---------- 8. STATISTIKY A SERIE ----------
  function finishLesson() {
    var t = today();
    if (S.streak.last !== t) {
      S.streak.n = (S.streak.last === addDays(t, -1)) ? S.streak.n + 1 : 1;
      S.streak.last = t;
    }
    S.lessonDone = t; save();
  }
  function streakNow() {
    var t = today();
    return (S.streak.last === t || S.streak.last === addDays(t, -1)) ? S.streak.n : 0;
  }
  function stageProgress() {
    var done = 0; UNITS.forEach(function (u) { if (unitState(u.id).status === 'done') done++; });
    return { done: done, total: UNITS.length };
  }
  function totals() {
    var n = 0, ok = 0, ms = 0;
    Object.keys(S.days).forEach(function (d) { n += S.days[d].n; ok += S.days[d].ok; ms += S.days[d].ms; });
    return { n: n, ok: ok, acc: n ? Math.round(ok / n * 100) : 0, avgSec: n ? Math.round(ms / n / 100) / 10 : 0, days: Object.keys(S.days).length };
  }

  // ---------- 9. ODLOZENE MLUVENI ----------
  // Vety k vysloveni odlozene na pozdeji (napr. v tramvaji). due = cas v ms, 0 = az budu moct.
  function laterState() { var L = S.later; return (L && L.items && L.items.length) ? L : null; }
  function laterReady() { var L = laterState(); return !!L && (!L.due || L.due <= Date.now()); }
  function deferItems(ids, minutes) {
    var L = S.later || (S.later = { items: [], due: 0, notified: false });
    ids.forEach(function (id) { if (L.items.indexOf(id) < 0) L.items.push(id); });
    L.due = minutes > 0 ? Date.now() + minutes * 60000 : 0;
    L.notified = false;
    save(); return L;
  }
  function laterDone(id) {
    var L = S.later; if (!L || !L.items) return;
    var i = L.items.indexOf(id); if (i >= 0) { L.items.splice(i, 1); save(); }
  }
  function buildLater() {
    var L = laterState(), ids = L ? L.items.filter(function (id) { return ITEM_BY_ID[id]; }) : [];
    return { kind: 'later', unitId: null, queue: ids.map(function (id) { return entry(ITEM_BY_ID[id], 'speed', true); }) };
  }

  window.Core = {
    CONFIG: CONFIG, UNITS: UNITS, UNIT_BY_ID: UNIT_BY_ID, ITEM_BY_ID: ITEM_BY_ID, UNIT_OF_ITEM: UNIT_OF_ITEM,
    state: function () { return S; }, load: load, save: save, exportSave: exportSave, importSave: importSave, resetAll: resetAll,
    today: today, norm: norm, check: check, correctList: correctList, addVariant: addVariant, speedLimitSec: speedLimitSec,
    unitState: unitState, itemState: itemState, effLvl: effLvl, unitAcc: unitAcc, record: record, setManualLvl: setManualLvl, lookup: lookup,
    currentUnit: currentUnit, pickItems: pickItems, buildLesson: buildLesson, buildTraining: buildTraining, buildWeak: buildWeak,
    buildSpeed: buildSpeed, buildPlacement: buildPlacement, applyPlacement: applyPlacement,
    finishLesson: finishLesson, streakNow: streakNow, stageProgress: stageProgress, totals: totals,
    laterState: laterState, laterReady: laterReady, deferItems: deferItems, laterDone: laterDone, buildLater: buildLater
  };
})();
