import sys, math, json, numpy as np, rasterio
from rasterio.windows import from_bounds
out = sys.argv[1]
url = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
R = 1737400.0
lat, lon = -89.67, 129.78   # Shackleton centre (approx.)
rho = 2*R*math.tan(math.radians(45 - abs(lat)/2))
x, y = rho*math.sin(math.radians(lon)), rho*math.cos(math.radians(lon))
half = 20000
with rasterio.open(url) as ds:
    print(ds.crs.to_proj4() if ds.crs else None)
    print(ds.transform, ds.width, ds.height, ds.dtypes, ds.nodata, ds.compression)
    print("shackleton xy", x, y)
    w = from_bounds(x-half, y-half, x+half, y+half, ds.transform)
    a = ds.read(1, window=w).astype(np.float32)
    t = ds.window_transform(w)
print(a.shape, float(np.nanmin(a)), float(np.nanmax(a)))
i, j = np.unravel_index(np.nanargmin(a), a.shape)
print("min at px", i, j, "xy", t*(j, i))
np.save(out + "/shackleton_40km_20m.npy", a)
json.dump({"transform": list(t)[:6], "centre_xy": [x, y], "source": url, "units": "m"}, open(out + "/shackleton_40km_20m.json", "w"))
