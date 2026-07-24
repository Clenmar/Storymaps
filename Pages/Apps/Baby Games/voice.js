/* Baby Games — shared friendly-voice helper.
 *
 * Two voice engines:
 *   1. "system"  — the device's own speech voice (instant, no download). We rank
 *                  the installed voices and pick the most natural one, spoken in
 *                  a gentle, calm tone.
 *   2. "natural" — a Piper neural voice that runs entirely in the browser via
 *                  WebAssembly (vits-web + onnxruntime-web). Warm and lifelike.
 *                  Downloads a small model once, then works offline.
 *
 * A parent chooses in the "Voice" picker; the choice is remembered on the device.
 * Natural mode always falls back to the system voice if a model can't load.
 */
(function () {
  "use strict";

  var MODE_KEY = "babyVoiceMode_v1";     // 'system' | 'natural'
  var SYS_KEY  = "babyVoiceURI_v1";      // chosen system voiceURI
  var PIP_KEY  = "babyPiperVoice_v1";    // chosen Piper voiceId
  // ESM build of the in-browser Piper engine (bundled with onnxruntime-web).
  var VITS_URL = "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web/+esm";

  function getStr(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var mode    = getStr(MODE_KEY, "system");
  var piperId = getStr(PIP_KEY, "");

  // A short, warm, TWC-family-friendly Piper voice menu (British & American).
  var PIPER_VOICES = [
    { id: "en_US-amy-low",           label: "Amy — American, warm",     size: "≈ 28 MB" },
    { id: "en_US-hfc_female-medium", label: "Grace — American, clear",  size: "≈ 63 MB" },
    { id: "en_GB-alba-medium",       label: "Alba — British, gentle",   size: "≈ 63 MB" },
    { id: "en_US-ryan-low",          label: "Ryan — American, male",    size: "≈ 28 MB" },
    { id: "en_GB-alan-low",          label: "Alan — British, male",     size: "≈ 28 MB" }
  ];

  // ── System voice ranking (natural-sounding first, robotic ones avoided) ──
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

  // ── Piper (in-browser neural) ───────────────────────────────────────────
  var tts = null, piperReady = false, loadingLib = null;
  var clipCache = {}, curAudio = null;

  function loadLib() {
    if (tts) return Promise.resolve(true);
    if (loadingLib) return loadingLib;
    // dynamic import via a data-Function so bundlers/linters don't choke on import()
    loadingLib = (new Function("u", "return import(u)"))(VITS_URL)
      .then(function (mod) { tts = mod && (mod.default && mod.default.predict ? mod.default : mod); return !!(tts && tts.predict); })
      .catch(function () { return false; });
    return loadingLib;
  }

  // Download a Piper model (cached by the library after first fetch).
  function downloadVoice(id, onProgress) {
    return loadLib().then(function (okLib) {
      if (!okLib || !tts.download) throw new Error("Natural voice engine unavailable");
      return tts.download(id, function (p) {
        try { if (onProgress && p && p.total) onProgress(Math.round((p.loaded / p.total) * 100)); } catch (e) {}
      });
    }).then(function () { piperReady = true; piperId = id; return true; });
  }

  function stopAudio() { try { if (curAudio) { curAudio.pause(); curAudio.currentTime = 0; curAudio = null; } } catch (e) {} }

  function speakNatural(text, cb) {
    loadLib().then(function (okLib) {
      if (!okLib || !tts.predict || !piperId) throw new Error("not ready");
      var key = piperId + "::" + text;
      if (clipCache[key]) return clipCache[key];
      return tts.predict({ text: text, voiceId: piperId }).then(function (wav) {
        var url = URL.createObjectURL(wav); clipCache[key] = url; return url;
      });
    }).then(function (url) {
      stopAudio();
      var a = new Audio(url); curAudio = a;
      if (cb) { a.addEventListener("ended", cb, { once: true }); setTimeout(cb, 6000); }
      var pr = a.play(); if (pr && pr.catch) pr.catch(function () { if (cb) cb(); });
    }).catch(function () { speakSystem(text, cb); });   // graceful fallback
  }

  function say(text, cb) {
    if (mode === "natural") {
      if (!piperReady && piperId) downloadVoice(piperId).catch(function () {}); // warm up (cached → fast)
      speakNatural(text, cb);
      return;
    }
    speakSystem(text, cb);
  }

  // ── Voice picker (parent-facing) ────────────────────────────────────────
  function openPicker() {
    var ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,10,40,.85);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;";
    var box = document.createElement("div");
    box.style.cssText = "background:#fff;max-width:440px;width:100%;max-height:84vh;overflow:auto;border-radius:22px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.4);";
    ov.appendChild(box);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    function close() { try { speechSynthesis.cancel(); } catch (e) {} stopAudio(); ov.remove(); }

    function h(t) { var e = document.createElement("div"); e.textContent = t; e.style.cssText = "font-weight:800;font-size:21px;color:#3a1d6e;"; return e; }
    function p(t) { var e = document.createElement("div"); e.textContent = t; e.style.cssText = "font-size:13px;color:#777;margin:4px 0 12px;line-height:1.45;"; return e; }
    function btn(label, primary) {
      var b = document.createElement("button"); b.textContent = label;
      b.style.cssText = "display:block;width:100%;text-align:left;padding:13px 15px;margin:6px 0;border-radius:13px;border:2px solid #eee;background:" + (primary ? "linear-gradient(90deg,#7c3aed,#ec4899);color:#fff;border:none;text-align:center;font-weight:800;" : "#faf7ff;color:#333;") + "font-size:15px;font-weight:600;cursor:pointer;";
      return b;
    }

    function render() {
      box.innerHTML = "";
      box.appendChild(h("Voice"));

      // engine toggle
      var row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;margin:6px 0 14px;";
      ["system", "natural"].forEach(function (m) {
        var b = document.createElement("button");
        b.textContent = m === "system" ? "Phone voice" : "Natural ✨";
        var on = mode === m;
        b.style.cssText = "flex:1;padding:11px;border-radius:12px;border:2px solid " + (on ? "#7c3aed" : "#eee") + ";background:" + (on ? "#f3ecff" : "#faf7ff") + ";font-weight:800;font-size:14px;color:#3a1d6e;cursor:pointer;";
        b.onclick = function () { mode = m; setStr(MODE_KEY, m); render(); };
        row.appendChild(b);
      });
      box.appendChild(row);

      if (mode === "system") {
        box.appendChild(p("Uses a voice already on this phone. Tap one to hear it (✨ = extra natural)."));
        var all = (typeof speechSynthesis !== "undefined" ? speechSynthesis.getVoices() : []) || [];
        var vs = all.filter(function (v) { return /^en/i.test(v.lang); }); if (!vs.length) vs = all;
        vs = vs.slice().sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); });
        if (!vs.length) box.appendChild(p("No voices are installed on this device yet."));
        vs.forEach(function (v) {
          var b = btn(v.name + (v.localService === false ? "  ✨" : ""));
          if (chosen && chosen.voiceURI === v.voiceURI) b.style.borderColor = "#7c3aed";
          b.onclick = function () { chosen = v; setStr(SYS_KEY, v.voiceURI); mode = "system"; setStr(MODE_KEY, "system"); render(); speakSystem("Hi! Let's play together!"); };
          box.appendChild(b);
        });
      } else {
        box.appendChild(p("A warm neural voice that runs on the phone. It downloads once (then works offline). Tap one to install it."));
        var status = document.createElement("div"); status.style.cssText = "font-size:13px;font-weight:700;color:#7c3aed;min-height:18px;margin-bottom:6px;";
        box.appendChild(status);
        PIPER_VOICES.forEach(function (pv) {
          var b = btn(pv.label + "  ·  " + pv.size);
          if (piperReady && piperId === pv.id) b.style.borderColor = "#7c3aed";
          b.onclick = function () {
            status.textContent = "Downloading " + pv.label.split(" — ")[0] + "… 0%";
            b.disabled = true; b.style.opacity = ".6";
            downloadVoice(pv.id, function (pct) { status.textContent = "Downloading… " + pct + "%"; })
              .then(function () {
                mode = "natural"; setStr(MODE_KEY, "natural"); setStr(PIP_KEY, pv.id);
                status.textContent = "Ready! Playing a sample…";
                render(); speakNatural("Hi! Let's play together!");
              })
              .catch(function (e) {
                status.textContent = "Couldn't load that voice — using the phone voice instead.";
                mode = "system"; setStr(MODE_KEY, "system"); b.disabled = false; b.style.opacity = "1";
              });
          };
          box.appendChild(b);
        });
      }

      var done = btn("Done", true);
      done.onclick = close;
      box.appendChild(done);
    }

    render();
    document.body.appendChild(ov);
  }

  window.BabyVoice = { say: say, openPicker: openPicker };
})();
