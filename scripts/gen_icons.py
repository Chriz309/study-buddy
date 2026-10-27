from PIL import Image, ImageDraw
import math, os

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(len(a)))

def draw_buddy(size):
    S=size*4  # supersample
    img=Image.new("RGBA",(S,S),(0,0,0,0))
    d=ImageDraw.Draw(img)
    # soft rounded background blob (badge) - transparent, so skip; draw the slime directly
    cx=S*0.5; cy=S*0.56
    bw=S*0.74; bh=S*0.62
    top=(S*0.13); 
    # body: a cute slime (rounded dome) with vertical gradient
    steps=bh
    for i in range(int(bh)):
        t=i/bh
        col=lerp((90,220,255),(40,150,245),t)  # cyan -> blue
        y=cy-bh/2+i
        # width of dome at this height (ellipse-ish, flat bottom)
        tt=(i)/bh
        w=bw*math.sin(math.pi*0.5+ (1-tt)*0) # placeholder
        # use ellipse width
        rel=(y-(cy-bh/2))/bh
        ew=bw*math.sqrt(max(0.0,1-( (rel*2-1)**2 )*0.72))
        d.line([(cx-ew/2,y),(cx+ew/2,y)],fill=col+(255,),width=2)
    # flatten bottom with a rounded rectangle base
    d.rounded_rectangle([cx-bw/2, cy+bh/2-bh*0.28, cx+bw/2, cy+bh/2], radius=bw*0.18, fill=(40,150,245,255))
    # outline glow
    # eyes
    er=S*0.075
    for ex in (cx-bw*0.19, cx+bw*0.19):
        ey=cy-bh*0.02
        d.ellipse([ex-er,ey-er*1.25,ex+er,ey+er*1.25],fill=(30,40,70,255))
        d.ellipse([ex-er*0.35,ey-er*0.75,ex+er*0.2,ey-er*0.15],fill=(255,255,255,235))
    # cheeks
    cr=S*0.05
    for ex in (cx-bw*0.33, cx+bw*0.33):
        ey=cy+bh*0.10
        d.ellipse([ex-cr,ey-cr*0.7,ex+cr,ey+cr*0.7],fill=(255,150,180,150))
    # smile
    d.arc([cx-S*0.09,cy+bh*0.00,cx+S*0.09,cy+bh*0.16],20,160,fill=(30,40,70,255),width=max(3,int(S*0.012)))
    # antenna
    d.line([(cx,cy-bh/2),(cx,cy-bh/2-S*0.10)],fill=(40,150,245,255),width=max(3,int(S*0.014)))
    d.ellipse([cx-S*0.035,cy-bh/2-S*0.14,cx+S*0.035,cy-bh/2-S*0.07],fill=(255,210,70,255))
    img=img.resize((size,size),Image.LANCZOS)
    return img

os.makedirs("assets",exist_ok=True)
big=draw_buddy(256)
big.save("assets/icon.png")
draw_buddy(32).save("assets/tray.png")
draw_buddy(16).save("assets/tray16.png")
# ICO with multiple sizes
ico=draw_buddy(256)
ico.save("assets/icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("icons written:", os.listdir("assets"))
