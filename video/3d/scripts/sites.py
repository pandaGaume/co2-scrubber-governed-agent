exec(open("horizon.py").read().split("# candidate")[0])
rows = []
azs = np.arange(0, 360, 10)
for i in range(100, 1900, 50):
    for j in range(100, 1900, 50):
        x = cx-20000 + (j+.5)*20; y = cy+20000 - (i+.5)*20
        r = np.hypot(x-cx, y-cy)
        if r < 11500 or r > 17000: continue   # outside the crater, within ~6 km of the rim
        he = horizon(x, y, np.arange(-10, 11, 5)).max()
        if he > 3.0: continue
        hz = horizon(x, y, azs)
        rows.append((round((hz > 1.5).mean(), 2), round(he, 2), i, j, round(float(hi[i, j]))))
rows.sort(reverse=True)
for r in rows[:20]: print(r)
