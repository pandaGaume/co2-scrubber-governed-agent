# Rover tracks around the habitat: a near-field height map (ruts, berms, chevron tread)
# and darkening masks, in the scene's world coordinates (metres, origin at the habitat).
import sys, numpy as np
from PIL import Image
out = sys.argv[1]
rng = np.random.default_rng(4)

def catmull(P, step):
    P = np.asarray(P, float); P = np.vstack([P[0], P, P[-1]])
    pts = []
    for i in range(1, len(P)-2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        n = max(2, int(np.linalg.norm(p2-p1)/step))
        t = np.linspace(0, 1, n, endpoint=False)[:, None]
        pts.append(0.5*((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t**2 + (-p0+3*p1-3*p2+p3)*t**3))
    pts.append(P[-2][None])
    Q = np.vstack(pts)
    # resample at constant spacing
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))])
    ss = np.arange(0, s[-1], step)
    return np.stack([np.interp(ss, s, Q[:, 0]), np.interp(ss, s, Q[:, 1])], 1), ss

PARK = (11.5, 3.0)
routes = [  # control points, number of passes, lateral jitter per pass (m)
    ([PARK, (13, -3), (12, -10), (15, -18), (21, -30), (45, -60), (120, -120), (320, -270), (700, -560)], 4, 0.5),  # the traverse: crosses the foreground, out to the south-east
    ([PARK, (7, -5.5), (1, -8), (-3, -14), (-5.5, -18.5), (-7, -14), (-4, -9.5), (3, -6.5), (9, -3), PARK], 2, 0.3),  # along the front, to the solar mast and back
    ([PARK, (18, 8), (30, 22), (45, 50), (90, 140), (220, 380), (500, 900)], 2, 0.5),                     # old route north-east, toward the Earth side
    ([(13, -3), (18, 1), (16, 7), (12, 7), PARK], 1, 0.2),                                                # a turn-around near the parking spot
]
TRACK = 1.83     # wheel track (m), Apollo LRV
W = 0.23         # tyre width (m)

# near field: 160 x 160 m, 8192 px (1.95 cm/px)
X0, Y0, SIZE, NPX = -60.0, -90.0, 160.0, 8192
px = SIZE/NPX
Hneg = np.zeros((NPX, NPX), np.float32); Hpos = np.zeros((NPX, NPX), np.float32); Mk = np.zeros((NPX, NPX), np.float32)
# far field: 1.6 km, 2048 px (0.78 m/px)
FX0, FY0, FSIZE, FNPX = -800.0, -800.0, 1600.0, 2048
fpx = FSIZE/FNPX
Far = np.zeros((FNPX, FNPX), np.float32)

K = int(np.ceil((W/2 + 0.09)/px))
ky, kx = np.mgrid[-K:K+1, -K:K+1]
for ctrl, passes, jit in routes:
    for p in range(passes):
        C = np.array(ctrl, float) + rng.normal(0, jit, (len(ctrl), 2)) * np.r_[0, np.ones(len(ctrl)-1)][:, None]
        pts, s = catmull(C, px)
        tan = np.gradient(pts, axis=0); tan /= np.linalg.norm(tan, axis=1, keepdims=True) + 1e-9
        nor = np.stack([-tan[:, 1], tan[:, 0]], 1)
        age = 0.6 + 0.4*rng.random()          # older passes are shallower
        phase = rng.random()
        for side in (-1, 1):
            wheel = pts + nor*side*TRACK/2
            # far mask: every 0.5 m
            fi = ((wheel[::25, 1]-FY0)/fpx).astype(int); fj = ((wheel[::25, 0]-FX0)/fpx).astype(int)
            ok = (fi >= 0) & (fi < FNPX) & (fj >= 0) & (fj < FNPX)
            Far[fi[ok], fj[ok]] = np.maximum(Far[fi[ok], fj[ok]], age)
            ci = (wheel[:, 1]-Y0)/px; cj = (wheel[:, 0]-X0)/px
            inside = (ci > K+1) & (ci < NPX-K-2) & (cj > K+1) & (cj < NPX-K-2)
            # fade at the border of the near field so the far mask takes over
            edge = np.minimum.reduce([ci, NPX-ci, cj, NPX-cj])*px
            fade_all = np.clip((edge-2)/6, 0, 1)
            for k in np.nonzero(inside)[0][::2]:      # one stamp every 2 px is enough: the kernel overlaps
                i0, j0 = int(ci[k]), int(cj[k])
                gy = (i0+ky+0.5)*px + Y0 - wheel[k, 1]; gx = (j0+kx+0.5)*px + X0 - wheel[k, 0]
                n = gx*nor[k, 0] + gy*nor[k, 1]; t = gx*tan[k, 0] + gy*tan[k, 1]
                a = np.abs(n)
                rut = np.where(a < W/2, -0.028*(1-(2*a/W)**2), 0.0)
                tread = (np.sin(2*np.pi*((s[k]+t)/0.11 + 1.6*a/W + phase)) > 0.35)*np.where(a < W/2*0.92, 1.0, 0.0)
                v = (rut*(1 + 0.25*tread) + 0.009*np.exp(-((a-W/2-0.035)/0.03)**2)) * age * fade_all[k]
                m = np.clip(1 - (a-W/2-0.02)/0.06, 0, 1) * age * fade_all[k]
                sl = (slice(i0-K, i0+K+1), slice(j0-K, j0+K+1))
                Hneg[sl] = np.minimum(Hneg[sl], np.minimum(v, 0)); Hpos[sl] = np.maximum(Hpos[sl], np.maximum(v, 0))
                Mk[sl] = np.maximum(Mk[sl], m)
H = Hneg + Hpos*(Hneg > -1e-4)
enc = np.clip((H + 0.05)/0.1, 0, 1)
# images are stored with row 0 at the top: flip so v = (y - Y0)/SIZE reads upward
Image.fromarray((np.flipud(enc)*65535).astype(np.uint16)).save(out + "/tracks_height_8k.png")
Image.fromarray((np.flipud(Mk[::2, ::2])*255).astype(np.uint8)).save(out + "/tracks_mask_4k.png")
from scipy.ndimage import gaussian_filter
Far = gaussian_filter(Far, 0.6); Far /= max(Far.max(), 1e-6)
Image.fromarray((np.flipud(Far)*255).astype(np.uint8)).save(out + "/tracks_far_2k.png")
print("height range", H.min(), H.max(), "mask cover", (Mk > 0.1).mean())
