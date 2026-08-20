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
 *   <\/script>
 */
(function () {
  "use strict";

  var MODE_KEY = "babyVoiceMode_v1";     // 'system' | 'natural'
  var SYS_KEY  = "babyVoiceURI_v1";      // chosen system voiceURI
  var PIP_KEY  = "babyPiperVoice_v1";    // chosen Piper voiceId
  var PICKED_KEY = "babyVoicePicked_v1"; // '1' once a grown-up chose on purpose
  var AUTO_KEY   = "babyVoiceAuto_v1";   // 'done' once the default was fetched
  var FAIL_KEY   = "babyVoiceAutoFail_v1"; // how many times the auto fetch failed
  var DEFAULT_PIPER = "en_GB-jenny_dioco-medium";   // Jenny — British, gentle
  var PIPER_URL = "https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/dist/piper-tts-web.js";

  function getStr(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function setStr(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var mode    = getStr(MODE_KEY, "system");
  var piperId = getStr(PIP_KEY, "");

  // Verified voice IDs (all English Piper voices are ~63 MB — no small tier).
  var PIPER_VOICES = [
    { id: "en_GB-jenny_dioco-medium", label: "Jenny — British, gentle", size: "~63 MB" },
    { id: "en_US-amy-medium",         label: "Amy — American, warm",    size: "~63 MB" },
    { id: "en_US-hfc_female-medium",  label: "Grace — American, clear", size: "~63 MB" },
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

  function once(fn) {
    var done = false;
    return function () { if (done || !fn) return; done = true; try { fn(); } catch (e) {} };
  }

  function speakSystem(text, cb) {
    cb = cb ? once(cb) : null;
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
    cb = cb ? once(cb) : null;
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
  var naturalFailed = false;          // this page gave up on Piper; use the phone voice
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

  /* Build (or rebuild) the Piper session for `id`, fetching the model if it is
   * not cached yet.
   *
   * We deliberately do NOT use the library's own download(). In
   * piper-tts-web 1.0.4 and 1.0.5 it fires the OPFS write without awaiting it:
   *
   *     writeBlob(url, await fetchBlob(url, cb));   // <- no await / no return
   *
   * so download() can resolve while the 63 MB model is still half-written.
   * Opening a session right afterwards then reads a truncated file and
   * onnxruntime throws "No graph was found in the protobuf" — which is exactly
   * the "Couldn't load that voice" a grown-up used to see, at random, on a
   * fresh phone.
   *
   * TtsSession.create({voiceId, progress}) fetches the model itself, *does*
   * await the OPFS write, and builds the graph from the in-memory blob. No
   * race, and one download instead of two. It is a singleton, so _instance has
   * to be cleared before switching voices. If a truncated model from an
   * earlier attempt is already cached, we bin it and fetch once more.
   */
  /* ── OPFS cache hygiene (iPadOS 16 and earlier) ────────────────────────
   * Those versions have OPFS but no FileSystemFileHandle.createWritable().
   * piper-tts-web's writeBlob() creates the file first and only then writes:
   *
   *     const file = await dir.getFileHandle(path, { create: true });
   *     const writable = await file.createWritable();   // <- throws here
   *
   * so the throw leaves a 0-byte file behind — and readBlob() happily hands
   * that empty file back on every later visit. The model config then parses as
   * JSON.parse("") => "JSON Parse error: Unexpected EOF", and the voice can
   * never load again. It works exactly once, on the very first visit, and is
   * poisoned from then on.
   *
   * The library's own remove() cannot clear it either: it uses the
   * non-standard handle.remove(), which those devices also lack. But
   * FileSystemDirectoryHandle.removeEntry() is standard and supported back to
   * Safari 15.2, so we sweep the empty files ourselves before every session.
   */
  function canWriteDirect() {                 // Safari 17+, Chrome, Firefox
    try { return typeof FileSystemFileHandle !== "undefined" &&
                 typeof FileSystemFileHandle.prototype.createWritable === "function"; }
    catch (e) { return false; }
  }
  function canWriteViaWorker() {              // Safari 15.2+ / iPadOS 16
    try { return typeof FileSystemFileHandle !== "undefined" &&
                 typeof FileSystemFileHandle.prototype.createSyncAccessHandle === "function" &&
                 typeof Worker !== "undefined"; }
    catch (e) { return false; }
  }
  function canCacheModels() { return canWriteDirect() || canWriteViaWorker(); }

  // Walk an async iterator without for-await, so this file stays ES5-parseable.
  function eachKey(it, fn) {
    if (!it || !it.next) return Promise.resolve();
    function step() {
      return Promise.resolve(it.next()).then(function (r) {
        if (r.done) return;
        return Promise.resolve(fn(r.value)).catch(function () {}).then(step);
      });
    }
    return step().catch(function () {});
  }

  // Drop every unusable cached file: anything empty/truncated, plus (when
  // dropId is given) that voice's own files, which we have just proved bad.
  function sweepCache(dropId) {
    if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve();
    return navigator.storage.getDirectory().then(function (root) {
      return root.getDirectoryHandle("piper", { create: false });
    }).then(function (dir) {
      return eachKey(dir.keys(), function (name) {
        var kill = !!(dropId && name.indexOf(dropId) === 0);
        var check = kill ? Promise.resolve() : dir.getFileHandle(name)
          .then(function (h) { return h.getFile(); })
          .then(function (f) { if (f.size < 1024) kill = true; })
          .catch(function () { kill = true; });
        return check.then(function () {
          if (!kill) return;
          if (dir.removeEntry) return dir.removeEntry(name);
        });
      });
    }).catch(function () {});
  }

  /* iPadOS 16 has no createWritable() — but it does have
   * createSyncAccessHandle(), which works inside a Worker. So on those devices
   * we fetch the model ourselves and write it in a worker, under the exact
   * names the library's readBlob() looks for. The library then finds a valid
   * file and stops re-downloading, which turns "60 MB on every game page" back
   * into "60 MB once, ever".
   */
  var WORKER_SRC = [
    "self.onmessage=function(e){var d=e.data;(async function(){try{",
    "var root=await navigator.storage.getDirectory();",
    "var dir=await root.getDirectoryHandle('piper',{create:true});",
    "var fh=await dir.getFileHandle(d.name,{create:true});",
    "var h=await fh.createSyncAccessHandle();",
    "var buf=await d.blob.arrayBuffer();",
    "h.truncate(0);h.write(new Uint8Array(buf),{at:0});h.flush();h.close();",
    "self.postMessage({ok:true});",
    "}catch(err){self.postMessage({ok:false,error:String((err&&err.message)||err)});}})();};"
  ].join("");

  function writeViaWorker(name, blob) {
    return new Promise(function (resolve, reject) {
      var url, wk;
      try {
        url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        wk = new Worker(url);
      } catch (e) { reject(e); return; }
      var settled = false;
      function finish(err) {
        if (settled) return;
        settled = true;
        try { wk.terminate(); } catch (e) {}
        try { URL.revokeObjectURL(url); } catch (e) {}
        if (err) reject(err); else resolve();
      }
      wk.onmessage = function (ev) {
        finish(ev.data && ev.data.ok ? null : new Error((ev.data && ev.data.error) || "write failed"));
      };
      wk.onerror = function () { finish(new Error("worker failed")); };
      setTimeout(function () { finish(new Error("write timed out")); }, 180000);
      wk.postMessage({ name: name, blob: blob });
    });
  }

  function fetchWithProgress(url, onPct) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var total = +(res.headers.get("Content-Length") || 0);
      if (!res.body || !res.body.getReader || !total) return res.blob();
      var reader = res.body.getReader(), chunks = [], got = 0;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) return new Blob(chunks);
          chunks.push(r.value); got += r.value.length;
          if (onPct) { try { onPct(Math.round(got * 100 / total)); } catch (e) {} }
          return pump();
        });
      })();
    });
  }

  function cachedSize(name) {
    if (!navigator.storage || !navigator.storage.getDirectory) return Promise.resolve(0);
    return navigator.storage.getDirectory()
      .then(function (root) { return root.getDirectoryHandle("piper", { create: false }); })
      .then(function (dir) { return dir.getFileHandle(name); })
      .then(function (h) { return h.getFile(); })
      .then(function (f) { return f.size; })
      .catch(function () { return 0; });
  }

  // Fill the cache by hand for browsers the library cannot write on. Resolves
  // quietly on any failure — the library will simply fetch into memory instead.
  function primeCache(m, id, onPct) {
    var path = m.PATH_MAP && m.PATH_MAP[id];
    if (!path || !m.HF_BASE) return Promise.resolve(false);
    var base = m.HF_BASE + "/" + path;
    var file = path.split("/").pop();          // en_GB-jenny_dioco-medium.onnx
    return cachedSize(file).then(function (sz) {
      if (sz > 1024) return false;             // already there and usable
      return fetchWithProgress(base + ".json", null)
        .then(function (cfg) { return writeViaWorker(file + ".json", cfg); })
        .then(function () { return fetchWithProgress(base, onPct); })
        .then(function (mdl) { return writeViaWorker(file, mdl); })
        .then(function () { return true; });
    }).catch(function () { return false; });
  }

  function makeSession(id, onPct, isRetry) {
    return loadLib().then(function (m) {
      if (!m) throw new Error("Natural voice engine unavailable");
      var TS = m.TtsSession || (m.default && m.default.TtsSession);
      if (!TS || !TS.create) {                 // very old build: wrap predict()
        var api = apiOf(m);
        if (!api.predict) throw new Error("Natural voice engine unavailable");
        return { predict: function (t) { return api.predict({ text: t, voiceId: id }); } };
      }
      try { TS._instance = null; } catch (e) {}   // never reuse another voice's graph
      return sweepCache(null).then(function () {
        // Browsers with no createWritable() need the model put there for them.
        if (canWriteDirect() || !canWriteViaWorker()) return;
        return primeCache(m, id, onPct);
      }).then(function () {
        return TS.create({
          voiceId: id,
          progress: function (p) {
            try { if (onPct && p && p.total) onPct(Math.round(p.loaded * 100 / p.total)); } catch (e) {}
          }
        });
      }).catch(function (err) {
        if (isRetry) throw err;
        // Cached model is unusable — bin it (ours works where m.remove() does
        // not) and fetch once more.
        return sweepCache(id).then(function () { return makeSession(id, onPct, true); });
      });
    }).then(function (s) {
      session = s; sessionVoice = id; naturalFailed = false;
      return s;
    });
  }

  // Download a voice model with progress (parent picker uses this).
  function downloadVoice(id, onPct) {
    naturalFailed = false;
    return makeSession(id, onPct, false).then(function () { piperId = id; return true; });
  }

  // A reusable session (so the 63 MB graph is parsed once, not per phrase).
  function ensureSession() {
    if (session && sessionVoice === piperId) return Promise.resolve(session);
    if (!piperId) return Promise.resolve(null);
    return makeSession(piperId, null, false).catch(function (err) {
      // Don't re-fetch 63 MB for every word: fall back for the rest of the page.
      naturalFailed = true; session = null; sessionVoice = "";
      throw err;
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
    cb = cb ? once(cb) : null;              // one call per phrase, always
    if (mode === "natural" && piperId && !naturalFailed) { speakNatural(text, cb); return; }
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
          b.onclick = function () { chosen = v; setStr(SYS_KEY, v.voiceURI); mode = "system"; setStr(MODE_KEY, "system"); setStr(PICKED_KEY, "1"); render(); speakSystem("Hi! Let's play together!"); };
          box.appendChild(b);
        });
      } else {
        box.appendChild(el("div", "font-size:13px;color:#777;margin-bottom:6px;line-height:1.45;", "A warm neural voice that runs on the phone. Downloads once (~63 MB), then works offline. Tap a voice to install it."));
        if (!canCacheModels()) {
          box.appendChild(el("div", "font-size:13px;color:#a33;font-weight:700;margin-bottom:8px;line-height:1.45;",
            "This tablet's browser is too old to save the voice, so it downloads again each time a game opens. The phone voice is the kinder choice here."));
        }
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
                mode = "natural"; setStr(MODE_KEY, "natural"); setStr(PIP_KEY, pv.id); setStr(PICKED_KEY, "1");
                setStr(AUTO_KEY, "done"); setStr(FAIL_KEY, "0");
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

  // ── Automatic setup ─────────────────────────────────────────────────────
  // A fresh iPhone reads with a flat robotic voice, so on first visit we either
  // adopt an "extra natural" voice already on the phone, or quietly fetch Jenny
  // (British, gentle) once. Never on a metered or slow connection, and never
  // again after a grown-up has picked a voice by hand.
  function bestSystemScore() {
    if (typeof speechSynthesis === "undefined") return -999;
    var vs = (speechSynthesis.getVoices() || []).filter(function (v) { return /^en/i.test(v.lang); });
    if (!vs.length) return -999;
    return vs.map(scoreVoice).sort(function (a, b) { return b - a; })[0];
  }
  function hasNaturalSystemVoice() {
    if (typeof speechSynthesis === "undefined") return false;
    return (speechSynthesis.getVoices() || []).some(function (v) {
      if (!/^en/i.test(v.lang)) return false;
      var n = (v.name || "") + " " + (v.voiceURI || "");
      if (BAD.test(n)) return false;
      return GREAT.test(n) || v.localService === false;   // Siri / neural / enhanced / online
    });
  }
  function metered() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    if (c.saveData === true) return true;
    return /^(slow-2g|2g|3g)$/.test(c.effectiveType || "");
  }
  function whenVoicesReady(cb) {
    var tries = 0;
    (function poll() {
      var n = (typeof speechSynthesis !== "undefined" ? (speechSynthesis.getVoices() || []).length : 0);
      if (n || tries++ > 12) { refreshSystem(); cb(); return; }
      setTimeout(poll, 250);
    })();
  }

  function autoSetup(chip, chipHide) {
    if (getStr(PICKED_KEY, "") === "1") return;                 // grown-up chose already
    whenVoicesReady(function () {
      // An installed Piper voice always wins. This test has to come FIRST:
      // modern iOS exposes the whole macOS voice catalogue, "(Enhanced)" and
      // "Premium" entries included, so hasNaturalSystemVoice() now returns true
      // on phones where it used to return false. When it was checked first it
      // reset mode to "system" — and wrote that to localStorage — on every page
      // load, permanently silencing a 63 MB voice the grown-up had already
      // downloaded. That is the "the natural voice stopped working" bug.
      // (piperId alone is enough: a hand-picked voice sets PICKED_KEY and has
      // already returned above, so anything left here was auto-installed. If an
      // earlier build downgraded it to "system", put it back.)
      if (piperId) {
        if (mode !== "natural") { mode = "natural"; setStr(MODE_KEY, "natural"); }
        return;
      }
      // We used to stop here when the phone reported an "extra natural" system
      // voice. Modern iOS labels a great many voices Enhanced or Premium, so
      // that shortcut fired almost everywhere and Jenny was never installed.
      // Jenny is now the default on any device that can keep her.
      if (getStr(AUTO_KEY, "") === "done") return;
      if (!canCacheModels()) {
        // No OPFS write path at all: an automatic fetch would mean 60 MB on
        // every page, and each game is its own page. Leave it to the grown-up.
        if (chip) chip("Tap \u{1F5E3}\uFE0F Voice for a gentler voice", 4000);
        return;
      }
      if (+getStr(FAIL_KEY, "0") >= 2) {                        // stop re-fetching 63 MB
        if (chip) chip("Tap \u{1F5E3}\uFE0F Voice to try the gentle voice again", 4000);
        return;
      }
      if (metered()) {
        if (chip) chip("Tap 🗣️ Voice for a gentler voice (63 MB)", 5000);
        return;
      }
      if (chip) chip("Getting a gentle voice… 0%", 0);
      downloadVoice(DEFAULT_PIPER, function (pct) {
        if (chip) chip("Getting a gentle voice… " + pct + "%", 0);
      }).then(function () {
        mode = "natural"; setStr(MODE_KEY, "natural");
        setStr(PIP_KEY, DEFAULT_PIPER); setStr(AUTO_KEY, "done");
        if (chip) chip("Gentle voice ready ✨", 2600);
      }).catch(function () {
        mode = "system"; setStr(MODE_KEY, "system");            // phone voice carries on
        setStr(FAIL_KEY, String(+getStr(FAIL_KEY, "0") + 1));
        if (chipHide) chipHide();
      });
    });
  }

  window.BabyVoice = {
    // voice-check.html drives these so the diagnostic exercises the code that
    // actually ships, rather than a copy of it that can drift.
    prepare: function (id, onPct) { return makeSession(id || piperId || DEFAULT_PIPER, onPct, false); },
    capabilities: function () {
      return {
        writeDirect: canWriteDirect(),
        writeViaWorker: canWriteViaWorker(),
        canCache: canCacheModels(),
        mode: mode,
        piperId: piperId
      };
    },
    sweepCache: sweepCache,
    say: say,
    openPicker: openPicker,
    autoSetup: autoSetup,
    hasNaturalSystemVoice: hasNaturalSystemVoice,
    bestSystemScore: bestSystemScore,
    defaultPiper: DEFAULT_PIPER
  };
})();
