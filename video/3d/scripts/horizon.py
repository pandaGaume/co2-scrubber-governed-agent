import numpy as np, sys
from scipy.ndimage import map_coordinates
L = "../lola/"
hi = np.load(L+"shackleton_40km_20m.npy"); lo = np.load(L+"shackleton_200km_100m.npy")
cx, cy = 7690.24, -6402.72; R = 1737400.0
def h(x, y):
    # map coords (m, stereo) -> height; hi-res inside 40 km window
    ci = (cy+20000 - y)/20 - 0.5; cj = (x-(cx-20000))/20 - 0.5
    li = (cy+100000 - y)/100 - 0.5; lj = (x-(cx-100000))/100 - 0.5
    out = map_coordinates(lo, [li, lj], order=1, mode='nearest')
    m = (ci>1)&(ci<1997)&(cj>1)&(cj<1997)
    out[m] = map_coordinates(hi, [ci[m], cj[m]], order=1)
    return out
def horizon(x0, y0, az_deg, eye=2.0):
    d = np.concatenate([np.arange(20, 2000, 20), np.arange(2000, 95000, 100)])
    res = []
    for a in np.atleast_1d(az_deg):
        t = np.radians(a)  # azimuth from map +y (lon 0, toward Earth), clockwise toward +x
        xs = x0 + d*np.sin(t); ys = y0 + d*np.cos(t)
        z = h(xs, ys) - d**2/(2*R)
        z0 = h(np.array([x0]), np.array([y0]))[0] + eye
        res.append(np.degrees(np.max(np.arctan2(z - z0, d))))
    return np.array(res)
# candidate sites in the 40 km window: grid every 1 km
best = []
for i in range(100, 1900, 50):
    for j in range(100, 1900, 50):
        x = cx-20000 + (j+.5)*20; y = cy+20000 - (i+.5)*20
        az = np.arange(-15, 16, 5)          # Earth direction +-15 deg (libration in longitude)
        he = horizon(x, y, az).max()
        best.append((he, i, j, x, y, hi[i, j]))
best.sort()
print("sites with lowest horizon toward Earth (deg, row, col, elev):")
for b in best[:25]: print(round(b[0],2), b[1], b[2], round(b[5]))
