"""
piper_tts.py — download a Piper voice from HuggingFace and synthesize narration,
removing Piper's end-of-clip noise burst (append filler -> cut at the silence gap).

Voice id format: en_US-ryan-high  (male, warm)  |  en_US-amy-medium (female), etc.
Set env VOICE to override.
"""
import os, sys, subprocess, wave, urllib.request, shutil
import numpy as np

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.voices')
HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'

def voice_paths(voice_id):
    # en_US-ryan-high -> lang_region=en_US, name=ryan, quality=high, lang=en
    region, name, quality = voice_id.split('-')      # en_US, ryan, high
    lang = region.split('_')[0]                        # en
    rel = f'{lang}/{region}/{name}/{quality}/{voice_id}'
    onnx = os.path.join(CACHE, voice_id + '.onnx')
    conf = os.path.join(CACHE, voice_id + '.onnx.json')
    return rel, onnx, conf

def ensure_voice(voice_id):
    os.makedirs(CACHE, exist_ok=True)
    rel, onnx, conf = voice_paths(voice_id)
    for url, dst in [(f'{HF}/{rel}.onnx', onnx), (f'{HF}/{rel}.onnx.json', conf)]:
        if os.path.exists(dst) and os.path.getsize(dst) > 1000: continue
        print('  downloading', os.path.basename(dst), '...')
        urllib.request.urlretrieve(url, dst)
    return onnx, conf

def _piper_cli(text, onnx, out_wav, length_scale=0.96):
    cmds = [['piper','-m',onnx,'-f',out_wav,'--length-scale',str(length_scale)],
            [sys.executable,'-m','piper','-m',onnx,'-f',out_wav,'--length-scale',str(length_scale)]]
    last = None
    for cmd in cmds:
        try:
            p = subprocess.run(cmd, input=text.encode(), capture_output=True)
            if p.returncode == 0 and os.path.exists(out_wav): return
            last = p.stderr.decode()[-400:]
        except FileNotFoundError as e:
            last = str(e)
    raise RuntimeError('piper synth failed: ' + str(last))

def _read_wav(path):
    with wave.open(path,'rb') as w:
        sr=w.getframerate(); n=w.getnframes()
        a=np.frombuffer(w.readframes(n),dtype=np.int16).astype(np.float32)/32768.0
    return sr,a

def _write_wav(path,sr,a):
    a=np.clip(a,-1,1); pcm=(a*32767).astype(np.int16)
    with wave.open(path,'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())

def _strip_burst(sr,a):
    """append-filler method: cut at the last >=120ms low-energy run in the final ~45%."""
    win=int(sr*0.02);
    if len(a)<win*3: return a
    frames=len(a)//win
    energy=np.array([np.sqrt((a[i*win:(i+1)*win]**2).mean()+1e-9) for i in range(frames)])
    thr=max(0.02, energy.max()*0.08)
    start_search=int(frames*0.55)
    # find last low-energy run start in the tail
    cut=None; run=0
    for i in range(frames-1, start_search-1, -1):
        if energy[i]<thr:
            run+=1
            if run>=6:  # ~120ms
                cut=i+run; break
        else:
            run=0
    if cut is None:
        # fallback: trim trailing silence normally
        idx=np.where(np.abs(a)>thr)[0]
        return a[:idx[-1]+int(sr*0.12)] if len(idx) else a
    end=min(len(a),(cut)*win)
    return a[:end]

def synth_clean(voice_id, text, out_wav):
    onnx,_=ensure_voice(voice_id)
    tmp=out_wav+'.raw.wav'
    _piper_cli(text.rstrip('. ')+'. Have fun.', onnx, tmp)   # filler catches the burst
    sr,a=_read_wav(tmp)
    a=_strip_burst(sr,a)
    # trim leading silence + small pads
    idx=np.where(np.abs(a)>0.01)[0]
    if len(idx): a=a[max(0,idx[0]-int(sr*0.03)):]
    _write_wav(out_wav,sr,a)
    os.remove(tmp)
    return len(a)/sr
