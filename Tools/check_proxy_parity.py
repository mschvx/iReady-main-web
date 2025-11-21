import json
import csv
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META_PATHS = [ROOT / 'Landing' / 'client' / 'public' / 'data' / 'risk_model_meta.json', ROOT / 'Model' / 'risk_model_meta.json']
PRED_PATHS = [ROOT / 'Landing' / 'client' / 'public' / 'data' / 'risk_predictions.csv', ROOT / 'Model' / 'risk_predictions.csv']

meta_path = next((p for p in META_PATHS if p.exists()), None)
pred_path = next((p for p in PRED_PATHS if p.exists()), None)
if not meta_path or not pred_path:
    print('Missing files:')
    print(' meta_path ->', meta_path)
    print(' pred_path ->', pred_path)
    raise SystemExit(1)

meta = json.loads(meta_path.read_text())

features = meta.get('features', [])
weights = meta.get('proxy_weights', [])
scaled_values = {row['adm4_pcode']: row for row in meta.get('proxy_scaled_feature_values', [])}
raw_values = {row['adm4_pcode']: row for row in meta.get('proxy_feature_values', [])}
mins = meta.get('proxy_scaler_data_min', [])
maxs = meta.get('proxy_scaler_data_max', [])
raw_min = float(meta.get('proxy_raw_min', 0))
raw_max = float(meta.get('proxy_raw_max', raw_min + 1))
edges = meta.get('proxy_quartile_edges', [0.25,0.5,0.75])

# read predictions
preds = {}
with open(pred_path, newline='', encoding='utf-8') as f:
    reader = csv.reader(f)
    hdr = next(reader)
    for row in reader:
        if not row: continue
        code = row[0].strip().strip('"')
        try:
            proxy = float(row[1])
        except:
            proxy = float('nan')
        preds[code] = proxy

mismatches = []

for code, reported_proxy in preds.items():
    # get scaled vector if available
    if code in scaled_values:
        row = scaled_values[code]
        scaled = [float(row.get(f, 0.0)) for f in features]
    else:
        # fallback: compute scaled from raw_values using mins/maxs
        rv = raw_values.get(code, {})
        scaled = []
        for i, f in enumerate(features):
            rawv = float(rv.get(f, 0.0))
            mn = float(mins[i]) if i < len(mins) else 0.0
            mx = float(maxs[i]) if i < len(maxs) else mn + 1.0
            s = (rawv - mn) / max(1e-9, (mx - mn))
            s = max(0.0, min(1.0, s))
            scaled.append(s)
    # compute raw weighted sum
    raw = 0.0
    for w, s in zip(weights, scaled):
        raw += float(w) * float(s)
    # normalize
    norm = (raw - raw_min) / max(1e-9, (raw_max - raw_min))
    norm = max(0.0, min(1.0, norm))
    # compare
    if math.isnan(reported_proxy):
        mismatches.append((code, 'reported_missing', reported_proxy, raw, norm))
    else:
        if abs(reported_proxy - norm) > 1e-8:
            mismatches.append((code, 'mismatch', reported_proxy, raw, norm))

# print summary (include PH137603008 details if present)
print('Total predictions checked:', len(preds))
print('Mismatches found:', len(mismatches))
if mismatches:
    print('\nSample mismatches:')
    for m in mismatches[:20]:
        code, kind, reported, raw, norm = m
        print(f"{code}: reported={reported:.12f}  recomputed_norm={norm:.12f}  raw_sum={raw:.6f}  kind={kind}")

# show detailed calc for PH137603008 if available
focus = 'PH137603008'
if focus in preds:
    print('\nDetail for', focus)
    rep = preds[focus]
    sv = scaled_values.get(focus)
    rv = raw_values.get(focus)
    print(' reported proxy in CSV:', rep)
    print(' raw feature values:', rv)
    print(' scaled feature values (meta):', sv)
    # compute contributions
    if sv:
        scaled_list = [float(sv.get(f, 0.0)) for f in features]
    else:
        scaled_list = []
        for i,f in enumerate(features):
            rawv = float((rv or {}).get(f, 0.0))
            mn = float(mins[i]) if i < len(mins) else 0.0
            mx = float(maxs[i]) if i < len(maxs) else mn + 1.0
            s = (rawv - mn) / max(1e-9, (mx - mn))
            s = max(0.0, min(1.0, s))
            scaled_list.append(s)
    contribs = [float(w)*float(s) for w,s in zip(weights, scaled_list)]
    for f,s,c,w in zip(features, scaled_list, contribs, weights):
        print(f" {f}: scaled={s:.6f} weight={w} contrib={c:.6f}")
    raw_sum = sum(contribs)
    norm_calc = (raw_sum - raw_min) / max(1e-9, (raw_max - raw_min))
    print(' raw_sum:', raw_sum)
    print(' raw_min:', raw_min, ' raw_max:', raw_max)
    print(' normalized:', norm_calc)

if mismatches:
    raise SystemExit(2)
else:
    print('All proxies match exactly.')
