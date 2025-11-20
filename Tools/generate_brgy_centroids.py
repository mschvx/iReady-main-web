import csv
import json
import re
from math import fabs

INPUT = r"Datasets/Datasets/CCHAIN/brgy_geography.csv"
OUTPUT = r"Landing/client/public/data/brgy_centroids.json"

wkt_re = re.compile(r'POLYGON\s*\(\((.*)\)\)', re.IGNORECASE)

def polygon_centroid_area_weighted(coords):
    # coords: list of (lat, lon)
    # Using shoelace formula; expect coords in order and closed (first != last)
    if len(coords) < 3:
        return None
    # convert to x=lon, y=lat for math
    x = [c[1] for c in coords]
    y = [c[0] for c in coords]
    A = 0.0
    Cx = 0.0
    Cy = 0.0
    n = len(coords)
    for i in range(n):
        j = (i + 1) % n
        cross = x[i] * y[j] - x[j] * y[i]
        A += cross
        Cx += (x[i] + x[j]) * cross
        Cy += (y[i] + y[j]) * cross
    A *= 0.5
    if fabs(A) < 1e-12:
        return None
    Cx /= (6.0 * A)
    Cy /= (6.0 * A)
    # return lat, lon
    return (Cy, Cx)


def parse_wkt_polygon(s):
    m = wkt_re.search(s)
    if not m:
        return None
    inner = m.group(1)
    parts = [p.strip() for p in inner.split(',') if p.strip()]
    coords = []
    for p in parts:
        bits = p.split()
        if len(bits) >= 2:
            try:
                lon = float(bits[0])
                lat = float(bits[1])
                coords.append((lat, lon))
            except:
                continue
    return coords


def main():
    results = []
    with open(INPUT, 'r', encoding='utf-8', errors='ignore') as fh:
        reader = csv.reader(fh)
        for row in reader:
            if not row: continue
            # first field is id, last field contains POLYGON WKT (may have commas but csv handles quotes)
            id_ = row[0].strip()
            # find the column that contains 'POLYGON'
            poly_str = None
            for col in row[1:]:
                if 'POLYGON' in col.upper():
                    poly_str = col
                    break
            if not poly_str:
                # maybe polygon is in the last column
                poly_str = row[-1]
            coords = parse_wkt_polygon(poly_str)
            if not coords:
                continue
            cen = polygon_centroid_area_weighted(coords)
            if cen:
                lat, lon = cen
            else:
                # fallback: arithmetic mean
                lat = sum(c[0] for c in coords) / len(coords)
                lon = sum(c[1] for c in coords) / len(coords)
            results.append({"id": id_, "lat": lat, "lon": lon})
    # write output
    with open(OUTPUT, 'w', encoding='utf-8') as out:
        json.dump(results, out)
    print(f"Wrote {len(results)} centroids to {OUTPUT}")

if __name__ == '__main__':
    main()
