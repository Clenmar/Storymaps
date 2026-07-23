# TWC App Walkthrough Video — Cowork Prompt

Paste everything below into Cowork. Fill in the three bracketed values at the top for each app, attach any screenshots, and let it run. It encodes the full method plus every problem hit while building the Brain Games video and how each was solved, so you don't rediscover them.

---

## PROMPT (paste from here down)

You are producing a narrated walkthrough video for one of the TWC Ministries web apps. Follow this methodology exactly. It was refined on the Brain Games app; the pitfalls listed are real and will recur, so apply the fixes pre-emptively.

**Inputs for this run**
- App URL: `[https://twcministries.net/Pages/Apps/...]`
- Visual style to match: `[e.g. bright/rounded/rainbow like Brain Games, or industrial/steel like the Strong app]`
- Output format(s): `[landscape 1280x720, vertical 1080x1920, or both]`
- Screenshots attached: `[yes/no — attach if the app's screens are drawn by JS and won't appear in page HTML]`

**Goal**
A short (roughly 70–90s) animated walkthrough: a phone mockup that steps through the app's real screens, an energetic voice-over per step, a soft original music bed, and a progress indicator. Export as an MP4.

### Method

1. **Read the page.** Fetch the app URL and extract the real labels, tabs, buttons, and copy. Use the app's actual wording.

2. **Get what the page can't give you.** The live site is not reachable from the sandbox, so you cannot screen-capture the real app — you rebuild a faithful mock. Anything rendered by the app's JavaScript (game boards, modals, difficulty pickers, category tiles) will NOT be in the fetched HTML. If those are central, ask for or use the attached screenshots. Do not invent screens you can't see: build them from screenshots, and label any screen you had to approximate as a stand-in, both on-screen and in the final caption.

3. **Read the frontend-design skill first**, then build an animated `walkthrough.html`:
   - A phone mockup containing one hidden `<section>` per step (the real screens).
   - A small JS "scene engine" that auto-advances one scene per second, with a step label, title, narration text, and a signature progress element (e.g. coloured pips or a themed bar).
   - Match the app's real look: pull its actual colours and use the real fonts. Download fonts from the Google Fonts GitHub repo (raw.githubusercontent.com) because CDNs and Hugging Face are blocked in the sandbox; install them system-wide (`/usr/share/fonts/...` + `fc-cache -f`) or headless Chromium will substitute and it will look wrong.

4. **Write energetic narration**, one punchy line per scene (short sentences, exclamations, momentum). Keep each line within its scene's time budget.

5. **Synthesize the voice with Piper** (`pip install --break-system-packages piper-tts`). Voice model comes from a GitHub release asset, e.g. `rhasspy/piper` v0.0.2 `voice-en-us-ryan-high` (Hugging Face is blocked). Use `--length-scale 0.96` for energy. Request raw PCM with `--output-raw` and wrap it into a clean WAV yourself.

6. **Remove Piper's end-of-clip noise burst (critical — see Issues).** For each line, append a throwaway sentence (" Have fun.") before synthesizing, then cut the audio at the natural silence gap that precedes the filler. Verify the cut clip ends on speech.

7. **Lock scene durations to the narration.** Measure each cleaned clip. Set each scene's video length ≥ 0.5s lead + narration + ~0.3s tail; keep them whole seconds. These become the scene durations in the HTML.

8. **Record** `walkthrough.html` (a record-mode variant with the interactive controls/chapter list/footer hidden and a fixed canvas) using Playwright Chromium `record_video`. Landscape canvas 1280×720; vertical canvas 1080×1920.

9. **Fix the timing drift.** Playwright's webm duration won't equal your intended total. Measure it, compute `factor = intendedTotal / webmDuration`, and apply `setpts=factor*PTS` in ffmpeg so the final video is exactly the intended length and scene boundaries stay aligned with the audio. Transcode with `libx264 -crf 21 -pix_fmt yuv420p -movflags +faststart`, `fps=30`.

10. **Assemble the voice track** onto a single silent bed of exactly the total duration: `anullsrc` + `adelay` each clip to `sceneStart + 0.5s` + `amix normalize=0`. Do NOT concatenate the raw Piper WAVs (their malformed headers inject clicks at joins).

