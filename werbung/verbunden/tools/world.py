# /// script
# dependencies = ["global-land-mask", "numpy"]
# ///
"""Land dots for the globe: a Fibonacci sphere, kept where global-land-mask says land.
Writes assets/world.json as [[lat, lon], ...] rounded to 0.1 deg."""
import json, pathlib
import numpy as np
from global_land_mask import globe
N = 16000
i = np.arange(N) + 0.5
lat = np.degrees(np.arcsin(1 - 2 * i / N))
lon = (np.degrees(np.pi * (1 + 5 ** 0.5) * i) % 360) - 180
keep = globe.is_land(lat, lon) & (lat > -60)
pts = [[round(float(a), 1), round(float(b), 1)] for a, b in zip(lat[keep], lon[keep])]
out = pathlib.Path(__file__).resolve().parent.parent / "assets" / "world.json"
out.write_text(json.dumps(pts, separators=(",", ":")))
print(len(pts), "land dots ->", out)
