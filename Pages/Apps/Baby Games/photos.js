/* Baby Games — real photographs instead of emoji.
 *
 * Every subject (dog, apple, Mommy, an eye…) is resolved to an actual
 * photograph. Three sources, in order:
 *
 *   1. a photo the parent chose themselves  (localStorage, survives offline)
 *   2. a URL already cached from a previous visit
 *   3. Wikipedia's lead image for the subject — real Wikimedia Commons
 *      photography, fetched through the CORS-friendly API, then cached
 *
 * If all three fail (no signal, blocked, no article) the original emoji is
 * shown, so a game never ends up with an empty box.
 *
 * Usage:
 *   BabyPhotos.warm(["dog","cat"]);              // optional pre-fetch
 *   BabyPhotos.fill(node, "dog", "🐶");          // photo, emoji fallback
 *   BabyPhotos.upload("Mommy", function(){...}); // parent picks a photo
 */
(function () {
  "use strict";

  var URL_KEY = "babyPhotoUrl_v1";     // { term: {u:url, t:when} }
  var OWN_KEY = "babyPhotoOwn_v1";     // { term: dataURL }
  var TTL = 90 * 24 * 3600 * 1000;     // re-check remote URLs every ~3 months
  var API = "https://en.wikipedia.org/w/api.php";

  /* Which Wikipedia article carries a good photo of each subject. Anything not
     listed falls back to the capitalised term itself. */
  var TITLES = {
    // animals
    dog:"Dog", cat:"Cat", cow:"Cattle", pig:"Pig", sheep:"Sheep", horse:"Horse",
    frog:"Frog", duck:"Duck", hen:"Chicken", chicken:"Chicken", lion:"Lion",
    elephant:"Elephant", bee:"Bee", monkey:"Monkey", owl:"Owl", wolf:"Wolf",
    bear:"Brown bear", fish:"Fish", bunny:"Rabbit", rabbit:"Rabbit", butterfly:"Butterfly",
    // first words
    apple:"Apple", banana:"Banana", car:"Car", ball:"Ball", star:"Star", moon:"Moon",
    sun:"Sun", flower:"Flower", cookie:"Cookie", milk:"Milk", shoe:"Shoe",
    balloon:"Toy balloon", bus:"Bus", tree:"Tree", grapes:"Grape", teddy:"Teddy bear",
    train:"Train", "ice cream":"Ice cream", cake:"Cake", baby:"Infant",
    // body parts
    eyes:"Human eye", eye:"Human eye", nose:"Human nose", mouth:"Mouth", ear:"Ear",
    hair:"Hair", hand:"Hand", foot:"Foot",
    // family
    mommy:"Mother", daddy:"Father", grandma:"Grandmother", grandpa:"Grandfather",
    brother:"Boy", sister:"Girl", doggy:"Dog", kitty:"Cat",
    // colour rewards
    strawberry:"Strawberry", orange:"Orange (fruit)", lemon:"Lemon", grass:"Lawn",
    sky:"Sky", eggplant:"Eggplant", rose:"Rose", chocolate:"Chocolate", snow:"Snow",
    // landing page tiles
    bubbles:"Soap bubble", rainbow:"Rainbow", painting:"Watercolor painting",
    family:"Family", book:"Book", toddler:"Toddler"
  };

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function key(term) { return String(term || "").trim().toLowerCase(); }
  function titleFor(term) {
    var t = key(term);
    if (TITLES[t]) return TITLES[t];
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* ── the parent's own photos ─────────────────────────────────────────── */
  function ownGet(term) { return readJSON(OWN_KEY)[key(term)] || null; }
  function ownSet(term, dataURL) { var o = readJSON(OWN_KEY); o[key(term)] = dataURL; writeJSON(OWN_KEY, o); }
  function ownClear(term) { var o = readJSON(OWN_KEY); delete o[key(term)]; writeJSON(OWN_KEY, o); }
  function ownList() { return readJSON(OWN_KEY); }

  /* ── cached remote URLs ──────────────────────────────────────────────── */
  function cacheGet(term) {
    var c = readJSON(URL_KEY)[key(term)];
    if (!c || !c.u) return null;
    if (Date.now() - (c.t || 0) > TTL) return null;
    return c.u;
  }
  function cacheSet(term, url) {
    var c = readJSON(URL_KEY);
    c[key(term)] = { u: url, t: Date.now() };
    writeJSON(URL_KEY, c);
  }

  /* ── Wikipedia lookup (batched, CORS enabled) ────────────────────────── */
  var inflight = {};

  function lookup(terms) {
    var need = [], byTitle = {};
    terms.forEach(function (t) {
      if (ownGet(t) || cacheGet(t) || inflight[key(t)]) return;
      var title = titleFor(t);
      byTitle[title.toLowerCase()] = key(t);
      if (need.indexOf(title) < 0) need.push(title);
      inflight[key(t)] = true;
    });
    if (!need.length) return Promise.resolve({});

    var url = API + "?action=query&format=json&origin=*&redirects=1" +
      "&prop=pageimages&piprop=thumbnail&pithumbsize=640&titles=" +
      encodeURIComponent(need.slice(0, 40).join("|"));

    return fetch(url, { mode: "cors", credentials: "omit" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var out = {};
        var pages = (d && d.query && d.query.pages) || {};
        var norm = {};
        ((d.query && d.query.normalized) || []).forEach(function (n) { norm[n.to.toLowerCase()] = n.from.toLowerCase(); });
        ((d.query && d.query.redirects) || []).forEach(function (n) { norm[n.to.toLowerCase()] = n.from.toLowerCase(); });
        Object.keys(pages).forEach(function (pid) {
          var p = pages[pid];
          if (!p.thumbnail || !p.thumbnail.source) return;
          var lower = (p.title || "").toLowerCase();
          var seen = {};
          while (norm[lower] && !seen[lower]) { seen[lower] = 1; lower = norm[lower]; }
          var term = byTitle[lower] || byTitle[(p.title || "").toLowerCase()];
          if (!term) return;
          cacheSet(term, p.thumbnail.source);
          out[term] = p.thumbnail.source;
        });
        return out;
      })
      .catch(function () { return {}; })
      .then(function (out) {
        terms.forEach(function (t) { delete inflight[key(t)]; });
        return out;
      });
  }

  function warm(terms) { return lookup(terms || []); }

  function resolve(term) {
    var own = ownGet(term);
    if (own) return Promise.resolve(own);
    var c = cacheGet(term);
    if (c) return Promise.resolve(c);
    return lookup([term]).then(function (m) { return m[key(term)] || null; });
  }

  /* ── painting a node ─────────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById("bpcss")) return;
    var s = document.createElement("style");
    s.id = "bpcss";
    s.textContent = [
      ".bp{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}",
      ".bp>img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;",
      "opacity:0;transition:opacity .35s ease}",
      ".bp>img.on{opacity:1}",
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

    resolve(term).then(function (url) {
      if (!url) return;
      var img = document.createElement("img");
      img.alt = opts.alt || String(term);
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("load", function () {
        if (emoNode && emoNode.parentNode) emoNode.parentNode.removeChild(emoNode);
        img.classList.add("on");
      });
      img.addEventListener("error", function () {
        if (img.parentNode) img.parentNode.removeChild(img);   // emoji stays
      });
      img.src = url;
      node.appendChild(img);
    });
  }

  /* ── parent picks a photo from the phone ─────────────────────────────── */
  function upload(term, done) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (!f) { inp.remove(); if (done) done(false); return; }
      var fr = new FileReader();
      fr.onload = function () {
        shrink(fr.result, 480, function (small) {
          if (small) ownSet(term, small);
          inp.remove();
          if (done) done(!!small);
        });
      };
      fr.onerror = function () { inp.remove(); if (done) done(false); };
      fr.readAsDataURL(f);
    });
    inp.click();
  }

  // Square-crop and shrink so localStorage can hold a handful of family photos.
  function shrink(dataURL, size, cb) {
    var img = new Image();
    img.onload = function () {
      try {
        var side = Math.min(img.width, img.height);
        var c = document.createElement("canvas");
        c.width = c.height = size;
        var x = (img.width - side) / 2, y = (img.height - side) / 2;
        c.getContext("2d").drawImage(img, x, y, side, side, 0, 0, size, size);
        cb(c.toDataURL("image/jpeg", 0.82));
      } catch (e) { cb(null); }
    };
    img.onerror = function () { cb(null); };
    img.src = dataURL;
  }

  window.BabyPhotos = {
    fill: fill,
    warm: warm,
    resolve: resolve,
    upload: upload,
    own: { get: ownGet, set: ownSet, clear: ownClear, list: ownList },
    titles: TITLES
  };
})();
