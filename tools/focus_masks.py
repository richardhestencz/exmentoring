# A „Csak zene” kép mozgásmaszkjai (server/public/img/focus-{day,night}-m1/m2.png).
# Futtatás: python3 focus_masks.py <kép> <kimenet-előtag> day|night [nappali kép: éjjel ebből jönnek a fák, mert a sötétben nem válnak el]
# Maszkok a „Csak zene” kép mozgatásához (1920x1080-as koordinátákban, teljes felbontásban mentve; forrásnak a 3840-es kép a legjobb)
# m1: R folyó, G lomb, B köd   m2: R égbolt, G festett hangjegyek, B a folyás iránya (szög)
# m3: R a többi fa (fenyők, bokrok), az értéke a fa tövétől felfelé nő, így a csúcs ring, a tő áll
import sys, numpy as np, cv2
from PIL import Image
src, out, night = sys.argv[1], sys.argv[2], sys.argv[3] == 'night'
im = np.asarray(Image.open(src).convert('RGB').resize((1920, 1080), Image.LANCZOS)).astype(np.float32) / 255
H, W = 1080, 1920
hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)  # H 0..360, S 0..1, V 0..1
h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
lum = im[..., 0] * .299 + im[..., 1] * .587 + im[..., 2] * .114
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def poly(pts):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 1); return m.astype(np.float32)
def blur(m, r): return cv2.GaussianBlur(m, (0, 0), r)
def var(x, r):
    mu = blur(x, r); return np.sqrt(np.maximum(blur(x * x, r) - mu * mu, 0))

# lomb: sárga-arany, telített, texturált (a nap fénye mögötte sima, az nem mozog)
tex = var(lum, 3)
leaf = ((h > 28) & (h < 62) & (s > .45) & (v > .45)).astype(np.float32) * np.clip((tex - .03) / .05, 0, 1)
zone = poly([(120, 0), (1800, 0), (1790, 300), (1560, 330), (1420, 450), (1240, 470), (1080, 330), (870, 330), (870, 380), (560, 385), (250, 340), (120, 260)])
trunk = poly([(820, 1080), (860, 600), (880, 330), (1050, 330), (1080, 600), (1120, 1080)])
canopy = np.clip(blur(cv2.dilate(leaf * zone, np.ones((3, 3))), 2.5) * 1.7, 0, 1) * (1 - blur(trunk, 8))
canopy = np.clip(canopy, 0, 1)

# folyó: világos, sima víz a kijelölt sávokban; az irány a kézzel húzott középvonalakból (a néző felé folyik)
lines = [[(850, 598), (790, 612), (735, 632), (700, 650), (650, 668), (620, 688), (660, 698), (720, 712), (752, 728), (722, 746), (688, 765), (690, 782), (745, 800)],
         [(1300, 688), (1338, 710), (1290, 728), (1215, 750), (1265, 766), (1340, 782), (1300, 802), (1245, 822)],
         [(1255, 583), (1170, 590), (1090, 596)]]
rzone = np.clip(poly([(590, 585), (870, 585), (860, 615), (815, 640), (800, 700), (775, 760), (770, 815), (640, 815), (600, 700)])
                + poly([(1180, 660), (1420, 660), (1430, 835), (1180, 835)]) + poly([(1075, 575), (1270, 575), (1270, 602), (1075, 602)]), 0, 1)
bright = np.clip((lum - blur(lum, 25) - (.0 if night else .02)) / .10, 0, 1)
smooth = np.clip(1 - (var(lum, 2) - .02) / .05, 0, 1)
wl = (.42 if not night else .25)
if night:  # éjjel a víz csillogó, texturált: elég, ha a környezeténél jóval világosabb
    river = rzone * np.clip((lum - blur(lum, 25) - .10) / .12, 0, 1)
    river = cv2.morphologyEx(river, cv2.MORPH_CLOSE, np.ones((5, 5)))
else:
    river = rzone * bright * smooth * np.clip((lum - wl) / .15, 0, 1)
river = np.clip(blur(cv2.dilate(river, np.ones((3, 3))), 1.5) * 1.5, 0, 1)
river *= 1 - poly([(835, 560), (1085, 560), (1100, 1080), (800, 1080)])  # a törzs széle nem víz

# a folyás iránya: minden pontra a legközelebbi középvonal-szakasz iránya
best = np.full((H, W), 1e9, np.float32); ang = np.full((H, W), np.pi / 2, np.float32)
for L in lines:
    for (x0, y0), (x1, y1) in zip(L, L[1:]):
        dx, dy = x1 - x0, y1 - y0; l2 = dx * dx + dy * dy
        t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / l2, 0, 1)
        d = (xx - x0 - t * dx) ** 2 + (yy - y0 - t * dy) ** 2
        m = d < best; best[m] = d[m]; ang[m] = np.arctan2(dy, dx)
ang = np.where(ang < -np.pi / 2, ang + 2 * np.pi, ang)
angc = (ang + np.pi / 2) / (2 * np.pi)

# köd: világos, kevéssé telített, lágy foltok a völgyekben
mzone = np.clip(poly([(1180, 555), (1920, 540), (1920, 850), (1180, 850)]) + poly([(0, 640), (640, 600), (700, 850), (0, 860)])
                + poly([(380, 560), (620, 560), (620, 640), (380, 640)]), 0, 1)
