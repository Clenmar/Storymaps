"""music.py — generate a soft, original major-key pad + gentle arpeggio bed.
Church-safe: fully synthesized here, so there is no licensing issue."""
import wave, math
import numpy as np

def make_music(total_sec, path, sr=44100):
    n=int(total_sec*sr); t=np.arange(n)/sr; out=np.zeros(n)
    chords=[(261.63,329.63,392.00),(220.00,261.63,329.63),
            (174.61,220.00,261.63),(196.00,246.94,293.66)]  # C Am F G
    bar=4.0
    for k in range(int(math.ceil(total_sec/bar))):
        ch=chords[k%len(chords)]; st=k*bar
        seg=(t>=st)&(t<st+bar); tt=t[seg]-st
        env=np.minimum(1.0,tt/0.8)*np.minimum(1.0,(bar-tt)/1.2)
        for fi,f in enumerate(ch):
            pad=np.sin(2*np.pi*f*tt)+0.5*np.sin(2*np.pi*f*1.005*tt)
            trem=1.0+0.05*np.sin(2*np.pi*0.2*tt)
            out[seg]+=pad*env*trem*(0.10/(fi+1))
        for step in range(8):
            f=ch[step%3]*2; at=st+step*(bar/8)
            a0=int(at*sr); a1=min(n,int((at+bar/8)*sr)); m=a1-a0
            if m<=0: continue
            tt2=np.arange(m)/sr
            out[a0:a1]+=np.sin(2*np.pi*f*tt2)*np.exp(-tt2*3.5)*0.05
    k=12; out=np.convolve(out,np.ones(k)/k,mode='same')
    out=out/(np.max(np.abs(out))+1e-9)*0.5
    stereo=np.stack([out,np.roll(out,40)],axis=1)
    pcm=(np.clip(stereo,-1,1)*32767).astype(np.int16)
    with wave.open(path,'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
    return path