11. **Add an original music bed.** Generate it yourself with numpy (soft major-key pad + gentle arpeggio, low level) so there is no licensing issue for the church. Mix: raise music to an audible level, duck it gently under the voice with `sidechaincompress` (threshold ≈ 0.06, ratio ≈ 3, release ≈ 350ms), `amix normalize=0`, then `alimiter`. Do not run a final `loudnorm` over the whole mix (it re-buries the music — see Issues).

12. **Export.** Mux video + mixed audio (`-c:a aac -b:a 176k -shortest`). For vertical, enlarge the phone with CSS `zoom` (crisp) rather than `transform: scale` (blurs text), stack phone over title/text, and use large fonts so it's legible on a phone.

### Issues encountered and how they were resolved

- **Loud static after each spoken line.** Piper appends a full-scale white-noise burst to the end of every clip, regardless of voice model. Its WAV output additionally has an odd-byte/invalid-size data chunk that ffmpeg decodes inconsistently, sometimes emitting the garbage tail.
  - *Didn't work:* end fades (burst outlasts the fade); cutting by loudness/RMS (burst and loud speech share levels); zero-crossing-rate detection (this voice's speech is bright and also high-ZCR); envelope-variance and sample-correlation cuts (correct in principle but fragile boundary-walking gave inconsistent results, and spurious high-correlation frames inside the burst fooled it).
  - *Fix that worked:* append " Have fun." to each line so the burst lands on the filler, then cut at the silence gap before the filler (detect the last ≥120ms low-energy run in the final ~45% of the clip). Take raw PCM via `--output-raw` and wrap it yourself to sidestep the malformed WAV.
  - *Verify:* sample-to-sample correlation of the clip's tail should be ~0.9+ (speech reads high, white noise reads ~0), and there should be no run of `(correlation < 0.3 AND rms > 0.4)` anywhere in the clip.

- **Music was inaudible.** Two causes: it was mixed too quietly, and — bigger — the loud end-bursts made the loudness normalizer think the track was hot, so it attenuated everything and buried the bed. Removing the bursts, raising the music, lightening the ducking, and dropping the final `loudnorm` fixed it. Confirm by measuring RMS in the gaps between lines; it should be clearly above the near-silent level it had before.

- **Clicks between clips.** Concatenating Piper's odd-byte WAVs injected clicks at the joins. Placing each clip with `adelay` onto one silent bed (instead of concat) removed them.

- **Video ran long / audio drifted out of sync.** Playwright webm duration ≠ intended total. Solved by measuring the webm and `setpts`-scaling to the exact intended length; because scenes advance on a uniform 1s tick, uniform scaling keeps every scene boundary aligned with its narration.

- **Wrong fonts in the render.** Headless Chromium substituted fonts because CDNs are blocked. Fixed by downloading the real fonts from GitHub and installing them system-wide before recording.

- **Blurry phone when enlarged for vertical.** `transform: scale` rasterizes then scales (blurs text). CSS `zoom` re-lays-out at the larger size and stays crisp.

- **Screens not in the page.** Game boards and modals are JS-rendered and absent from the fetched HTML. Rebuilt from user screenshots and clearly labelled any approximated screen.

### Environment notes (sandbox)
- bash network is allowlisted: github.com, pypi.org, npm, raw.githubusercontent.com work; **huggingface.co is blocked**; **the live twcministries.net site is not reachable** (so you mock it, you don't capture it).
- `pip install` needs `--break-system-packages`.
- ffmpeg, Playwright Chromium, numpy/scipy are available or pip-installable.

### Deliverables per app
- `walkthrough.html` (editable source, with visible controls for you to re-preview).
- The final MP4(s) in the requested format(s).
- A one-line note listing which screens were approximated.

### Doing all the TWC apps
Treat the first completed app as a template. Keep its `walkthrough.html`, narration script, and music file. For each subsequent app: fetch its page, swap in its colours/fonts/screens (and screenshots for JS-rendered parts), rewrite the narration lines, and re-run steps 5–12 unchanged. Batch the remaining apps once one result is approved.

## (end of prompt)
