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
        age = 0.9 + 0.1*rng.random()          # no wind on the Moon: old passes stay as sharp as new ones
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
# ---------------------------------------------------------------- the building site
# The module was set down and levelled here: the pad keeps the grading marks of the blade and the
# wider ruts of the construction vehicle that brought it. Nothing erases them (no wind).
YAW = np.radians(27.0)                     # the module's axis
def to_world(lx, ly):
    return np.array([lx*np.cos(YAW) - ly*np.sin(YAW), lx*np.sin(YAW) + ly*np.cos(YAW)])
def stamp_path(ctrl, offsets, width, depth, berm, tread_pitch, jit=0.3, step=2):
    """Ruts or grooves along a smooth path: one per lateral offset."""
    C = np.array(ctrl, float); C[1:-1] += rng.normal(0, jit, C[1:-1].shape)
    pts, s = catmull(C, px)
    tan = np.gradient(pts, axis=0); tan /= np.linalg.norm(tan, axis=1, keepdims=True) + 1e-9
    nor = np.stack([-tan[:, 1], tan[:, 0]], 1)
    Kp = int(np.ceil((width/2 + 0.06)/px)); qy, qx = np.mgrid[-Kp:Kp+1, -Kp:Kp+1]
    for off in offsets:
        line = pts + nor*off
        ci = (line[:, 1]-Y0)/px; cj = (line[:, 0]-X0)/px
        ok = (ci > Kp+1) & (ci < NPX-Kp-2) & (cj > Kp+1) & (cj < NPX-Kp-2)
        for k in np.nonzero(ok)[0][::step]:
            i0, j0 = int(ci[k]), int(cj[k])
            gy = (i0+qy+0.5)*px + Y0 - line[k, 1]; gx = (j0+qx+0.5)*px + X0 - line[k, 0]
            n = np.abs(gx*nor[k, 0] + gy*nor[k, 1]); t = gx*tan[k, 0] + gy*tan[k, 1]
            g = np.where(n < width/2, -depth*(1-(2*n/width)**2), 0.0)
            if tread_pitch:
                g = g*(1 + 0.3*(np.sin(2*np.pi*(s[k]+t)/tread_pitch) > 0.3))
            v = g + berm*np.exp(-((n-width/2-0.03)/0.03)**2)
            m = np.clip(1 - (n-width/2-0.01)/0.05, 0, 1)*0.8
            sl = (slice(i0-Kp, i0+Kp+1), slice(j0-Kp, j0+Kp+1))
            np.minimum(Hneg[sl], np.minimum(v, 0), out=Hneg[sl]); np.maximum(Hpos[sl], np.maximum(v, 0), out=Hpos[sl])
            np.maximum(Mk[sl], m, out=Mk[sl])
# grading: the blade's passes across the pad, each a band of shallow parallel grooves
for k in range(9):
    a = rng.random()*np.pi; c0 = rng.normal(0, 6, 2); d = np.array([np.cos(a), np.sin(a)])
    bend = np.array([-d[1], d[0]])*rng.normal(0, 2.5)
    ctrl = [tuple(c0 - d*16), tuple(c0 - d*5 + bend), tuple(c0 + d*5 + bend), tuple(c0 + d*16)]
    stamp_path(ctrl, offsets=np.arange(-0.9, 0.95, 0.15), width=0.05, depth=0.006, berm=0.0015, tread_pitch=0, jit=0.5, step=3)
# the construction vehicle: wider track (2.6 m), wide tyres; loops around the module and in from the east
for k in range(3):
    ring = [tuple(to_world(11.5*np.cos(t), 6.5*np.sin(t))) for t in np.linspace(0, 2*np.pi, 11)]
    stamp_path(ring, offsets=(-1.3, 1.3), width=0.36, depth=0.03, berm=0.01, tread_pitch=0.16, jit=0.6)
stamp_path([tuple(to_world(10, -3)), (25, -6), (45, -12), (75, -25)], offsets=(-1.3, 1.3), width=0.36, depth=0.03, berm=0.01, tread_pitch=0.16)

