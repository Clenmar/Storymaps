# TWC Tutorial Video Kit

Regenerates the 8 TWC app walkthrough videos with a **real Piper neural voice** and **real
screenshots of the actual apps**. Built to run in any environment that has internet access
(the first sandbox that made these videos was network-restricted, so it couldn't fetch the
Piper voice model or a browser — hence this portable kit).

## Quickest path
Open `CLAUDE_CODE_PROMPT.md` and paste it into a Claude chat that has internet + a terminal.
It runs the four commands below for you.

## What it does
1. **`capture.js`** (Playwright) opens each real app HTML at a phone viewport and screenshots
   the genuine screens listed in `build_config.json` → `screenshots/<app>/`.
2. **`build.py`** composites each screenshot into a branded phone frame (`phone_compose.py`),
   synthesizes narration with **Piper** (`piper_tts.py`, downloads the voice from HuggingFace),
   generates a soft original music bed (`music.py`), mixes voice over ducked music, and muxes
   the final vertical **1080×1920 MP4** into each app folder.
3. The tutorial pages (`<App>/tutorial.html`) already reference these filenames, so the new
   videos appear automatically.

## Run it manually
```bash
pip install --break-system-packages pillow numpy piper-tts   # + ffmpeg on PATH
npm install && npx playwright install chromium
node capture.js "/absolute/path/to/Pages/Apps" ./screenshots
python3 build.py                       # Ryan (male) voice
VOICE=en_US-amy-medium python3 build.py   # female voice
python3 build.py --fallback            # no browser: voice the recreation frames instead
```

## Files
| file | purpose |
|---|---|
| `build_config.json` | themes, narration, and per-app real-screen capture steps (edit this to tweak) |
| `capture.js` / `package.json` | Playwright screenshot driver |
| `phone_compose.py` | wraps a screenshot in the phone frame + caption + progress pips |
| `piper_tts.py` | downloads a Piper voice + synthesizes with end-burst cleanup |
| `music.py` | generates the royalty-free music bed |
| `build.py` | orchestrator — produces the MP4s and places them in each app folder |
| `_reference_recreations/` | the pre-made recreation frames (fallback + reference) |

## Voices
Default `en_US-ryan-high` (warm male). Set `VOICE=` to any Piper voice id, e.g.
`en_US-amy-medium`, `en_US-hfc_female-medium`, `en_US-lessac-medium`, `en_US-libritts_r-medium`.
Browse them at https://huggingface.co/rhasspy/piper-voices .

## Note on login-gated apps
Testimony, Family Budget, TWC Strong and Family Tasks require a password against a live backend,
so only their real sign-in screens are captured by default. Add real credentials to the `actions`
in `build_config.json` to capture logged-in screens too.
