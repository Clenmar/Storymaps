#!/usr/bin/env python3
"""
build.py — (re)build the TWC app tutorial videos with a real Piper voice.

Primary path (best): captures real app screens first (run capture.js), composites
them into a branded phone frame, adds a real Piper voice + soft music, and drops
each MP4 into its app folder.

    npm install && npx playwright install chromium
    node capture.js "<ABSOLUTE_PATH_TO_APPS_FOLDER>" ./screenshots
    python3 build.py                     # uses ./screenshots
    VOICE=en_US-amy-medium python3 build.py   # female voice

Fallback path (no browser): voices the pre-made recreation frames instead:
    python3 build.py --fallback

Needs: python3 (pillow numpy piper-tts), ffmpeg, and internet for the Piper model.
"""
import os, sys, json, math, subprocess, glob
import phone_compose as pc
import piper_tts
from music import make_music

KIT = os.path.dirname(os.path.abspath(__file__))
APPS_ROOT = os.path.dirname(KIT)                 # the Apps folder
CFG = json.load(open(os.path.join(KIT,'build_config.json')))
VOICE = os.environ.get('VOICE', CFG['voice']['default'])
FALLBACK = '--fallback' in sys.argv
ONLY = [a for a in sys.argv[1:] if not a.startswith('--')]
LEAD, TAIL, FPS = 0.5, 0.6, 30
WORK = os.path.join(KIT, '_work'); os.makedirs(WORK, exist_ok=True)
NOTE = 'Real screens from the TWC app'

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print('FFMPEG FAIL:', ' '.join(cmd)[:160]); print(r.stderr[-800:]); raise SystemExit(1)

def build_app(app_id, app):
    print(f'\n=== {app_id}  (voice={VOICE}) ===')
    work = os.path.join(WORK, app_id); os.makedirs(work, exist_ok=True)
    # ---- gather frames + narration ----
    frames = []; scenes = []
    if FALLBACK:
        ref = os.path.join(KIT, '_reference_recreations', app_id)
        meta = json.load(open(os.path.join(ref,'narration.json')))['scenes']
        for sc in meta:
            frames.append(os.path.join(ref, f'scene{sc["i"]:02d}.png'))
            scenes.append(sc)
    else:
        man_path = os.path.join(KIT, 'screenshots', app_id, 'manifest.json')
        if not os.path.exists(man_path):
            print('  no screenshots — run capture.js first (or use --fallback). skipping.'); return
        man = json.load(open(man_path))['scenes']
        from PIL import Image
        n = len(man)
        for k, sc in enumerate(man, 1):
            shot = Image.open(sc['file'])
            frame = pc.compose(app['theme'], shot, sc['title'], sc['narr'], k, n, note=NOTE)
            fp = os.path.join(work, f'frame{k:02d}.png'); frame.save(fp)
            frames.append(fp); scenes.append({'i':k,'title':sc['title'],'narr':sc['narr']})
    # ---- Piper voice per scene ----
    durs = []; clips = []
    for k, sc in enumerate(scenes, 1):
        wav = os.path.join(work, f'v{k:02d}.wav')
        vlen = piper_tts.synth_clean(VOICE, sc['narr'], wav)
        clips.append(wav); durs.append(max(4, math.ceil(LEAD+vlen+TAIL)))
    total = sum(durs)
    # ---- per-scene video ----
    seglist = os.path.join(work,'segs.txt')
    with open(seglist,'w') as f:
        for i,fr in enumerate(frames):
            seg = os.path.join(work,f'seg{i+1:02d}.mp4')
            run(['ffmpeg','-y','-loop','1','-t',str(durs[i]),'-i',fr,
                 '-vf',f'scale=1080:1920,fps={FPS},format=yuv420p,fade=t=in:st=0:d=0.35',
                 '-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-r',str(FPS),seg])
            f.write(f"file '{seg}'\n")
    video = os.path.join(work,'video.mp4')
    run(['ffmpeg','-y','-f','concat','-safe','0','-i',seglist,'-c','copy',video])
    # ---- audio: silent bed + voices + ducked music ----
    musicf = make_music(total, os.path.join(work,'music.wav'))
    AF='aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'
    inp=['-f','lavfi','-t',str(total),'-i','anullsrc=r=44100:cl=stereo']
    for c in clips: inp += ['-i', c]
    inp += ['-i', musicf]
    starts=[]; acc=0
    for d in durs: starts.append(acc); acc+=d
    fc=[]; vlabels=[]
    for i,c in enumerate(clips):
        ms=int((starts[i]+LEAD)*1000)
        fc.append(f'[{i+1}:a]{AF},adelay={ms}|{ms}[v{i}]'); vlabels.append(f'[v{i}]')
    fc.append(f'[0:a]{AF}[bed]')
    fc.append(f'[bed]{"".join(vlabels)}amix=inputs={len(vlabels)+1}:normalize=0:duration=first,{AF}[vm]')
    fc.append('[vm]asplit=2[vA][vB]')
    fc.append(f'[{len(clips)+1}:a]{AF},volume=0.9,atrim=0:{total}[mus]')
    fc.append('[mus][vB]sidechaincompress=threshold=0.05:ratio=4:attack=15:release=320,'+AF+'[duck]')
    fc.append(f'[vA][duck]amix=inputs=2:normalize=0,{AF}[premix]')
    fc.append('[premix]alimiter=limit=0.95[aout]')
    audio=os.path.join(work,'audio.m4a')
    run(['ffmpeg','-y',*inp,'-filter_complex',';'.join(fc),'-map','[aout]','-c:a','aac','-b:a','192k',audio])
    # ---- mux + place into app folder ----
    outdir = os.path.join(APPS_ROOT, app['folder'])
    final = os.path.join(outdir, app['output'])
    run(['ffmpeg','-y','-i',video,'-i',audio,'-c:v','copy','-c:a','aac','-b:a','192k',
         '-movflags','+faststart','-shortest',final])
    print(f'  ✓ {app["output"]}  ({total}s, {len(scenes)} scenes) -> {app["folder"]}/')

def main():
    apps = CFG['apps']
    for app_id, app in apps.items():
        if ONLY and app_id not in ONLY: continue
        build_app(app_id, app)
    print('\nAll done. Tutorial pages already reference these MP4s.')

if __name__ == '__main__':
    main()
