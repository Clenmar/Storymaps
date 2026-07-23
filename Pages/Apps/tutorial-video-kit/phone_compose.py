"""
phone_compose.py — wrap a REAL app screenshot in a branded phone frame with a
caption band (step, title, narration) and a progress-pip row. 1080x1920 vertical.
Fonts fall back gracefully so this runs on any machine.
"""
import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 1080, 1920
SW, SH = 760, 1500   # inner phone screen

# --- font loading with fallbacks (URW -> DejaVu -> default) ---
_CANDIDATES = {
    'disp': ['/usr/share/fonts/opentype/urw-base35/C059-Bold.otf',
             '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'],
    'serif':['/usr/share/fonts/opentype/urw-base35/P052-Roman.otf',
             '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],
    'geo':  ['/usr/share/fonts/opentype/urw-base35/URWGothic-Demi.otf',
             '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
}
_cache = {}
def font(kind, size):
    k = (kind, size)
    if k in _cache: return _cache[k]
    for p in _CANDIDATES.get(kind, []):
        if os.path.exists(p):
            _cache[k] = ImageFont.truetype(p, size); return _cache[k]
    _cache[k] = ImageFont.load_default()
    return _cache[k]

def hx(c):
    if isinstance(c, tuple): return c if len(c)==4 else (*c,255)
    c=c.lstrip('#')
    if len(c)==3: c=''.join(ch*2 for ch in c)
    return (int(c[0:2],16),int(c[2:4],16),int(c[4:6],16),255)

def dgrad(size,c1,c2):
    w,h=size; a=np.array(hx(c1),float); b=np.array(hx(c2),float)
    yy,xx=np.mgrid[0:h,0:w]; t=((xx/max(w-1,1))+(yy/max(h-1,1)))/2
    arr=(a[None,None,:]+(b-a)[None,None,:]*t[:,:,None]).astype(np.uint8)
    return Image.fromarray(arr,'RGBA')

def _wrap(d,s,f,maxw):
    out=[]; line=''
    for w in s.split():
        t=(line+' '+w).strip()
        if d.textlength(t,font=f)<=maxw or not line: line=t
        else: out.append(line); line=w
    if line: out.append(line)
    return out

def _ctext(d,x,y,s,f,fill,track=0):
    if track==0:
        d.text((x,y),s,font=f,fill=fill,anchor='ma'); return
    ws=[d.textlength(c,font=f) for c in s]; tot=sum(ws)+track*(len(s)-1); cx=x-tot/2
    for c,w in zip(s,ws): d.text((cx,y),c,font=f,fill=fill,anchor='la'); cx+=w+track

def fit_screen(img):
    """resize/crop a screenshot to exactly SW x SH (cover)."""
    r=max(SW/img.width, SH/img.height)
    nw,nh=int(img.width*r),int(img.height*r)
    im=img.resize((nw,nh))
    x=(nw-SW)//2; y=0
    return im.crop((x,y,x+SW,y+SH))

def compose(theme, screen_img, step_title, narration, step_i, step_n, note=None):
    base=dgrad((W,H), theme.get('page1','#12102a'), theme.get('page2','#05060f')).convert('RGBA')
    d=ImageDraw.Draw(base)
    ac=hx(theme.get('accent','#c0213c')); ac2=theme.get('accent2',theme.get('accent','#c0213c'))
    # glow
    glow=Image.new('RGBA',(W,H),(0,0,0,0))
    ImageDraw.Draw(glow).ellipse((W//2-360,150,W//2+360,900),fill=(ac[0],ac[1],ac[2],60))
    base=Image.alpha_composite(base,glow.filter(ImageFilter.GaussianBlur(120))); d=ImageDraw.Draw(base)
    # phone frame
    px=(W-SW)//2; py=150; fp=20
    frame=(px-fp,py-fp,px+SW+fp,py+SH+fp)
    sh=Image.new('RGBA',(W,H),(0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle(frame,radius=70,fill=(0,0,0,150))
    base=Image.alpha_composite(base,sh.filter(ImageFilter.GaussianBlur(40))); d=ImageDraw.Draw(base)
    d.rounded_rectangle(frame,radius=70,fill=(18,18,26,255),outline=(60,60,74,255),width=3)
    scr=fit_screen(screen_img.convert('RGBA'))
    mask=Image.new('L',(SW,SH),0); ImageDraw.Draw(mask).rounded_rectangle((0,0,SW-1,SH-1),radius=54,fill=255)
    base.paste(scr,(px,py),mask); d=ImageDraw.Draw(base)
    d.rounded_rectangle((W//2-90,py+8,W//2+90,py+40),radius=16,fill=(18,18,26,255))
    # caption band
    cy=py+SH+fp+52
    _ctext(d,W//2,cy,f'STEP {step_i} OF {step_n}',font('geo',26),hx(ac2),track=6); cy+=52
    _ctext(d,W//2,cy,step_title,font('disp',52),(255,255,255,255),track=1); cy+=78
    for ln in _wrap(d,narration,font('serif',30),900):
        d.text((W//2,cy),ln,font=font('serif',30),fill=(210,214,226,255),anchor='ma'); cy+=44
    # pips
    pipw=min(70,900//step_n-8); tot=step_n*pipw+(step_n-1)*10; sx=W//2-tot//2; yb=H-70
    for i in range(step_n):
        on=i<=step_i-1
        c=ac2 if i==step_i-1 else (theme.get('accent','#c0213c') if on else '#3a3a48')
        d.rounded_rectangle((sx,yb,sx+pipw,yb+8),radius=4,fill=hx(c)); sx+=pipw+10
    if note:
        d.text((W//2,H-40),note,font=font('serif',18),fill=(150,150,165,255),anchor='ma')
    return base.convert('RGB')
