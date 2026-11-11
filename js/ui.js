// =====================================================================
// Trener gramatiky - ui.js
// Obrazovky a prubeh cviceni
// 1. STAV A POMOCNE FUNKCE
// 2. SPOLECNE PRVKY (ikony, lista, anglicka veta se slovnickem)
// 3. OBRAZOVKA DNES
// 4. OBRAZOVKA MAPA A DETAIL JEVU
// 5. OBRAZOVKA TRENINK
// 6. OBRAZOVKA PREHLED (statistiky, slabiny, slovicka, nastaveni)
// 7. CVICENI (vykresleni ulohy)
// 8. CVICENI (logika: odpoved, napoveda, obtiznost, casovac, mikrofon)
// 9. SHRNUTI
// 10. UDALOSTI A START
// =====================================================================
(function () {
  'use strict';
  var C = window.Core, A = window.Sound;

  // ---------- 1. STAV A POMOCNE FUNKCE ----------
  var app = null;
  var V = { view: 'home', unitId: null, trainLvl: 0, msg: '', resetArmed: false };
  var ses = null;          // bezici cviceni
  var lastSummary = null;  // posledni shrnuti
  var timer = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function S() { return C.state(); }
  var DAYS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
  var MONTHS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  function dateLabel() { var d = new Date(); return DAYS[d.getDay()] + ' ' + d.getDate() + '. ' + MONTHS[d.getMonth()]; }
  function daysWord(n) { return n === 1 ? 'den' : (n >= 2 && n <= 4 ? 'dny' : 'dní'); }
  var STATUS = { 'new': 'Nové', learning: 'Učím se', firming: 'Upevňuji', done: 'Zvládnuto' };
  var BLOCK = { review: 'Opakování', grammar: 'Gramatika', speed: 'Pohotovost', placement: 'Vstupní test' };
  var STAGES = [
    { n: 1, title: 'Přítomnost, minulost, plány', first: 1 },
    { n: 2, title: 'Předpřítomný čas, will', first: 4 },
    { n: 3, title: 'Vazby, modální, podmínky', first: 7 },
    { n: 4, title: 'Trpný rod, vyprávění', first: 10 }
  ];

  // ---------- 2. SPOLECNE PRVKY ----------
  var ICON = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    train: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    back: '<path d="M15 5l-7 7 7 7"/>'
  };
  function icon(name, size) {
    size = size || 22;
    return '<svg aria-hidden="true" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }
  function nav() {
    var tabs = [['home', 'Dnes', 'home'], ['train', 'Trénink', 'train'], ['map', 'Mapa', 'map'], ['overview', 'Přehled', 'stats']];
    return '<nav class="nav" aria-label="Hlavní">' + tabs.map(function (t) {
      var on = (V.view === t[0]) || (V.view === 'unit' && t[0] === 'map');
      return '<button type="button" class="nav-b' + (on ? ' on' : '') + '" data-act="go" data-v="' + t[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + icon(t[2]) + '<span>' + t[1] + '</span></button>';
    }).join('') + '</nav>';
  }
  function page(inner) { return '<main class="page">' + inner + '</main>' + nav(); }
  // anglicky text, kazde slovo jde tuknout
  function enText(text) {
    return String(text).split(/([A-Za-z][A-Za-z']*)/).map(function (p, i) {
      if (i % 2 === 1) return '<span class="w" data-act="word" data-w="' + esc(p.toLowerCase()) + '">' + esc(p) + '</span>';
      return esc(p).replace(/___/g, '<span class="blank">___</span>');
    }).join('');
  }
  function bubble() {
    if (!ses || !ses.bubble) return '';
    var w = ses.bubble, cz = (window.TG_DICT || {})[w];
    var saved = S().words[w] && S().words[w].saved;
    return '<div class="bubble"><div><b>' + esc(w) + '</b> · ' + esc(cz || 've slovníčku zatím není') + '</div>' +
      '<button type="button" class="btn-ghost" data-act="saveword" data-w="' + esc(w) + '"' + (saved ? ' disabled' : '') + '>' + (saved ? 'Uloženo' : 'Uložit slovíčko') + '</button></div>';
  }

  // ---------- 3. OBRAZOVKA DNES ----------
  function viewHome() {
    var st = S(), cu = C.currentUnit(), prog = C.stageProgress(), streak = C.streakNow();
    var weakN = Object.keys(st.weak).length, doneToday = st.lessonDone === C.today();
    var h = '<div class="head"><div><div class="muted small">' + dateLabel() + '</div><h1>Dnes</h1></div>' +
      '<div class="chip">Série ' + streak + ' ' + daysWord(streak) + '</div></div>';
    if (V.msg) { h += '<div class="card note">' + esc(V.msg) + '</div>'; }
    if (!st.placementDone) {
      h += '<div class="card"><div class="card-t">Vstupní test</div>' +
        '<p class="muted">18 krátkých úloh, asi 5 minut. Podle výsledku nastavím obtížnost každého jevu. Do statistik se nepočítá.</p>' +
        '<button type="button" class="btn" data-act="placement">Spustit vstupní test</button>' +
        '<button type="button" class="btn-sec" data-act="skipplacement">Přeskočit, začít od začátku</button></div>';
    }
    var les = C.buildLesson(), nRev = 0, nGr = 0, nSp = 0;
    les.queue.forEach(function (e) { if (e.block === 'review') nRev++; else if (e.block === 'grammar') nGr++; else nSp++; });
    h += '<div class="card"><div class="row-b"><div class="card-t">Dnešní lekce</div><div class="muted small">' + les.queue.length + ' úloh</div></div>';
    h += step(1, 'Opakování', nRev ? nRev + ' vět z minulých dní' : 'Dnes není co opakovat');
    h += step(2, 'Gramatika dne', cu ? cu.code + ' ' + cu.title + ' · stupeň ' + C.effLvl(cu.id) : 'Etapa je hotová');
    h += step(3, 'Pohotovost', nSp + ' překladů na čas');
    h += step(4, 'Shrnutí', 'Chyby a co bylo procvičeno');
    h += '<button type="button" class="btn" data-act="lesson">' + (doneToday ? 'Dnešní lekce je hotová. Další kolo' : 'Začít lekci') + '</button></div>';
    h += '<div class="card"><div class="row-b"><div class="card-s">Etapa 1 ze 4</div><div class="muted small">' + prog.done + ' z ' + prog.total + ' jevů zvládnuto</div></div>' +
      '<div class="bar"><div class="bar-in" style="width:' + Math.round(prog.done / Math.max(1, prog.total) * 100) + '%"></div></div>' +
      '<div class="muted small">' + STAGES[0].title + '</div></div>';
    if (weakN) {
      h += '<div class="card warn row-b"><div><div class="card-s">Co mi nejde</div><div class="small">' + weakN + ' vět čeká na opakování</div></div>' +
        '<button type="button" class="btn-warn" data-act="weak">Zopakovat</button></div>';
    }
    return page(h);
  }
  function step(n, t, s) {
    return '<div class="step"><div class="step-n">' + n + '</div><div><div class="card-s">' + t + '</div><div class="muted small">' + esc(s) + '</div></div></div>';
  }

  // ---------- 4. OBRAZOVKA MAPA A DETAIL JEVU ----------
  function viewMap() {
    var done = C.stageProgress().done;
    var h = '<div class="head"><div><h1>Mapa gramatiky</h1><div class="muted small">' + done + ' z 36 jevů zvládnuto</div></div></div>';
    h += '<div class="legend">' + ['done', 'firming', 'learning', 'new'].map(function (k) { return '<span><i class="cell st-' + k + '"></i>' + STATUS[k] + '</span>'; }).join('') + '</div>';
    STAGES.forEach(function (sg) {
      var cells = '';
      if (sg.n === 1) {
        C.UNITS.forEach(function (u) {
          var us = C.unitState(u.id);
          cells += '<button type="button" class="cell st-' + us.status + '" data-act="unit" data-u="' + u.id + '" aria-label="' + esc(u.code + ' ' + u.title + ', ' + STATUS[us.status]) + '">' + u.code + '</button>';
        });
      } else {
        for (var i = 0; i < 9; i++) cells += '<span class="cell st-new">' + (sg.first + Math.floor(i / 3)) + 'ABC'.charAt(i % 3) + '</span>';
      }
      h += '<div class="card"><div class="row-b"><div class="card-s">Etapa ' + sg.n + ' · ' + sg.title + '</div><div class="muted small">' + (sg.n === 1 ? done + ' / 9' : 'připravuje se') + '</div></div><div class="cells">' + cells + '</div>';
      if (sg.n === 1) {
        C.UNITS.forEach(function (u) {
          var us = C.unitState(u.id);
          if (us.status === 'learning' || us.status === 'firming') {
            h += '<button type="button" class="urow" data-act="unit" data-u="' + u.id + '"><span><b>' + u.code + ' ' + esc(u.title) + '</b><br><span class="muted small">' + STATUS[us.status] + ' · stupeň ' + C.effLvl(u.id) + '</span></span><b>' + (us.all.length ? C.unitAcc(u.id) + ' %' : '') + '</b></button>';
          }
        });
      }
      h += '</div>';
    });
    return page(h);
  }
  function viewUnit() {
    var u = C.UNIT_BY_ID[V.unitId], us = C.unitState(u.id), lvl = V.trainLvl || C.effLvl(u.id);
    var h = '<div class="head"><button type="button" class="icon-b" data-act="go" data-v="map" aria-label="Zpět na mapu">' + icon('back') + '</button>' +
      '<div class="grow"><h1 class="h2">' + u.code + ' ' + esc(u.title) + '</h1><div class="muted small">' + STATUS[us.status] + (us.all.length ? ' · úspěšnost ' + C.unitAcc(u.id) + ' %' : '') + '</div></div></div>';
    h += '<div class="card"><div class="card-s">Pravidlo</div><p>' + esc(u.rule) + '</p></div>';
    h += '<div class="card"><div class="card-s">Procvičit</div><div class="seg">' + [1, 2, 3].map(function (L) {
      return '<button type="button" class="seg-b' + (L === lvl ? ' on' : '') + '" data-act="trainlvl" data-l="' + L + '">Stupeň ' + L + '</button>';
    }).join('') + '</div><p class="muted small">1 výběr ze dvou · 2 doplnění tvaru · 3 překlad z češtiny</p>' +
      '<button type="button" class="btn" data-act="trainunit">Spustit 8 úloh</button></div>';
    return page(h);
  }

  // ---------- 5. OBRAZOVKA TRENINK ----------
  function viewTrain() {
    var weakN = Object.keys(S().weak).length;
    var h = '<div class="head"><div><h1>Trénink</h1><div class="muted small">Cokoli mimo denní lekci</div></div></div>';
    h += '<div class="card"><div class="card-s">Pohotovost</div><p class="muted small">8 překladů z češtiny na čas, nahlas nebo písemně.</p><button type="button" class="btn" data-act="speed">Spustit</button></div>';
    h += '<div class="card"><div class="card-s">Co mi nejde</div><p class="muted small">' + (weakN ? weakN + ' vět s chybou. Zmizí po dvou správných odpovědích.' : 'Zatím žádné chyby.') + '</p>' +
      '<button type="button" class="btn-sec" data-act="weak"' + (weakN ? '' : ' disabled') + '>Zopakovat slabiny</button></div>';
    h += '<div class="card"><div class="card-s">Jednotlivé jevy</div>';
    C.UNITS.forEach(function (u) {
      var us = C.unitState(u.id);
      h += '<button type="button" class="urow" data-act="unit" data-u="' + u.id + '"><span><b>' + u.code + ' ' + esc(u.title) + '</b><br><span class="muted small">' + STATUS[us.status] + '</span></span><i class="cell st-' + us.status + '"></i></button>';
    });
    h += '</div>';
    return page(h);
  }

  // ---------- 6. OBRAZOVKA PREHLED ----------
  function viewOverview() {
    var st = S(), t = C.totals(), weakIds = Object.keys(st.weak);
    var h = '<div class="head"><div><h1>Přehled</h1><div class="muted small">Statistiky, slabiny, slovíčka, nastavení</div></div></div>';
    h += '<div class="tiles"><div class="tile"><span>Úloh</span><b>' + t.n + '</b></div><div class="tile"><span>Úspěšnost</span><b>' + t.acc + ' %</b></div><div class="tile"><span>Reakce</span><b>' + String(t.avgSec).replace('.', ',') + ' s</b></div></div>';
    h += '<div class="card"><div class="row-b"><div class="card-s">Co mi nejde (' + weakIds.length + ')</div>' + (weakIds.length ? '<button type="button" class="btn-warn" data-act="weak">Zopakovat</button>' : '') + '</div>';
    if (!weakIds.length) h += '<p class="muted small">Věta se sem dostane po první chybě a zmizí po dvou správných odpovědích.</p>';
    weakIds.slice(0, 20).forEach(function (id) {
      var it = C.ITEM_BY_ID[id]; if (!it) return;
      var u = C.UNIT_BY_ID[C.UNIT_OF_ITEM[id]];
      h += '<div class="err"><div class="muted small">' + u.code + ' · ' + esc(u.title) + '</div><div>' + esc(it.type === 'translate' ? it.cz : it.en) + '</div><div class="small"><b>Správně:</b> ' + esc(C.correctList(it)[0]) + '</div></div>';
    });
    h += '</div>';
    var words = Object.keys(st.words).sort(function (a, b) { return (st.words[b].saved ? 100 : 0) + st.words[b].n - (st.words[a].saved ? 100 : 0) - st.words[a].n; });
    h += '<div class="card"><div class="card-s">Moje slovíčka (' + words.length + ')</div>';
    if (!words.length) h += '<p class="muted small">Ťukni ve cvičení na anglické slovo, ukáže se překlad. Hledaná a uložená slova se objeví tady.</p>';
    words.slice(0, 40).forEach(function (w) {
      h += '<div class="wrow"><span><b>' + esc(w) + '</b> · ' + esc((window.TG_DICT || {})[w] || '') + '</span><span class="muted small">' + (st.words[w].saved ? 'uloženo' : 'hledáno ' + st.words[w].n + '×') + '</span></div>';
    });
    h += '</div>';
    var off = st.settings.offset || 0;
    h += '<div class="card"><div class="card-s">Nastavení</div><div class="small">Celková obtížnost</div><div class="seg">' + [[-1, 'Lehčí'], [0, 'Normální'], [1, 'Těžší']].map(function (o) {
      return '<button type="button" class="seg-b' + (o[0] === off ? ' on' : '') + '" data-act="offset" data-o="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>' +
      '<button type="button" class="btn-sec" data-act="voice">Čtení správné odpovědi nahlas: ' + (st.settings.voice ? 'zapnuto' : 'vypnuto') + '</button>' +
      '<button type="button" class="btn-sec" data-act="placement">Spustit vstupní test znovu</button>' +
      '<button type="button" class="btn-sec" data-act="export">Záloha: stáhnout soubor</button>' +
      '<label class="btn-sec filelab">Záloha: nahrát soubor<input type="file" id="importFile" accept="application/json,.json"></label>' +
      '<button type="button" class="btn-sec danger" data-act="reset">' + (V.resetArmed ? 'Opravdu smazat veškerý pokrok? Ťukni znovu' : 'Smazat pokrok') + '</button>' +
      (V.msg ? '<p class="small">' + esc(V.msg) + '</p>' : '') + '</div>';
    return page(h);
  }

  // ---------- 7. CVICENI (vykresleni ulohy) ----------
  function cur() { return ses.queue[ses.idx]; }
  function viewSession() {
    var e = cur(), it = e.item, u = C.UNIT_BY_ID[e.unitId], total = ses.queue.length;
    var lvlNow = it.lvl;
    var h = '<main class="page sess"><div class="top"><button type="button" class="icon-b" data-act="quit" aria-label="Ukončit cvičení">' + icon('close', 20) + '</button>' +
      '<div class="bar grow"><div class="bar-in" style="width:' + Math.round(ses.idx / total * 100) + '%"></div></div><div class="muted small">' + (ses.idx + 1) + ' / ' + total + '</div></div>';
    h += '<div class="row-b"><div class="muted small">' + BLOCK[e.block] + (e.block === 'speed' ? '' : ' · ' + u.code + ' ' + esc(u.title)) + '</div><div class="pill">Stupeň ' + lvlNow + '</div></div>';
    // 7.1 Zadani
    h += '<div class="card">';
    if (it.type === 'choice') h += '<div class="muted">Vyber správný tvar.</div><div class="sent">' + enText(it.en) + '</div>';
    else if (it.type === 'gap') h += '<div class="muted">Doplň chybějící slova.</div><div class="sent">' + enText(it.en) + '</div>';
    else {
      h += '<div class="muted">Řekni nebo napiš anglicky.</div><div class="sent">' + esc(it.cz) + '</div>';
      if (e.timed && ses.phase === 'ask') h += '<div class="tbar"><div class="bar t"><div class="bar-in" id="tfill" style="width:100%"></div></div><div class="tlabel" id="tlabel"></div></div>';
    }
    h += bubble();
    if (ses.ruleOpen) h += '<div class="rule"><b>Pravidlo:</b> ' + esc(u.rule) + '</div>';
    if (ses.hint && ses.phase === 'ask') h += '<div class="rule"><b>Nápověda:</b> ' + esc(ses.hint) + '</div>';
    h += '</div>';
    // 7.2 Odpoved nebo vyhodnoceni
    if (ses.phase === 'ask') h += askArea(e, it); else h += feedback(e, it);
    h += '</main>';
    return h;
  }
  function askArea(e, it) {
    var h = '';
    if (it.type === 'choice') {
      h += '<div class="opts">' + e.opts.map(function (o) { return '<button type="button" class="opt" data-act="choose" data-a="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>';
    } else if (it.type === 'gap') {
      h += '<div class="inputs">' + it.ans.map(function (a, i) {
        return '<label class="lab" for="g' + i + '">' + (it.ans.length > 1 ? (i + 1) + '. mezera' : 'Tvoje odpověď') + '</label><input class="inp" id="g' + i + '" data-gap="' + i + '" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="' + esc(ses.draft[i] || '') + '">';
      }).join('') + '</div>';
    } else {
      if (A.canListen()) {
        h += '<div class="micwrap"><button type="button" class="mic' + (ses.listening ? ' on' : '') + '" data-act="mic" aria-label="Mluvit do mikrofonu">' + icon('mic', 40) + '</button><div class="card-s">' + (ses.listening ? 'Poslouchám' : (ses.micErr || 'Ťukni a mluv')) + '</div></div>';
      } else {
        h += '<p class="muted small">Mikrofon tady není dostupný (potřebuje Chrome a adresu https). Odpověď napiš.</p>';
      }
      h += '<div class="inputs"><label class="lab" for="g0">Tvoje odpověď</label><input class="inp" id="g0" data-gap="0" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="' + esc(ses.draft[0] || '') + '"></div>';
    }
    if (e.block !== 'placement') {
      h += '<div class="tools"><button type="button" class="btn-t" data-act="rule">Pravidlo</button><button type="button" class="btn-t" data-act="hint">Nápověda</button><button type="button" class="btn-t" data-act="dunno">Nevím</button></div>';
    } else {
      h += '<div class="tools one"><button type="button" class="btn-t" data-act="dunno">Nevím</button></div>';
    }
    h += '<div class="grow"></div>';
    if (e.block === 'grammar') {
      h += '<div class="small muted">Obtížnost tohoto jevu</div><div class="tools two"><button type="button" class="btn-t" data-act="easier"' + (it.lvl <= 1 ? ' disabled' : '') + '>Lehčí</button><button type="button" class="btn-t" data-act="harder"' + (it.lvl >= 3 ? ' disabled' : '') + '>Těžší</button></div>';
    }
    if (it.type !== 'choice') h += '<button type="button" class="btn" data-act="check">Zkontrolovat</button>';
    return h;
  }
  function filled(it) {
    if (it.type === 'translate') return C.correctList(it)[0];
    var parts = it.type === 'choice' ? [it.ans] : it.ans.map(function (a) { return a.split('|')[0]; }), i = 0;
    return it.en.replace(/___/g, function () { return parts[i++] || ''; }).replace(/\s*\([a-z ,]+\)/g, '');
  }
  function feedback(e, it) {
    var r = ses.last, h = '<div class="fb ' + (r.ok ? 'ok' : 'bad') + '"><div class="fb-t">' + (r.ok ? 'Správně' : (r.helped ? 'S nápovědou se počítá jako chyba' : 'Chyba')) + (r.slow ? ' · přes časový limit' : '') + '</div>';
    if (!r.ok && r.your) h += '<div><b>Tvoje:</b> ' + esc(r.your) + '</div>';
    h += '<div><b>Správně:</b> ' + enText(filled(it)) + '</div>';
    if (it.type !== 'translate') h += '<div class="muted small">' + esc(it.cz) + '</div>';
    else if (C.correctList(it).length > 1) h += '<div class="muted small">Také: ' + esc(C.correctList(it).slice(1).join(' / ')) + '</div>';
    if (r.lvlChange) h += '<div class="small"><b>' + (r.lvlChange > 0 ? 'Jde ti to, příště těžší stupeň.' : 'Příště lehčí stupeň.') + '</b></div>';
    h += '</div><div class="tools ' + ((!r.ok && it.type === 'translate' && r.your && !r.helped) ? 'two' : 'one') + '">';
    if (A.canSpeak()) h += '<button type="button" class="btn-t" data-act="say">' + icon('sound', 18) + ' Přehrát</button>';
    if (!r.ok && it.type === 'translate' && r.your && !r.helped && e.block !== 'placement') h += '<button type="button" class="btn-t" data-act="wasright">Moje odpověď byla správně</button>';
    h += '</div><div class="grow"></div><button type="button" class="btn" data-act="next">' + (ses.idx + 1 < ses.queue.length ? 'Další' : 'Dokončit') + '</button>';
    return h;
  }

  // ---------- 8. CVICENI (logika) ----------
  function startSession(def) {
    if (!def.queue.length) { V.msg = 'Teď tu není nic k procvičení.'; render(); return; }
    def.queue.forEach(function (e) { if (e.item.type === 'choice') e.opts = Math.random() < 0.5 ? e.item.opts.slice() : e.item.opts.slice().reverse(); });
    ses = { kind: def.kind, queue: def.queue, idx: 0, results: [], lookups: [] };
    V.view = 'session'; V.msg = ''; resetItem(); render();
  }
  function resetItem() {
    stopTimer(); A.stop();
    ses.phase = 'ask'; ses.draft = []; ses.hintStep = 0; ses.hint = ''; ses.ruleOpen = false; ses.bubble = null;
    ses.listening = false; ses.micErr = ''; ses.slow = false; ses.startTs = Date.now(); ses.last = null;
  }
  function readDraft() {
    var ins = app.querySelectorAll('input[data-gap]');
    for (var i = 0; i < ins.length; i++) ses.draft[+ins[i].getAttribute('data-gap')] = ins[i].value;
  }
  function startTimer() {
    stopTimer();
    var e = cur(); if (!e.timed || ses.phase !== 'ask') return;
    var lim = C.speedLimitSec(e.item) * 1000;
    function tick() {
      var left = lim - (Date.now() - ses.startTs), f = document.getElementById('tfill'), l = document.getElementById('tlabel');
      if (left <= 0) { ses.slow = true; if (f) f.style.width = '0%'; if (l) l.textContent = 'limit vypršel'; stopTimer(); return; }
      if (f) f.style.width = Math.round(left / lim * 100) + '%';
      if (l) l.textContent = 'zbývá ' + Math.ceil(left / 1000) + ' s';
    }
    tick(); timer = setInterval(tick, 250);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function submit(answer, forcedWrong) {
    var e = cur(), it = e.item, helped = ses.hintStep > 0 || !!forcedWrong;
    var ok = !helped && C.check(it, answer), ms = Date.now() - ses.startTs;
    stopTimer(); A.stop(); ses.listening = false;
    var your = forcedWrong ? '' : (Array.isArray(answer) ? answer.join(' ... ') : answer);
    var out = e.block === 'placement' ? { lvlChange: 0 } : C.record(it.id, ok, ms);
    ses.last = { itemId: it.id, ok: ok, your: your, slow: ses.slow, helped: helped, ms: ms, lvlChange: e.block === 'grammar' ? out.lvlChange : 0 };
    ses.results.push(ses.last);
    ses.phase = 'feedback'; ses.bubble = null;
    if (S().settings.voice && e.block !== 'placement') A.speak(filled(it));
    render();
  }
  function hintFor(it, stepN) {
    var full = it.type === 'translate' ? C.correctList(it)[0] : (it.type === 'choice' ? it.ans : it.ans.map(function (a) { return a.split('|')[0]; }).join(' ... '));
    if (stepN >= 2) return full;
    if (it.type === 'translate') return full.split(' ').slice(0, 2).join(' ') + ' …';
    return full.split(' ... ').map(function (p) { return p.charAt(0) + '…'; }).join('  ');
  }
  function changeLvl(delta) {
    var e = cur(), used = {};
    ses.queue.forEach(function (x) { used[x.item.id] = 1; });
    var newLvl = Math.max(1, Math.min(3, e.item.lvl + delta));
    C.setManualLvl(e.unitId, delta);
    var pick = C.pickItems(e.unitId, newLvl, 1, used)[0];
    if (!pick || pick.lvl !== newLvl) pick = C.UNIT_BY_ID[e.unitId].items.filter(function (x) { return x.lvl === newLvl; })[0];
    if (pick) {
      e.item = pick;
      if (pick.type === 'choice') e.opts = Math.random() < 0.5 ? pick.opts.slice() : pick.opts.slice().reverse();
      // zbytek bloku gramatiky prepnout na novy stupen
      for (var i = ses.idx + 1; i < ses.queue.length; i++) {
        var q = ses.queue[i];
        if (q.block === 'grammar' && q.unitId === e.unitId) {
          used[e.item.id] = 1;
          var p2 = C.pickItems(e.unitId, newLvl, 1, used)[0];
          if (p2) { q.item = p2; used[p2.id] = 1; if (p2.type === 'choice') q.opts = p2.opts.slice(); }
        }
      }
    }
    resetItem(); render();
  }
  function nextItem() {
    if (ses.idx + 1 < ses.queue.length) { ses.idx++; resetItem(); render(); return; }
    finishSession();
  }
  function finishSession() {
    stopTimer(); A.stop();
    if (ses.kind === 'placement') {
      C.applyPlacement(ses.results);
      var okN = ses.results.filter(function (r) { return r.ok; }).length;
      V.msg = 'Vstupní test hotový: ' + okN + ' z ' + ses.results.length + ' správně. Obtížnost jevů je nastavená, najdeš ji v Mapě.';
      ses = null; V.view = 'home'; render(); return;
    }
    if (ses.kind === 'lesson') C.finishLesson();
    lastSummary = { kind: ses.kind, results: ses.results, lookups: ses.lookups };
    ses = null; V.view = 'summary'; render();
  }
  function toggleMic() {
    if (ses.listening) { A.stop(); ses.listening = false; readDraft(); render(); return; }
    readDraft(); ses.listening = true; ses.micErr = ''; render();
    A.listen({
      onText: function (txt) { ses.draft[0] = txt; var inp = document.getElementById('g0'); if (inp) inp.value = txt; },
      onEnd: function () { if (ses && ses.phase === 'ask') { ses.listening = false; readDraft(); render(); } },
      onError: function (code) {
        if (!ses) return;
        ses.listening = false;
        ses.micErr = code === 'not-allowed' || code === 'service-not-allowed' ? 'Mikrofon není povolený. Napiš odpověď.' : (code === 'no-speech' ? 'Nic jsem neslyšel. Zkus to znovu.' : 'Mikrofon teď nefunguje. Napiš odpověď.');
        if (ses.phase === 'ask') { readDraft(); render(); }
      }
    });
  }

  // ---------- 9. SHRNUTI ----------
  function viewSummary() {
    var R = lastSummary.results, okN = 0, ms = 0, units = {}, errs = [], slow = 0;
    R.forEach(function (r) { if (r.ok) okN++; else errs.push(r); if (r.slow) slow++; ms += r.ms; units[C.UNIT_OF_ITEM[r.itemId]] = 1; });
    var streak = C.streakNow();
    var h = '<main class="page sess"><div class="head"><div><h1>' + (lastSummary.kind === 'lesson' ? 'Lekce hotová' : 'Hotovo') + '</h1><div class="muted small">' + R.length + ' úloh · ' + Math.max(1, Math.round(ms / 60000)) + ' min</div></div></div>';
    h += '<div class="tiles"><div class="tile"><span>Správně</span><b>' + okN + ' / ' + R.length + '</b></div><div class="tile"><span>Reakce</span><b>' + String(Math.round(ms / Math.max(1, R.length) / 100) / 10).replace('.', ',') + ' s</b></div><div class="tile"><span>Série</span><b>' + streak + ' ' + daysWord(streak) + '</b></div></div>';
    h += '<h2>Chyby (' + errs.length + ')</h2>';
    if (!errs.length) h += '<p class="muted">Bez chyby.</p>';
    errs.forEach(function (r) {
      var it = C.ITEM_BY_ID[r.itemId], u = C.UNIT_BY_ID[C.UNIT_OF_ITEM[r.itemId]];
      h += '<div class="card err"><div class="muted small">' + u.code + ' · ' + esc(u.title) + (r.helped ? ' · s nápovědou' : '') + '</div>' +
        (it.type === 'translate' ? '<div class="small">' + esc(it.cz) + '</div>' : '') +
        (r.your ? '<div class="bad-t"><b>Tvoje:</b> ' + esc(r.your) + '</div>' : '') +
        '<div><b>Správně:</b> ' + esc(filled(it)) + '</div><div class="muted small">' + esc(u.rule) + '</div></div>';
    });
    if (slow) h += '<p class="muted small">Přes časový limit: ' + slow + ' vět. Do chyb se nepočítá.</p>';
    h += '<h2>Procvičeno</h2><div class="chips">' + Object.keys(units).map(function (id) { var u = C.UNIT_BY_ID[id]; return '<span class="tag">' + u.code + ' ' + esc(u.title) + '</span>'; }).join('') + '</div>';
    if (lastSummary.lookups.length) h += '<p class="muted small">Hledaná slovíčka: ' + esc(lastSummary.lookups.join(', ')) + '</p>';
    h += '<div class="grow"></div>';
    if (errs.length) h += '<button type="button" class="btn" data-act="repeaterr">Zopakovat chyby hned</button>';
    h += '<button type="button" class="btn-sec" data-act="go" data-v="home">Zavřít</button></main>';
    return h;
  }

  // ---------- 10. UDALOSTI A START ----------
  function render() {
    var h;
    if (V.view === 'session' && ses) h = viewSession();
    else if (V.view === 'summary' && lastSummary) h = viewSummary();
    else if (V.view === 'map') h = viewMap();
    else if (V.view === 'unit' && V.unitId) h = viewUnit();
    else if (V.view === 'train') h = viewTrain();
    else if (V.view === 'overview') h = viewOverview();
    else { V.view = 'home'; h = viewHome(); }
    app.innerHTML = h;
    if (V.view === 'session' && ses && ses.phase === 'ask') {
      startTimer();
      var first = app.querySelector('input[data-gap]');
      if (first && cur().item.type === 'gap' && !ses.bubble && !ses.ruleOpen) { try { first.focus({ preventScroll: true }); } catch (e) { /* nic */ } }
    }
  }
  function onClick(ev) {
    var el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
    var act = el.getAttribute('data-act');
    if (act !== 'reset') V.resetArmed = false;
    switch (act) {
      case 'go': V.view = el.getAttribute('data-v'); V.msg = ''; V.trainLvl = 0; render(); break;
      case 'lesson': startSession(C.buildLesson()); break;
      case 'placement': startSession(C.buildPlacement()); break;
      case 'skipplacement': S().placementDone = true; C.save(); render(); break;
      case 'weak': startSession(C.buildWeak()); break;
      case 'speed': startSession(C.buildSpeed()); break;
      case 'unit': V.unitId = el.getAttribute('data-u'); V.trainLvl = 0; V.view = 'unit'; render(); break;
      case 'trainlvl': V.trainLvl = +el.getAttribute('data-l'); render(); break;
      case 'trainunit': startSession(C.buildTraining(V.unitId, V.trainLvl || C.effLvl(V.unitId))); break;
      case 'offset': S().settings.offset = +el.getAttribute('data-o'); C.save(); render(); break;
      case 'voice': S().settings.voice = !S().settings.voice; C.save(); render(); break;
      case 'export': doExport(); break;
      case 'reset':
        if (V.resetArmed) { C.resetAll(); V.resetArmed = false; V.msg = 'Pokrok je smazaný.'; } else { V.resetArmed = true; }
        render(); break;
      case 'quit': stopTimer(); A.stop(); ses = null; V.view = 'home'; render(); break;
      case 'word':
        readDraft(); var w = el.getAttribute('data-w');
        ses.bubble = ses.bubble === w ? null : w;
        if (ses.bubble) { C.lookup(w, false); if (ses.lookups.indexOf(w) < 0) ses.lookups.push(w); }
        render(); break;
      case 'saveword': readDraft(); C.lookup(el.getAttribute('data-w'), true); render(); break;
      case 'rule': readDraft(); ses.ruleOpen = !ses.ruleOpen; render(); break;
      case 'hint': readDraft(); ses.hintStep = Math.min(2, ses.hintStep + 1); ses.hint = hintFor(cur().item, ses.hintStep); render(); break;
      case 'dunno': submit(null, true); break;
      case 'choose': submit(el.getAttribute('data-a')); break;
      case 'check': readDraft(); submit(cur().item.type === 'gap' ? cur().item.ans.map(function (a, i) { return ses.draft[i] || ''; }) : (ses.draft[0] || '')); break;
      case 'easier': changeLvl(-1); break;
      case 'harder': changeLvl(1); break;
      case 'mic': toggleMic(); break;
      case 'say': A.speak(filled(cur().item)); break;
      case 'wasright':
        C.addVariant(ses.last.itemId, ses.last.your); ses.last.ok = true;
        C.record(ses.last.itemId, true, 0); render(); break;
      case 'next': nextItem(); break;
      case 'repeaterr':
        var q = lastSummary.results.filter(function (r) { return !r.ok; }).map(function (r) { return { item: C.ITEM_BY_ID[r.itemId], unitId: C.UNIT_OF_ITEM[r.itemId], block: 'review', timed: false }; });
        startSession({ kind: 'weak', queue: q }); break;
    }
  }
  function onKey(ev) {
    if (ev.key !== 'Enter' || V.view !== 'session' || !ses) return;
    if (ses.phase === 'ask' && ev.target.matches && ev.target.matches('input[data-gap]')) {
      ev.preventDefault();
      var ins = app.querySelectorAll('input[data-gap]'), i = +ev.target.getAttribute('data-gap');
      if (i + 1 < ins.length) ins[i + 1].focus(); else { var b = app.querySelector('[data-act="check"]'); if (b) b.click(); }
    }
  }
  function onChange(ev) {
    if (ev.target.id !== 'importFile' || !ev.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try { C.importSave(String(fr.result)); V.msg = 'Záloha je nahraná.'; } catch (e) { V.msg = 'Soubor se nepodařilo načíst. Je to záloha z této aplikace?'; }
      render();
    };
    fr.readAsText(ev.target.files[0]);
  }
  function doExport() {
    var blob = new Blob([C.exportSave()], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'trener-gramatiky-zaloha-' + C.today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    V.msg = 'Záloha je stažená.'; render();
  }
  function init() {
    app = document.getElementById('app');
    C.load();
    app.addEventListener('click', onClick);
    app.addEventListener('keydown', onKey);
    app.addEventListener('change', onChange);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
