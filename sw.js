// =====================================================================
// Trener gramatiky - sw.js (service worker: chod bez internetu)
// 1. KONFIGURACE (verze cache, seznam souboru)
// 2. INSTALACE (ulozeni souboru do cache)
// 3. AKTIVACE (smazani starych cache)
// 4. NACITANI (nejdriv sit, bez site z cache)
// Pri kazde aktualizaci zvys VERSION, jinak se zmeny mohou projevit pozdeji.
// =====================================================================

// ---------- 1. KONFIGURACE ----------
var VERSION = 'tg-1.5.0';
var NET_TIMEOUT_MS = 4000;
var FILES = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/core.js', 'js/audio.js', 'js/ui.js',
  'data/grammar.js', 'data/dict.js', 'data/songs.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];

// ---------- 2. INSTALACE ----------
self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

// ---------- 3. AKTIVACE ----------
self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

// ---------- 4. NACITANI ----------
function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || (req.mode === 'navigate' ? caches.match('index.html') : undefined);
  });
}
self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  ev.respondWith(new Promise(function (resolve) {
    var done = false;
    function finish(r) { if (!done && r) { done = true; resolve(r); } }
    // 4.1 Pomala sit: po limitu vrat kopii z cache, pokud existuje
    var t = setTimeout(function () { fromCache(req).then(finish); }, NET_TIMEOUT_MS);
    // 4.2 Sit (s overenim zmen na serveru), uspesnou odpoved uloz do cache
    fetch(req, { cache: 'no-cache' }).then(function (res) {
      clearTimeout(t);
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      finish(res);
    }).catch(function () {
      clearTimeout(t);
      fromCache(req).then(function (r) { finish(r || Response.error()); });
    });
  }));
});
