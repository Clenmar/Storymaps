/* Baby Games — shared friendly-voice helper.
 *
 *   "system"  — the device's own speech voice (instant, no download). We rank the
 *               installed voices, pick the most natural one, and speak gently.
 *   "natural" — a Piper neural voice running fully in the browser (WASM) via
 *               @mintplex-labs/piper-tts-web. Warm & lifelike; downloads a model
 *               once (~63 MB), then works offline. Uses a reusable TtsSession so
 *               each phrase isn't re-parsed, plays through a gesture-unlocked
 *               AudioContext, and caches every generated clip so repeats are
 *               instant. Always falls back to the system voice on any failure.
 *
 * NOTE: each game's HTML must include the onnxruntime-web import map (the Piper
 * library imports it by bare name):
 *   <script type="importmap">
 *   {"imports":{"onnxruntime-web":"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm"}}
 *   </script>
 */
(function () {
  "use strict";

  var MODE_KEY = "babyVoiceMode_v1";     // 'system' | 'natural'
  var SYS_KEY  = "babyVoiceURI_v1";      // chosen system voiceURI
  var PIP_KEY  = "babyPiperVoice_v1";    // chosen Piper voiceId
  var PIPER_URL = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/dist/piper-tts-web.js";

  function getStr(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var mode    = getStr(MODE_KEY, "system");
  var piperId = getStr(PIP_KEY, "");

  // Verified voice IDs (all English Piper voices are ~63 MB — no small tier).
  var PIPER_VOICES = [
    { id: "en_US-amy-medium",         label: "Amy — American, warm",    size: "~63 MB" },
    { id: "en_US-hfc_female-medium",  label: "Grace — American, clear", size: "~63 MB" },
    { id: "en_GB-jenny_dioco-medium", label: "Jenny — British, gentle", size: "~63 MB" },
    { id: "en_GB-cori-medium",        label: "Cori — British, lively",  size: "~63 MB" },
    { id: "en_US-hfc_male-medium",    label: "Sam — American, male",    size: "~63 MB" },
    { id: "en_GB-alan-medium",        label: "Alan — British, male",    size: "~63 MB" }
  ];

  // ── System voice ranking ────────────────────────────────────────────────
  var GREAT  = /natural|neural|online|siri|premium|enhanced/i;
  var GOOD   = /google|samantha|ava|allison|joanna|serena|karen|moira|tessa|fiona|nicky|aria|jenny|libby|sonia|nova|zoe|ada|amelie|matilda/i;
  var FEMALE = /female|woman|samantha|ava|aria|jenny|libby|sonia|karen|moira|fiona|zoe|nicky|serena|joanna|allison|nova/i;
  var BAD    = /espeak|compact|david|zira|mark|albert|fred|eloquence|zarvox|trinoids|whisper|bad ?news|good ?news|bells|boing|bubbles|cellos|deranged|hysterical|pipe|robot|wobble/i;
  var chosen = null;

  function scoreVoice(v) {
    var s = 0, n = ((v.name || "") + " " + (v.voiceURI || ""));
    if (BAD.test(n)) s -= 100;
    if (GREAT.test(n)) s += 60;
    if (GOOD.test(n)) s += 30;
    if (FEMALE.test(n)) s += 14;
    if (v.localService === false) s += 12;
    if (/^en[-_]?GB/i.test(v.lang)) s += 8;
    else if (/^en[-_]?AU/i.test(v.lang)) s += 7;
    else if (/^en[-_]?US/i.test(v.lang)) s += 6;
    else if (/^en/i.test(v.lang)) s += 3;
    else s -= 50;
    return s;
  }
  function refreshSystem() {
    if (typeof speechSynthesis === "undefined") return;
    var vs = speechSynthesis.getVoices() || [];
    if (!vs.length) return;
    var saved = getStr(SYS_KEY, "");
    if (saved) chosen = vs.filter(function (v) { return v.voiceURI === saved; })[0] || chosen;
    if (!chosen) chosen = vs.filter(function (v) { return /^en/i.test(v.lang); }).sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); })[0] || vs[0];
  }
  try { speechSynthesis.onvoiceschanged = refreshSystem; refreshSystem(); } catch (e) {}

  function speakSystem(text, cb) {
    if (typeof speechSynthesis === "undefined") { if (cb) setTimeout(cb, 500); return; }
    try {
      if (!chosen) refreshSystem();
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = (chosen && chosen.lang) || "en-GB";
      u.rate = 0.85; u.pitch = 1.06; u.volume = 1;
      if (chosen) u.voice = chosen;
      if (cb) u.onend = cb;
      speechSynthesis.speak(u);
      if (cb) setTimeout(cb, 3000);
    } catch (e) { if (cb) setTimeout(cb, 600); }
  }

  // ── Audio playback through a gesture-unlocked AudioContext ───────────────
  var actx = null, curSrc = null;
  function ensureCtx() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function unlock() { try { var c = ensureCtx(); if (c && c.state === "suspended") c.resume(); } catch (e) {} }
  try { document.addEventListener("touchend", unlock, true); document.addEventListener("click", unlock, true); } catch (e) {}

  function playBlob(blob, cb) {
    var c = ensureCtx();
    if (!c) {                              // last-resort: HTMLAudio
      try { var a = new Audio(URL.createObjectURL(blob)); if (cb) { a.addEventListener("ended", cb, { once: true }); setTimeout(cb, 6000); } var pr = a.play(); if (pr && pr.catch) pr.catch(function () { if (cb) cb(); }); } catch (e) { if (cb) cb(); }
      return;
    }
    blob.arrayBuffer().then(function (ab) { return c.decodeAudioData(ab); }).then(function (buf) {
      try { if (curSrc) curSrc.stop(); } catch (e) {}
      var src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); curSrc = src;
      if (cb) { src.onended = cb; setTimeout(cb, Math.min(9000, buf.duration * 1000 + 500)); }
      try { c.resume(); } catch (e) {}
      src.start();
    }).catch(function () { if (cb) cb(); });
  }

  // ── Piper engine ────────────────────────────────────────────────────────
  var lib = null, loadingLib = null, session = null, sessionVoice = "";
  var blobCache = {};

  function loadLib() {
    if (lib) return Promise.resolve(lib);
    if (loadingLib) return loadingLib;
    // indirect import() so classic-script linters don't choke on it
    loadingLib = (new Function("u", "return import(u)"))(PIPER_URL)
      .then(function (m) { lib = m; return m; })
      .catch(function () { return null; });
    return loadingLib;
  }
  function apiOf(m) { return (m && m.predict) ? m : (m && m.default) ? m.default : (m || {}); }

  // Download a voice model with progress (parent picker uses this).
  function downloadVoice(id, onPct) {
    return loadLib().then(function (m) {
      if (!m) throw new Error("Natural voice engine unavailable");
      var api = apiOf(m);
      if (!api.download) return true;
      return api.download(id, function (p) { try { if (onPct && p && p.total) onPct(Math.round(p.loaded * 100 / p.total)); } catch (e) {} });
    }).then(function () { piperId = id; session = null; sessionVoice = ""; return ensureSession(); }).then(function () { return true; });
  }

  // A reusable session (so the 63 MB graph is parsed once, not per phrase).
  function ensureSession() {
    if (session && sessionVoice === piperId) return Promise.resolve(session);
    if (!piperId) return Promise.resolve(null);
    return loadLib().then(function (m) {
      if (!m) return null;
      var TS = m.TtsSession || (m.default && m.default.TtsSession);
      if (TS && TS.create) {
        return TS.create({ voiceId: piperId }).then(function (s) { session = s; sessionVoice = piperId; return s; });
      }
      var api = apiOf(m);                 // fallback: wrap predict() as a session
      session = { predict: function (t) { return api.predict({ text: t, voiceId: piperId }); } };
      sessionVoice = piperId; return session;
    });
  }

  function speakNatural(text, cb) {
    ensureSession().then(function (s) {
      if (!s) throw new Error("no session");
      var key = piperId + "::" + text;
      if (blobCache[key]) return blobCache[key];
      return s.predict(text).then(function (blob) { blobCache[key] = blob; return blob; });
    }).then(function (blob) { playBlob(blob, cb); })
      .catch(function () { speakSystem(text, cb); });   // graceful fallback
  }

  function say(text, cb) {
    if (mode === "natural" && piperId) { speakNatural(text, cb); return; }
    speakSystem(text, cb);
  }

  // ── Voice picker (parent-facing) ────────────────────────────────────────
  function openPicker() {
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,10,40,.85);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;max-width:440px;width:100%;max-height:86vh;overflow:auto;border-radius:22px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.4);";
    ov.appendChild(box);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    function close() { try { speechSynthesis.cancel(); } catch (e) {} try { if (curSrc) curSrc.stop(); } catch (e) {} ov.remove(); }

    function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
    function btn(label, primary) {
      return el("button", "display:block;width:100%;text-align:" + (primary ? "center" : "left") + ";padding:13px 15px;margin:6px 0;border-radius:13px;border:" + (primary ? "none" : "2px solid #eee") + ";background:" + (primary ? "linear-gradient(90deg,#7c3aed,#ec4899);color:#fff;font-weight:800;" : "#faf7ff;color:#333;") + "font-size:15px;font-weight:600;cursor:pointer;", label);
    }

    function render() {
      box.innerHTML = "";
      box.appendChild(el("div", "font-weight:800;font-size:21px;color:#3a1d6e;", "Voice"));

      var row = el("div", "display:flex;gap:8px;margin:6px 0 14px;");
      ["system", "natural"].forEach(function (m) {
        var on = mode === m;
        var b = el("button", "flex:1;padding:11px;border-radius:12px;border:2px solid " + (on ? "#7c3aed" : "#eee") + ";background:" + (on ? "#f3ecff" : "#faf7ff") + ";font-weight:800;font-size:14px;color:#3a1d6e;cursor:pointer;", m === "system" ? "Phone voice" : "Natural ✨");
        b.onclick = function () { mode = m; setStr(MODE_KEY, m); render(); };
        row.appendChild(b);
      });
      box.appendChild(row);

      if (mode === "system") {
        box.appendChild(el("div", "font-size:13px;color:#777;margin-bottom:10px;line-height:1.45;", "A voice already on this phone — instant, no download. Tap one to hear it (✨ = extra natural)."));
        var all = (typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : []) || [];
        var vs = all.filter(function (v) { return /^en/i.test(v.lang); }); if (!vs.length) vs = all;
        vs = vs.slice().sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); });
        if (!vs.length) box.appendChild(el("div", "color:#a33;font-weight:600;", "No voices are installed on this device yet."));
        vs.forEach(function (v) {
          var b = btn(v.name + (v.localService === false ? "  ✨" : ""));
          if (chosen && chosen.voiceURI === v.voiceURI) b.style.borderColor = "#7c3aed";
          b.onclick = function () { chosen = v; setStr(SYS_KEY, v.voiceURI); mode = "system"; setStr(MODE_KEY, "system"); render(); speakSystem("Hi! Let's play together!"); };
          box.appendChild(b);
        });
      } else {
        box.appendChild(el("div", "font-size:13px;color:#777;margin-bottom:6px;line-height:1.45;", "A warm neural voice that runs on the phone. Downloads once (~63 MB), then works offline. Tap a voice to install it."));
        var status = el("div", "font-size:13px;font-weight:700;color:#7c3aed;min-height:18px;margin-bottom:6px;");
        box.appendChild(status);
        PIPER_VOICES.forEach(function (pv) {
          var b = btn(pv.label + "  ·  " + pv.size);
          if (mode === "natural" && piperId === pv.id) b.style.borderColor = "#7c3aed";
          b.onclick = function () {
            status.textContent = "Downloading… 0% (one time)";
            b.disabled = true; b.style.opacity = ".6";
            downloadVoice(pv.id, function (pct) { status.textContent = "Downloading… " + pct + "% (one time)"; })
              .then(function () {
                mode = "natural"; setStr(MODE_KEY, "natural"); setStr(PIP_KEY, pv.id);
                status.textContent = "Ready! Playing a sample…";
                render(); speakNatural("Hi! Let's play together!");
              })
              .catch(function () {
                status.textContent = "Couldn't load that voice — using the phone voice instead.";
                mode = "system"; setStr(MODE_KEY, "system"); b.disabled = false; b.style.opacity = "1";
              });
          };
          box.appendChild(b);
        });
        box.appendChild(el("div", "font-size:11px;color:#aaa;margin-top:8px;line-height:1.4;", "Voices: Piper (rhasspy / OHF-Voice). First use of a new word takes a moment, then it's saved."));
      }

      var done = btn("Done", true); done.onclick = close; box.appendChild(done);
    }
    render();
    document.body.appendChild(ov);
  }

  window.BabyVoice = { say: say, openPicker: openPicker };
})();