# ---------------------------------------------------------------- crew bootprints
# Apollo-type overshoe: about 0.33 x 0.13 m, transverse tread bars; 1.5 to 2.5 cm deep, heel deeper,
# a small raised rim, compacted (darker) regolith. Walking: alternate feet, stride about 0.75 m;
# now and then the two-feet hop the Apollo crews used.
LADDER = np.array([8.6, 4.3])            # foot of the airlock stairs (world)
MAST = np.array([-2.0, -19.0])           # the solar mast and its floodlight
ROVER = np.array([11.5, 3.0])
FL, FW = 0.165, 0.065                    # half length, half width of the sole
KF = int(np.ceil(0.22/px)); fy, fx = np.mgrid[-KF:KF+1, -KF:KF+1]
def boot(c, th, depth=0.02, age=1.0):
    i0, j0 = int((c[1]-Y0)/px), int((c[0]-X0)/px)
    if not (KF+1 < i0 < NPX-KF-2 and KF+1 < j0 < NPX-KF-2): return
    gy = (i0+fy+0.5)*px + Y0 - c[1]; gx = (j0+fx+0.5)*px + X0 - c[0]
    u = gx*np.cos(th) + gy*np.sin(th); v = -gx*np.sin(th) + gy*np.cos(th)       # u toward the toe
    waist = 1 - 0.18*np.exp(-((u+0.02)/0.05)**2)                               # the arch
    r = (np.abs(u)/FL)**2.4 + (np.abs(v)/(FW*waist))**2.4
    inside = r < 1
    heel = 1 + 0.35*np.clip(-u/FL, 0, 1)
    tread = 0.0035*(np.sin(2*np.pi*u/0.026) > 0.2)
    val = np.where(inside, -(depth*heel - tread)*(1 - r**4), 0.0)
    rim = 0.004*np.exp(-((r-1.08)/0.12)**2)*(r >= 1)
    v_ = (val + rim)*age
    m = np.clip(1.25 - r, 0, 1)*0.9*age
    sl = (slice(i0-KF, i0+KF+1), slice(j0-KF, j0+KF+1))
    np.minimum(Hneg[sl], np.minimum(v_, 0), out=Hneg[sl]); np.maximum(Hpos[sl], np.maximum(v_, 0), out=Hpos[sl])
    np.maximum(Mk[sl], m, out=Mk[sl])
def far_mark(p, age):
    fi, fj = int((p[1]-FY0)/fpx), int((p[0]-FX0)/fpx)
    if 0 <= fi < FNPX and 0 <= fj < FNPX: Far[fi, fj] = max(Far[fi, fj], 0.35*age)
def walk(ctrl, jit=0.4, stride=0.75, hop=0.12, age=1.0):
    """Footprints along a path: alternate feet, now and then a two-feet hop."""
    C = np.array(ctrl, float); C[1:-1] += rng.normal(0, jit, C[1:-1].shape)
    pts, s = catmull(C, 0.05)
    d = 0.0; side = 1; L = s[-1]
    while d < L:
        k = min(int(d/0.05), len(pts)-2); p = pts[k]; tvec = pts[k+1]-pts[k]; th = np.arctan2(tvec[1], tvec[0])
        nvec = np.array([-np.sin(th), np.cos(th)])
        if rng.random() < hop:                                # two feet together, a longer leap
            for sd in (-1, 1): boot(p + nvec*sd*0.13 + rng.normal(0, 0.02, 2), th + rng.normal(0, 0.08), 0.024, age)
            d += stride*1.6
        else:
            boot(p + nvec*side*0.14 + rng.normal(0, 0.03, 2), th + rng.normal(0, 0.12), 0.018 + 0.006*rng.random(), age)
            side = -side; d += stride*(0.85 + 0.3*rng.random())
        far_mark(p, age)
def out_and_back(ctrl, **kw):
    walk(ctrl, **kw)
    back = [ctrl[-1]] + [tuple(np.array(q) + rng.normal(0, 1.2, 2)) for q in ctrl[-2:0:-1]] + [ctrl[0]]
    walk(back, **kw)
# trampled ground at the foot of the stairs
for k in range(170):
    a = rng.random()*2*np.pi; r = 2.3*np.sqrt(rng.random())
    boot(LADDER + np.array([np.cos(a), np.sin(a)])*r*np.array([1.0, 0.8]), rng.random()*2*np.pi, 0.016 + 0.01*rng.random(), 0.92 + 0.08*rng.random())
