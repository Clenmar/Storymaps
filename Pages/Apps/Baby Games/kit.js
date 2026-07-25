/* Baby Games — shared top bar, theme and screen kit.
 *
 * Why a top bar: on an iPhone, anything pinned to the bottom of the page sits
 * under Safari's toolbar and a toddler can never reach it. Every control the
 * grown-up needs (voice, full screen, day/night, sound, back) is therefore
 * mounted at the TOP, inside the safe area.
 *
 * Drop this into any game with:
 *     <script src="voice.js"><\/script>
 *     <script src="kit.js"><\/script>
 *
 * It will:
 *   • hide the old #voice-btn / #fs-btn / #back-btn / #sound-btn if present,
 *     and take over their jobs;
 *   • remember light or dark for every Baby Games page (one shared setting);
 *   • expose BabyKit.say / BabyKit.theme / BabyKit.bar.
 */
(function () {
  "use strict";

  var THEME_KEY = "babyTheme_v1";           // 'light' | 'dark'
  var SOUND_KEY = "babySound_v1";           // 'on' | 'off'

  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ── theme ───────────────────────────────────────────────────────────── */
  var theme = get(THEME_KEY, "light");

  function applyTheme() {
    var r = document.documentElement;
    r.setAttribute("data-theme", theme);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", theme === "dark" ? "#12101f" : "#fff6dd");
  }
  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    set(THEME_KEY, theme);
    applyTheme();
    paint();
  }

  /* ── styles ──────────────────────────────────────────────────────────── */
  var CSS = [
    /* Night mode: the games paint their own bright gradients inline, so one   */
    /* filter dims the whole playfield without touching any game's palette.   */
    'html[data-theme="dark"] body{background:#12101f}',
    'html[data-theme="dark"] #game,html[data-theme="dark"] #board,html[data-theme="dark"] canvas,',
    'html[data-theme="dark"] .kit-dim{filter:brightness(.62) saturate(.92) contrast(1.02)}',

    /* the bar itself */
    '#kitbar{position:fixed;left:0;right:0;top:0;z-index:99990;display:flex;align-items:center;gap:8px;',
    'padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;pointer-events:none;',
    'font-family:"Baloo 2","Fredoka One",system-ui,-apple-system,sans-serif}',
    '#kitbar .kb{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;border:0;cursor:pointer;',
    'background:rgba(255,255,255,.82);color:#2b2350;border-radius:999px;padding:9px 14px;font:inherit;',
    'font-size:14px;font-weight:800;line-height:1;text-decoration:none;',
    'box-shadow:0 4px 14px rgba(60,40,110,.18);backdrop-filter:blur(8px);',
    '-webkit-backdrop-filter:blur(8px);min-height:40px}',
    '#kitbar .kb:active{transform:translateY(1px)}',
    '#kitbar .kb.round{padding:9px 11px;font-size:17px}',
    '#kitbar .spacer{flex:1}',
    'html[data-theme="dark"] #kitbar .kb{background:rgba(38,33,62,.9);color:#F3EEFF;box-shadow:0 4px 14px rgba(0,0,0,.45)}',
    '#kitbar.hidden{opacity:0;pointer-events:none;transition:opacity .4s}',

    /* voice download chip */
    '#kitvoice{position:fixed;z-index:99991;left:50%;transform:translateX(-50%);',
    'top:calc(env(safe-area-inset-top,0px) + 58px);background:rgba(255,255,255,.94);color:#2b2350;',
    'border-radius:999px;padding:8px 15px;font:800 13px/1 "Baloo 2",system-ui,sans-serif;',
    'box-shadow:0 6px 18px rgba(60,40,110,.22);display:none}',
    'html[data-theme="dark"] #kitvoice{background:rgba(38,33,62,.94);color:#F3EEFF}',

    /* keep game titles clear of the bar */
    'body.kit-pad #title{padding-top:calc(env(safe-area-inset-top,0px) + 58px)!important}',
    '#voice-btn,#fs-btn,#back-btn,#sound-btn,#sound-indicator{display:none!important}'
  ].join("");

  function injectCSS() {
    var s = document.createElement("style");
    s.id = "kitcss";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ── full screen ─────────────────────────────────────────────────────── */
  function isFull() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function goFull() {
    var el = document.documentElement;
    var r = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (r) { try { r.call(el); } catch (e) {} }
    else {
      // iPhone Safari has no Fullscreen API: tell the grown-up how to get one.
      chip('On iPhone: tap Share → Add to Home Screen for full screen', 4200);
    }
    setTimeout(paint, 300);
  }
  function exitFull() {
    var x = document.exitFullscreen || document.webkitExitFullscreen;
    if (x) { try { x.call(document); } catch (e) {} }
    setTimeout(paint, 300);
  }

  /* ── sound (games expose window.toggleSound) ─────────────────────────── */
  var soundOn = get(SOUND_KEY, "on") !== "off";
  function toggleSound() {
    soundOn = !soundOn;
    set(SOUND_KEY, soundOn ? "on" : "off");
    if (typeof window.toggleSound === "function" && window.toggleSound !== toggleSound) {
      try { window.toggleSound(); } catch (e) {}
    } else if (!soundOn) {
      try { speechSynthesis.cancel(); } catch (e) {}
    }
    paint();
  }

  /* ── little chip for messages / download progress ────────────────────── */
  var chipEl = null, chipTimer = null;
  function chip(msg, ms) {
    if (!chipEl) {
      chipEl = document.createElement("div");
      chipEl.id = "kitvoice";
      document.body.appendChild(chipEl);
    }
    chipEl.textContent = msg;
    chipEl.style.display = "block";
    clearTimeout(chipTimer);
    if (ms !== 0) chipTimer = setTimeout(function () { chipEl.style.display = "none"; }, ms || 2600);
  }
  function chipHide() { if (chipEl) chipEl.style.display = "none"; }

  /* ── the bar ─────────────────────────────────────────────────────────── */
  var bar = null;
  function buildBar() {
    var backHref = document.body.getAttribute("data-kit-back") || "index.html";
    var legacyBack = document.getElementById("back-btn");
    if (legacyBack && legacyBack.getAttribute("href") && !document.body.getAttribute("data-kit-back")) {
      var h = legacyBack.getAttribute("href");
      backHref = /\.\.\/index\.html$/.test(h) ? "index.html" : h;   // stay inside Baby Games
    }
    bar = document.createElement("div");
    bar.id = "kitbar";
    bar.innerHTML =
      '<a class="kb round" id="kbBack" title="Back to the games" href="' + backHref + '">←</a>' +
      '<button class="kb round" id="kbSound" title="Sound on or off">🔊</button>' +
      '<span class="spacer"></span>' +
      '<button class="kb" id="kbVoice" title="Choose the voice">🗣️ <span>Voice</span></button>' +
      '<button class="kb" id="kbFull" title="Full screen">⛶</button>' +
      '<button class="kb round" id="kbTheme" title="Day or night">🌙</button>';
    document.body.appendChild(bar);
    document.body.classList.add("kit-pad");

    bar.querySelector("#kbSound").addEventListener("click", toggleSound);
    bar.querySelector("#kbTheme").addEventListener("click", toggleTheme);
    bar.querySelector("#kbFull").addEventListener("click", function () { isFull() ? exitFull() : goFull(); });
    bar.querySelector("#kbVoice").addEventListener("click", function () {
      if (window.BabyVoice && BabyVoice.openPicker) BabyVoice.openPicker();
      else chip("This page has no talking", 2000);
    });
    if (!window.BabyVoice) bar.querySelector("#kbVoice").style.display = "none";
    paint();
  }

  function paint() {
    if (!bar) return;
    bar.querySelector("#kbSound").textContent = soundOn ? "🔊" : "🔇";
    bar.querySelector("#kbTheme").textContent = theme === "dark" ? "☀️" : "🌙";
    bar.querySelector("#kbFull").textContent = isFull() ? "⤢" : "⛶";
  }

  document.addEventListener("fullscreenchange", paint);
  document.addEventListener("webkitfullscreenchange", paint);

  /* ── if photos.js did not load, emoji still work ─────────────────────── */
  if (!window.BabyPhotos) {
    window.BabyPhotos = {
      fill: function (n, t, e) { if (n) n.textContent = e || ""; },
      warm: function () {},
      resolve: function () { return { then: function (f) { f(null); return this; }, catch: function () { return this; } }; },
      upload: function (t, cb) { if (cb) cb(false); },
      own: { get: function () { return null; }, set: function () {}, clear: function () {}, list: function () { return {}; } }
    };
  }

  /* ── boot ────────────────────────────────────────────────────────────── */
  applyTheme();
  function boot() {
    injectCSS();
    applyTheme();
    buildBar();
    if (window.BabyVoice && BabyVoice.autoSetup) BabyVoice.autoSetup(chip, chipHide);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.BabyKit = {
    theme: function () { return theme; },
    toggleTheme: toggleTheme,
    soundOn: function () { return soundOn; },
    chip: chip,
    fullscreen: goFull
  };
})();
