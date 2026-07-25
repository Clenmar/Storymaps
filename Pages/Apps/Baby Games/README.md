# Baby Games

Bible-themed interactive games for babies and toddlers at TWC Ministries.

**URL base:** `twcministries.net/Pages/Apps/Baby Games/`
**Start here:** `index.html` — the sub-landing page that lists every game. The
Apps landing page links straight to it, and each game's ← button comes back here.

## Files

| File | What it is |
|---|---|
| `index.html` | Sub-landing page: game cards, filter chips, grown-up notes |
| `kit.js` | **Shared top bar** — back, sound, voice, full screen, day/night. Loaded by every page |
| `photos.js` | **Real photographs** instead of emoji, with emoji as the fallback |
| `voice.js` | Shared speech: system voices plus optional Piper neural voices |
| `baby-squish-game.html` | Tap anywhere, bubbles pop |
| `baby-bible-squish.html` | Bible squish, with letters and numbers modes |
| `baby-draw.html` | Finger painting with worship songs |
| `baby-animals.html` | Fifteen animals with names and sounds |
| `baby-colors.html` | Colour blocks that say their names |
| `baby-words.html` | First words, one picture at a time |
| `baby-body.html` | Point to the nose, eyes, ears… |
| `baby-family.html` | Mommy, Daddy, Grandma, baby |
| `tutorial.html` | Video walkthrough |

## The shared kit

Add these two lines to any new game and it gets everything:

```html
<script src="voice.js"></script>
<script src="photos.js"></script>
<script src="kit.js"></script>
```

`kit.js` then:

- mounts the control bar at the **top** of the screen, inside the iOS safe area.
  Nothing a grown-up needs sits at the bottom, where Safari's toolbar hides it;
- hides any legacy `#voice-btn` / `#fs-btn` / `#back-btn` / `#sound-btn` and takes
  over their jobs (it reads the old back link, so `../index.html` becomes
  `index.html` automatically);
- remembers **day or night** for every Baby Games page in `babyTheme_v1`. Night
  mode dims `#game`, `#board`, `canvas` or anything with `.kit-dim`, so a game
  needs no dark palette of its own;
- calls the game's own `window.toggleSound()` when the 🔊 button is tapped;
- on a page with no Fullscreen API (iPhone Safari) the ⛶ button explains
  *Share → Add to Home Screen* instead of failing silently.

Set a different back target with `<body data-kit-back="../index.html">` — that is
what the sub-landing page itself uses.

## The voice

`voice.js` sets itself up on first visit (`BabyVoice.autoSetup`, called by the kit):

1. If the phone already has an **extra-natural** English voice (Siri, neural,
   enhanced, or any cloud voice) it uses that. No download.
2. Otherwise — which is what a fresh iPhone gives you — it fetches
   **`en_GB-jenny_dioco-medium`** (Jenny, British, gentle) once, about 63 MB,
   showing a small progress chip. After that it runs offline.
3. Never on a metered or slow connection (`saveData`, 2g/3g): it shows a hint and
   leaves the choice to the grown-up.
4. Never again once someone picks a voice by hand in the 🗣️ Voice picker
   (`babyVoicePicked_v1`).

Games speak with `BabyVoice.say(text, done)`. `baby-bible-squish.html` and
`baby-draw.html` route their own `speakText()` through it, so they inherit the
same voice.

Piper needs the onnxruntime import map in `<head>`; every game already has it:

```html
<script type="importmap">
{ "imports": { "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm" } }
</script>
```

## Photographs, not emoji

`photos.js` turns a subject into a real photograph. Three sources, in order:

1. **a photo the parent chose** — `BabyPhotos.upload("Mommy", cb)` opens the phone's
   picker, square-crops to 480 px and keeps it in `localStorage`. Nothing is
   uploaded anywhere. *Where's Mommy?* has a 📷 **Photos** button so the game can
   show the child's actual family;
2. **a URL cached** from an earlier visit (re-checked every 3 months);
3. **Wikipedia's lead image** for the subject — genuine Wikimedia Commons
   photography, fetched through the CORS-friendly API and cached. `TITLES` in
   `photos.js` maps a subject to the right article (`cow → Cattle`,
   `balloon → Toy balloon`, `nose → Human nose`…).

If every source fails — no signal, blocked, no article — the original emoji stays
on screen, so a game never shows an empty box.

```js
BabyPhotos.warm(["dog","cat"]);            // pre-fetch a whole grid in one request
BabyPhotos.fill(node, "dog", "🐶");        // paint a node, emoji until the photo lands
BabyPhotos.fill(node, "Mommy", "👩", {round:true});
```

Photos are used in Animal Sounds, First Words, Point To…, Where's Mommy?, the
colour reward in Colors!, and the cards on this landing page.

## Keeping little fingers in the game

iPhone → Settings → Accessibility → Guided Access. Android → screen pinning.
`baby-bible-squish.html` also has its own PIN exit button.