# the building site: the whole pad trampled while the module was set down, levelled and fitted,
# densest along the hull and at the six feet (the jacks were set by hand), some under the hull
LEGS = [to_world(x, sy*1.9) for x in (-3.6, 0.0, 3.6) for sy in (-1, 1)]
for k in range(900):
    lx = rng.uniform(-9.5, 10.5); ly = rng.normal(0, 3.2)
    if abs(lx) < 6.0 and abs(ly) < 1.2 and rng.random() < 0.7: continue      # less under the middle of the hull
    boot(to_world(lx, ly), rng.random()*2*np.pi, 0.016 + 0.01*rng.random(), 0.92 + 0.08*rng.random())
for p in LEGS:
    for k in range(25):
        a = rng.random()*2*np.pi; r = 0.35 + 0.7*rng.random()
        boot(p + r*np.array([np.cos(a), np.sin(a)]), a + np.pi/2 + rng.normal(0, 0.5), 0.02, 1.0)
for k in range(6):                                  # walks all the way round the module
    a0 = rng.random()*2*np.pi; rx, ry = 8.5 + rng.normal(0, 0.6), 4.3 + rng.normal(0, 0.5)
    ring = [tuple(to_world(rx*np.cos(a0 + t), ry*np.sin(a0 + t))) for t in np.linspace(0, 2*np.pi, 13)]
    walk(ring, jit=0.3, stride=0.7, hop=0.05, age=0.95)
# back and forth to the solar mast floodlight, along the front of the module, and around its base
for k in range(4):
    out_and_back([tuple(LADDER), (9.8, 0.5), (6.5, -5.0), (1.0, -8.5), (-1.5, -15.5), tuple(MAST + np.array([0.9, 0.6]))], jit=0.5, age=0.95)
for k in range(3):
    a0 = rng.random()*2*np.pi; ring = [tuple(MAST + 1.4*np.array([np.cos(a0 + t), np.sin(a0 + t)])) for t in np.linspace(0, 2*np.pi, 9)]
    walk(ring, jit=0.15, stride=0.6, hop=0.0, age=0.95)
# around the rover, and between the stairs and the seats
for k in range(4):
    a0 = rng.random()*2*np.pi
    ring = [tuple(ROVER + np.array([2.0*np.cos(a0 + t)*0.8 - 0.0, 2.6*np.sin(a0 + t)])) for t in np.linspace(0, 2*np.pi, 10)]
    walk(ring, jit=0.2, stride=0.6, hop=0.0, age=0.95)
for k in range(5):
    out_and_back([tuple(LADDER), (10.2, 3.6), tuple(ROVER + np.array([-1.2, rng.normal(0, 0.4)]))], jit=0.2, stride=0.65, hop=0.0)
# walks out on foot, out and back, in four directions
out_and_back([tuple(LADDER), (14, 2), (26, -4), (40, -9), (58, -14)], age=0.95)              # east
out_and_back([tuple(LADDER), (12, 9), (15, 22), (19, 38), (22, 55)], age=0.95)              # north, toward the Earth
out_and_back([tuple(LADDER), (9.5, 0), (6, -6), (3, -22), (-1, -40), (-6, -62)], age=0.95)   # south, past the mast
out_and_back([tuple(LADDER), (11, 8), (2, 8.5), (-12, 11), (-28, 17), (-46, 24)], age=0.95)  # west, toward Shackleton
H = Hneg + Hpos*(Hneg > -1e-4)
enc = np.clip((H + 0.05)/0.1, 0, 1)
# images are stored with row 0 at the top: flip so v = (y - Y0)/SIZE reads upward
Image.fromarray((np.flipud(enc)*65535).astype(np.uint16)).save(out + "/tracks_height_8k.png")
Image.fromarray((np.flipud(Mk[::2, ::2])*255).astype(np.uint8)).save(out + "/tracks_mask_4k.png")
from scipy.ndimage import gaussian_filter
Far = gaussian_filter(Far, 0.6); Far /= max(Far.max(), 1e-6)
Image.fromarray((np.flipud(Far)*255).astype(np.uint8)).save(out + "/tracks_far_2k.png")
print("height range", H.min(), H.max(), "mask cover", (Mk > 0.1).mean())