if night: mist = ((s < .45) & (v > .30) & (h > 180) & (h < 260)).astype(np.float32)
else: mist = ((s < .42) & (v > .52)).astype(np.float32)
mist = blur(mist * blur(mzone, 12) * np.clip(1 - (tex - .04) / .06, 0, 1), 6) * 1.4
mist = np.clip(mist, 0, 1) * (1 - river)

# égbolt: a hegyek vonala fölött, a lomb és a sziklák nélkül
hz = np.array([(0, 395), (120, 405), (250, 420), (400, 440), (600, 455), (800, 465), (1300, 465), (1400, 420), (1500, 420), (1600, 400), (1760, 380), (1770, 300), (1920, 300)], np.float32)
yh = np.interp(xx[0], hz[:, 0], hz[:, 1])
sky = (yy < yh[None, :] - 8).astype(np.float32)
sky -= poly([(1400, 300), (1510, 300), (1510, 470), (1400, 470)]) + poly([(1760, 300), (1920, 300), (1920, 470), (1760, 470)])
sky = blur(np.clip(sky, 0, 1), 16)  # a zóna széle lágy, így a mozgás nem vág el egy egyenes vonalon
# a fa (ágak, lomb) nem ég: az ég kék/szürke, vagy világos és sima; az ág barna és sötét
skypx = (((h > 150) & (h < 300)) | ((v > .55) & (tex < .035) & (s < .7)) | ((v > .35) & ~((h > 28) & (h < 62) & (s > .45) & (v > .45) & (tex > .03)))).astype(np.uint8)
skypx = cv2.morphologyEx(skypx, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
skypx = cv2.erode(skypx, np.ones((5, 5), np.uint8)).astype(np.float32)
sky = np.clip(blur(np.clip(sky, 0, 1) * skypx * (1 - np.clip(canopy * 3, 0, 1)), 2.5), 0, 1)

# a festett hangjegyek (a lant fölött): arany pöttyök, körülöttük margó, hogy egyben lebegjenek
nzone = poly([(1030, 630), (1235, 630), (1235, 800), (1030, 800)])
gold = ((h > 30) & (h < 62) & (s > .35) & (v > .70) & (v - blur(v, 5) > .14)).astype(np.float32) * nzone
n_, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(gold.astype(np.uint8), np.ones((3, 3), np.uint8)))
gold *= np.isin(lab, [i for i in range(1, n_) if 4 <= st[i, 4] <= 260]).astype(np.float32)  # csak a kis, különálló formák
notes = np.clip(blur(cv2.dilate(gold, np.ones((9, 9))), 3) * 1.5, 0, 1)

# a többi fa: zöld-olajzöld, texturált pixelek a két oldali erdőben (a nagy fa, a gyökerek, a kövek és a sziklák nélkül)
tzone = np.clip(poly([(0, 400), (230, 400), (230, 680), (760, 680), (760, 790), (600, 830), (560, 1000), (0, 1000)])
                + poly([(1330, 690), (1560, 620), (1700, 560), (1920, 560), (1920, 1000), (1440, 1000), (1440, 820), (1330, 800)]), 0, 1)
tzone *= 1 - poly([(285, 835), (370, 835), (375, 1000), (280, 1000)]) - poly([(1515, 860), (1595, 860), (1600, 1000), (1515, 1000)])
tzone = blur(np.clip(tzone, 0, 1), 6)
th, ts, tv, ttex = h, s, v, tex
if len(sys.argv) > 4:  # az éjszakai kép a nappaliból készült, a fák ugyanott vannak
    dim = np.asarray(Image.open(sys.argv[4]).convert('RGB').resize((1920, 1080), Image.LANCZOS)).astype(np.float32) / 255
    dh = cv2.cvtColor(dim, cv2.COLOR_RGB2HSV); th, ts, tv = dh[..., 0], dh[..., 1], dh[..., 2]
    ttex = var(dim[..., 0] * .299 + dim[..., 1] * .587 + dim[..., 2] * .114, 3)
treepx = (((th > 38) & (th < 160) & (ts > .22) & (tv > .07)) & (ttex > .02)).astype(np.uint8)
treepx = cv2.morphologyEx(treepx, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)).astype(np.float32) * tzone * (1 - np.clip(mist * 2 + river * 2, 0, 1))
# magasság a fa tövétől: oszloponként alulról felfelé számolt összefüggő futás, 160 képpontnál telítődik
run = np.zeros((H, W), np.float32); on = treepx > .5
for y in range(H - 2, -1, -1): run[y] = np.where(on[y], run[y + 1] + 1, 0)
trees = np.clip(blur(treepx * np.clip(run / 160, 0, 1), 2), 0, 1)

def save(r, g, b, name):
    a = np.dstack([r, g, b])
    Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)).save(name, optimize=True)
save(river, canopy, mist, out + '-m1.png'); save(sky, notes, angc, out + '-m2.png'); save(trees, trees * 0, trees * 0, out + '-m3.png')
# ellenőrző kép
o = im * .45; o[..., 0] += river * .8; o[..., 1] += canopy * .5; o[..., 2] += mist * .8; o[..., 2] += sky * .25; o[..., 0] += notes * .5; o[..., 1] += notes * .5; o[..., 0] += trees * .7; o[..., 2] += trees * .7
Image.fromarray((np.clip(o, 0, 1) * 255).astype(np.uint8)).resize((1440, 810)).save(out + '-check.jpg', quality=85)
