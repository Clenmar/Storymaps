# Paste this into a network-enabled Claude chat (Claude Code / Cowork with internet)

> The sandbox that first built these videos could **not** reach HuggingFace or GitHub,
> so it used a robotic espeak voice and recreated screens. This kit fixes both:
> it captures the **real** app screens and uses a **real Piper neural voice**.
> Your environment needs internet (for the Piper model) + a browser (for screenshots).

---

**Prompt:**

You are in the folder `Pages/Apps/tutorial-video-kit` of my TWC Ministries website repo.
Please (re)build the 8 app tutorial videos with a real Piper voice and real app screenshots,
then drop each finished MP4 into its app folder. Everything is driven by `build_config.json`.

Do this:

1. Install dependencies:
   ```bash
   pip install --break-system-packages pillow numpy piper-tts
   # ffmpeg must be available (apt-get install -y ffmpeg  OR  brew install ffmpeg)
   npm install
   npx playwright install chromium
   ```

2. Capture the real app screens (writes ./screenshots/<app>/):
   ```bash
   node capture.js "$(cd .. && pwd)" ./screenshots
   ```
   `$(cd .. && pwd)` is the absolute path to the `Pages/Apps` folder. If that shell trick
   doesn't work, pass the absolute path to the Apps folder yourself.

3. Build the videos with the Piper "Ryan" voice (downloads the model from HuggingFace on first run):
   ```bash
   python3 build.py
   ```
   For a **female** voice instead:
   ```bash
   VOICE=en_US-amy-medium python3 build.py
   ```
   (other good voices: `en_US-hfc_female-medium`, `en_US-lessac-medium`, `en_US-libritts_r-medium`)

4. That's it. `build.py` composites each real screenshot into a branded phone frame,
   adds the Piper narration + a soft original music bed, and writes the MP4 into each app
   folder using the exact filenames the tutorial pages already point at
   (e.g. `Testimony_app/testimony-tutorial.mp4`). Nothing else needs editing.

**No browser available?** Skip step 2 and run `python3 build.py --fallback` — it will voice the
pre-made recreation frames in `_reference_recreations/` instead (still real Piper voice, but the
screens are recreations rather than live captures).

**Want more screens per app?** The login-gated apps (Testimony, Budget, Strong, Family Tasks)
only show their real sign-in screens because their live backends need a password. If you add real
credentials, you can extend the `actions` arrays in `build_config.json` (e.g. type the password and
click sign-in) to capture the logged-in screens too — all real, no fake data.

**Verify** each MP4 afterwards:
```bash
for f in ../*/**-tutorial.mp4; do ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done
```
Each should be ~20-30s, 1080x1920, with clear Piper narration over soft music.
