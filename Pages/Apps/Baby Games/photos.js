/* Baby Games — curated pictures (no random web photos).
 *
 * Every subject is resolved to a HAND-PICKED, self-hosted image:
 *   1. a photo the parent chose themselves  (localStorage — e.g. real Mummy)
 *   2. a vetted local Twemoji graphic in ./img/  (chosen per subject)
 *   3. the original emoji glyph, if a subject isn't in the set
 *
 * There is deliberately NO network image lookup, so a game can never show a
 * wrong or random picture. Same public API as before (fill / warm / resolve /
 * upload / own), so the games need no changes.
 *
 * Image credit: Twemoji (Twitter, CC-BY 4.0) — see img/CREDITS.txt.
 */
(function () {
  "use strict";

  var OWN_KEY = "babyPhotoOwn_v1";     // { term: dataURL }  — parent's own photos
  var IMG_DIR = "img/";

  // Terms whose word differs from the file name.
  var ALIAS = {
    mommy: "woman", mummy: "woman", mom: "woman", mum: "woman",
    daddy: "man", dad: "man",
    doggy: "dog", puppy: "dog", kitty: "cat", kitten: "cat",
    brother: "boy", sister: "girl",
    "ice cream": "icecream", icecream: "icecream",
    chicken: "hen", rabbit: "bunny"
  };

  // Every vetted image file that exists in ./img/ (without .png).
  var FILES = {};
  ("woman man baby grandma grandpa dog cat boy girl " +
   "apple banana car ball star moon sun flower fish duck bear cookie milk shoe " +
   "balloon bus tree bee grapes teddy train elephant butterfly icecream frog cake bunny " +
   "cow pig sheep horse hen lion monkey owl wolf " +
   "strawberry orange grass sky eggplant rose chocolate snow").split(/\s+/)
    .forEach(function (n) { FILES[n] = 1; });

  function key(term) { return String(term || "").trim().toLowerCase(); }
  function fileFor(term) {
    var t = key(term);
    if (ALIAS[t]) t = ALIAS[t];
    return FILES[t] ? (IMG_DIR + t + ".png") : null;
  }

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ownGet(term) { return readJSON(OWN_KEY)[key(term)] || null; }
  function ownSet(term, dataURL) { var o = readJSON(OWN_KEY); o[key(term)] = dataURL; writeJSON(OWN_KEY, o); }
  function ownClear(term) { var o = readJSON(OWN_KEY); delete o[key(term)]; writeJSON(OWN_KEY, o); }
  function ownList() { return readJSON(OWN_KEY); }

  function resolve(term) {
    var own = ownGet(term);
    if (own) return Promise.resolve(own);
    return Promise.resolve(fileFor(term));   // local url or null
  }
  function warm() { /* nothing to prefetch — images are local */ return Promise.resolve({}); }

  function injectCSS() {
    if (document.getElementById("bpcss")) return;
    var s = document.createElement("style");
    s.id = "bpcss";
    s.textContent = [
      ".bp{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}",
      ".bp>img{width:100%;height:100%;object-fit:contain;padding:6%;display:block;",
      "opacity:0;transition:opacity .3s ease}",
      ".bp>img.on{opacity:1}",
      ".bp>img.own{object-fit:cover;padding:0}",     // a real uploaded photo fills the frame
      ".bp .bpemo{line-height:1}",
      ".bpround{border-radius:50%}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  // node: element to fill · term: subject · emoji: fallback glyph
  function fill(node, term, emoji, opts) {
    if (!node) return;
    injectCSS();
    opts = opts || {};
    node.classList.add("bp");
    if (opts.round) node.classList.add("bpround");
    node.innerHTML = '<span class="bpemo">' + (emoji || "") + "</span>";
    var emoNode = node.firstChild;
    var own = ownGet(term);
    var url = own || fileFor(term);
    if (!url) return;                        // keep the emoji

    var img = document.createElement("img");
    if (own) img.className = "own";
    img.alt = opts.alt || String(term);
    img.decoding = "async";
    img.addEventListener("load", function () {
      if (emoNode && emoNode.parentNode) emoNode.parentNode.removeChild(emoNode);
      img.classList.add("on");
    });
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
    img.src = url;
    node.appendChild(img);
  }

  /* ── parent picks a real photo from the phone (kept) ─────────────────── */
  function upload(term, done) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) { inp.remove(); if (done) done(false); return; }
      var fr = new FileReader();
      fr.onload = function () { shrink(fr.result, 480, function (small) { if (small) ownSet(term, small); inp.remove(); if (done) done(!!small); }); };
      fr.onerror = function () { inp.remove(); if (done) done(false); };
      fr.readAsDataURL(f);
    });
    inp.click();
  }
  function shrink(dataURL, size, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var side = Math.min(img.width, img.height);
        var c = document.createElement("canvas"); c.width = c.height = size;
        var x = (img.width - side) / 2, y = (img.height - side) / 2;
        c.getContext("2d").drawImage(img, x, y, side, side, 0, 0, size, size);
        cb(c.toDataURL("image/jpeg", 0.82));
      } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = dataURL;
  }

  window.BabyPhotos = {
    fill: fill, warm: warm, resolve: resolve, upload: upload,
    own: { get: ownGet, set: ownSet, clear: ownClear, list: ownList }
  };
})();
