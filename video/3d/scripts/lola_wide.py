import sys, json, numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
out = sys.argv[1]
url = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"
cx, cy = 7690.24, -6402.72
half = 100000
with rasterio.open(url) as ds:
    print("overviews", ds.overviews(1))
    w = from_bounds(cx-half, cy-half, cx+half, cy+half, ds.transform)
    a = ds.read(1, window=w, out_shape=(2000, 2000), resampling=Resampling.average).astype(np.float32)
print(a.shape, np.nanmin(a), np.nanmax(a), np.isnan(a).sum())
np.save(out + "/shackleton_200km_100m.npy", a)
json.dump({"bounds": [cx-half, cy-half, cx+half, cy+half], "px": 100.0}, open(out + "/shackleton_200km_100m.json", "w"))
