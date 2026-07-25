# Prompt to paste into a web-enabled Claude (Claude.ai with web search, or Claude Code)

You are helping me add an **offline, in-browser neural text-to-speech (Piper) voice**
to a **static HTML web app** (no build step, no server, no npm at runtime — plain
`<script>` tags on a website). It must work on iPhone Safari and Android Chrome, run
the neural model client-side via WebAssembly, and keep working offline after a
one-time model download. Target audience: a toddler learning-games app, so I want
warm, gentle, natural English voices (British and American, male and female).

Please **research current, verified facts** (2024–2025) from official sources
(the library's npm page / GitHub repo / README, and the Hugging Face
`rhasspy/piper-voices` repository) and return the results.

Specifically I need:

1. The current in-browser Piper/VITS library for the web:
   - exact npm package name and latest version,
   - a working **ESM CDN URL** (jsDelivr or unpkg) I can `import()` directly in a
     browser with no bundler,
   - the version of `onnxruntime-web` it depends on,
   - the exact API for: (a) listing available voices, (b) downloading/caching a
     voice model with a progress callback, (c) synthesizing text to audio — and
     what the synth call returns (WAV `Blob`? `ArrayBuffer`? sample rate?),
   - how/where it caches downloaded models (OPFS? IndexedDB? Cache API?),
   - a **minimal working example** (a few lines) of download-then-speak in a browser.

2. A short list of recommended **English Piper voices** that sound warm/friendly
   (both `en_US` and `en_GB`, at least one female and one male). For **each** voice give:
   - the exact `voiceId` string the library uses,
   - quality tier (low/medium) and approximate model download size in MB,
   - the **direct download URLs** on Hugging Face for the `.onnx` model file AND
     the `.onnx.json` config file (so I can self-host them),
   - a one-line description of the voice.

3. Hosting notes:
   - Does the library require cross-origin isolation (COOP/COEP response headers)
     to run, or does it fall back to single-threaded WASM without them?
   - How do I **self-host** the model files (serve `.onnx` + `.onnx.json` from my
     own site) and point the library at a custom base path instead of Hugging Face?

4. Known gotchas on iOS Safari and Android Chrome (audio autoplay requiring a user
   gesture, WASM threads/SharedArrayBuffer, first-synthesis latency, memory).

**Output format:** return ONE fenced ```json code block that exactly matches this
schema (fill every field with verified values; use null/empty if truly unknown),
followed by a 3–5 sentence plain-English summary. Do not include any copyrighted
prose — only technical facts, URLs, and short code.

```json
{
  "library": {
    "npm_package": "",
    "latest_version": "",
    "esm_cdn_url": "",
    "onnxruntime_web_version": "",
    "api": {
      "list_voices": "",
      "download_model": "",
      "synthesize_returns": "",
      "cache_mechanism": ""
    },
    "minimal_example": ""
  },
  "voices": [
    {
      "id": "",
      "display": "",
      "language": "en_US or en_GB",
      "gender": "female or male",
      "quality": "low or medium",
      "approx_mb": 0,
      "onnx_url": "",
      "config_url": "",
      "description": ""
    }
  ],
  "hosting": {
    "runtime_cdn_ok": true,
    "requires_coop_coep": false,
    "self_host_base_path_option": "",
    "self_host_instructions": ""
  },
  "gotchas": [],
  "sources": []
}
```
