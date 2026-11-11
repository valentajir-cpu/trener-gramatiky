// =====================================================================
// Trener gramatiky - audio.js
// 1. CTENI NAHLAS (TTS, en-US)
// 2. ROZPOZNAVANI RECI (mikrofon, en-US)
// =====================================================================
(function () {
  'use strict';

  // ---------- 1. CTENI NAHLAS ----------
  function canSpeak() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
  function speak(text) {
    if (!canSpeak()) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text).replace(/___/g, ' '));
      u.lang = 'en-US'; u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) { /* bez zvuku */ }
  }

  // ---------- 2. ROZPOZNAVANI RECI ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var active = null;
  function canListen() { return !!Rec; }
  // cb: {onText(text, isFinal), onEnd(), onError(code)}
  function listen(cb) {
    if (!Rec) { cb.onError && cb.onError('unsupported'); return; }
    stop();
    try {
      var r = new Rec();
      r.lang = 'en-US'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
      r.onresult = function (ev) {
        var txt = '', fin = false;
        for (var i = 0; i < ev.results.length; i++) { txt += ev.results[i][0].transcript; if (ev.results[i].isFinal) fin = true; }
        cb.onText && cb.onText(txt.trim(), fin);
      };
      r.onerror = function (ev) { cb.onError && cb.onError(ev.error || 'error'); };
      r.onend = function () { if (active === r) active = null; cb.onEnd && cb.onEnd(); };
      active = r; r.start();
    } catch (e) { active = null; cb.onError && cb.onError('error'); }
  }
  function stop() { if (active) { try { active.onend = null; active.abort(); } catch (e) { /* nic */ } active = null; } }
  function isListening() { return !!active; }

  window.Sound = { canSpeak: canSpeak, speak: speak, canListen: canListen, listen: listen, stop: stop, isListening: isListening };
})();
