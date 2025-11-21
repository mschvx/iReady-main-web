import json
import csv
import os

META = os.path.join('Model', 'risk_model_meta.json')
PRED = os.path.join('Model', 'risk_predictions.csv')
TARGET = 'PH137603006'

with open(META, 'r', encoding='utf-8') as fh:
    meta = json.load(fh)

features = meta.get('features', [])
weights = meta.get('proxy_weights', [1.0]*len(features))
scaled_list = meta.get('proxy_scaled_feature_values', [])
raw_min = meta.get('proxy_raw_min')
raw_max = meta.get('proxy_raw_max')

scaled_map = {r['adm4_pcode']: r for r in scaled_list}

rec = scaled_map.get(TARGET)
if rec is None:
    print('No scaled record for', TARGET)
    raise SystemExit(1)

print('Proxy breakdown for', TARGET)
raw_sum = 0.0
for i, f in enumerate(features):
    sval = rec.get(f)
    w = float(weights[i]) if i < len(weights) else 1.0
    if sval is None:
        contrib = 0.0
        sval_display = 'null'
    else:
        contrib = float(sval) * w
        sval_display = f"{float(sval):.6f}"
    raw_sum += contrib
    print(f" - {f}: scaled={sval_display} weight={w} contrib={contrib:.6f}")

print('raw_sum:', raw_sum)
print('raw_min:', raw_min, 'raw_max:', raw_max)
if raw_min is None or raw_max is None:
    print('No raw_min/raw_max in metadata')
else:
    if abs(raw_max - raw_min) < 1e-12:
        norm = 0.0
    else:
        norm = (raw_sum - raw_min) / (raw_max - raw_min)
    print('normalized:', norm)
