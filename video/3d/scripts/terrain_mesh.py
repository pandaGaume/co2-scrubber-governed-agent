# Polar terrain mesh centred on the habitat site, from LOLA (Barker et al. 2023), Moon curvature applied.
import numpy as np, json
from scipy.ndimage import map_coordinates
L = "../lola/"
hi = np.load(L+"shackleton_40km_20m.npy"); lo = np.load(L+"shackleton_200km_100m.npy")
cx, cy = 7690.24, -6402.72; R = 1737400.0
SX, SY = 25100.0, -7613.0            # site: row 1060, col 1870 of the 20 m window (slope 1.4 deg)
def h(x, y):
    ci = (cy+20000 - y)/20 - 0.5; cj = (x-(cx-20000))/20 - 0.5
    li = (cy+100000 - y)/100 - 0.5; lj = (x-(cx-100000))/100 - 0.5
    out = map_coordinates(lo, [li, lj], order=3, mode='nearest')
    m = (ci>2)&(ci<1996)&(cj>2)&(cj<1996)
    hv = map_coordinates(hi, [ci[m], cj[m]], order=3)
    # blend over the last 1 km of the hi-res window
    edge = np.minimum.reduce([ci[m], 1997-ci[m], cj[m], 1997-cj[m]])
    w = np.clip((edge-2)/50, 0, 1)
    out[m] = w*hv + (1-w)*out[m]
    return out
# rings: 0.5 m spacing to 60 m, then proportional (0.45 %), out to 80 km
r = [0.0]; 
while r[-1] < 80000:
    r.append(r[-1] + max(0.5, 0.0045*r[-1]))
r = np.array(r[1:]); N = 1536
t = np.arange(N)*2*np.pi/N
RR, TT = np.meshgrid(r, t, indexing='ij')
X = RR*np.sin(TT); Y = RR*np.cos(TT)
Z = h(X.ravel()+SX, Y.ravel()+SY).reshape(X.shape)
z0 = h(np.array([SX]), np.array([SY]))[0]
Z = Z - z0 - RR**2/(2*R)
# local detail: fBm + small craters, faded out by 2 km
rng = np.random.default_rng(9)
def vnoise(x, y, wl, seed):
    g = np.random.default_rng(seed).standard_normal((257, 257)).astype(np.float32)
    u = (x/wl) % 256; v = (y/wl) % 256
    return map_coordinates(g, [u, v], order=3, mode='wrap')
fade = np.clip(1 - (RR-1200)/800, 0, 1)
det = np.zeros_like(Z)
for k, wl in enumerate([60, 25, 10, 4, 1.6]):
    det += 0.012*wl*vnoise(X, Y, wl, k)
Z += det*fade
cr = rng.uniform(-1800, 1800, (900, 2)); rad = 1.5*np.exp(rng.uniform(0, np.log(25), 900))
for (px, py), rc in zip(cr, rad):
    if np.hypot(px, py) < 60 + rc: continue     # the work area was cleared
    d = np.hypot(X-px, Y-py)/rc
    m = d < 1.6
    if not m.any(): continue
    prof = np.where(d < 1, (d**2 - 1)*0.18*rc, 0.05*rc*np.exp(-((d-1)/0.25)**2))
    Z[m] += (prof[m])*fade[m]
# a levelled work area (bulldozed regolith): flat to 30 m, smooth blend to 90 m
u = np.clip((RR-30)/60, 0, 1); pad = 1 - u*u*(3-2*u)
Z = Z*(1-pad) + pad*0.03*vnoise(X, Y, 1.2, 99)
V = np.stack([X, Y, Z], -1).reshape(-1, 3).astype(np.float32)
nr = len(r)
idx = np.arange(nr*N).reshape(nr, N)
a = idx[:-1, :]; b = idx[:-1, np.r_[1:N, 0]]; c = idx[1:, np.r_[1:N, 0]]; d = idx[1:, :]
Q = np.stack([a, d, c, b], -1).reshape(-1, 4).astype(np.int32)
V = np.vstack([V, [[0, 0, float(Z[0].mean())]]]).astype(np.float32)
centre = len(V)-1
T = np.stack([np.full(N, centre), idx[0, np.r_[1:N, 0]], idx[0, :]], -1).astype(np.int32)
UV = np.stack([X.ravel()/400.0, Y.ravel()/400.0], -1).astype(np.float32)
np.savez(L+"terrain_polar.npz", V=V, Q=Q, T=T, UV=UV, rings=r)
print("rings", nr, "verts", len(V), "quads", len(Q), "z range", Z.min(), Z.max(), "site elev", z0)
