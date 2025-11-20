# ===========================================
# RANDOM FOREST PREDICTIONS FOR SUPPLIES
# ===========================================
import pandas as pd
import json
import numpy as np
from pathlib import Path
from RForest_train import train_rf_model, _data_dir, _load_wealth, _load_health, _load_climate, _disease_risk

# Call the random forest training model
rf, X_test, y_test = train_rf_model()

# Load ALL barangays from the dataset (not just test split)
base = _data_dir()
health_fp = base / 'CCHAIN' / 'health_facility_evacuation_center_proximity_population.csv'
wealth_fp = base / 'CCHAIN' / 'wealth_index.csv'
disease_fp = base / 'CCHAIN' / 'disease_index.csv'
climate_fp = base / 'CLIMAP' / 'laguna_rainfall.csv'

wealth = _load_wealth(wealth_fp)
health = _load_health(health_fp)
climate_val = _load_climate(climate_fp)
disease_val = _disease_risk(disease_fp)

# load IMF constraints (reuse same logic as training — lightweight loader)
def _load_imf_constraints(base_dir):
    imf_dir = base_dir / 'IMF'
    constraints = {'inform_risk': 5.0, 'disasters_per_year': 5.0, 'temp_change': 0.5, 'land_cover_index': 100.0}
    try:
        f15 = imf_dir / '15_Climate-driven_INFORM_Risk.csv'
        if f15.exists():
            df15 = pd.read_csv(f15)
            sel = df15[df15['Indicator'].str.contains('Inform', na=False, case=False)]
            if not sel.empty:
                row = sel.iloc[0]
                nums = [pd.to_numeric(row[c], errors='coerce') for c in row.index if c not in ['Country','ISO2','ISO3','Indicator','Unit','Source','CTS Code','CTS Name','CTS Full Descriptor']]
                nums = [n for n in nums if not np.isnan(n)]
                if nums:
                    constraints['inform_risk'] = float(nums[-1])
    except Exception:
        pass
    try:
        f14 = imf_dir / '14_Climate-related_Disasters_Frequency.csv'
        if f14.exists():
            df14 = pd.read_csv(f14)
            sel = df14[df14['Indicator'].str.contains('TOTAL', na=False, case=False)]
            if not sel.empty:
                row = sel.iloc[0]
                nums = [pd.to_numeric(row[c], errors='coerce') for c in row.index if c not in ['Country','ISO2','ISO3','Indicator','Unit','Source','CTS Code','CTS Name','CTS Full Descriptor']]
                nums = [n for n in nums if not np.isnan(n)]
                if nums:
                    constraints['disasters_per_year'] = float(nums[-1])
    except Exception:
        pass
    try:
        f23 = imf_dir / '23_Annual_Surface_Temperature_Change.csv'
        if f23.exists():
            df23 = pd.read_csv(f23)
            row = df23.iloc[0]
            nums = [pd.to_numeric(row[c], errors='coerce') for c in row.index if c not in ['Country','ISO2','ISO3','Indicator','Unit','Source','CTS Code','CTS Name','CTS Full Descriptor']]
            nums = [n for n in nums if not np.isnan(n)]
            if nums:
                constraints['temp_change'] = float(nums[-1])
    except Exception:
        pass
    try:
        f26 = imf_dir / '26_Land_Cover_Accounts.csv'
        if f26.exists():
            df26 = pd.read_csv(f26)
            sel = df26[df26['Indicator'].str.contains('Climate Altering Land Cover Index', na=False, case=False)]
            if not sel.empty:
                row = sel.iloc[0]
                nums = [pd.to_numeric(row[c], errors='coerce') for c in row.index if c not in ['Country','ISO2','ISO3','Indicator','Unit','Source','CTS Code','CTS Name','CTS Full Descriptor','Climate Influence']]
                nums = [n for n in nums if not np.isnan(n)]
                if nums:
                    constraints['land_cover_index'] = float(nums[-1])
    except Exception:
        pass
    return constraints

imf_constraints = _load_imf_constraints(base)

# Build features for ALL barangays
df = health.copy()
if 'adm4_pcode' not in df.columns:
    df = df.rename(columns={df.columns[0]: 'adm4_pcode'})

# Keep administrative code for output
adm_codes = df[['adm4_pcode']].copy()

# Merge wealth if available
if not wealth.empty:
    df = df.merge(wealth, on='adm4_pcode', how='left')
else:
    df['wealth_mean'] = 0.6
    df['wealth_std'] = 0.1

# Population served
pop_cols = [c for c in df.columns if c.startswith('pop_') and '30min' in c]
pct_cols = [c for c in df.columns if c.startswith('pct_') and '30min' in c]
if pop_cols:
    df['pop_30min'] = df[pop_cols].bfill(axis=1).iloc[:, 0].fillna(1000)
else:
    df['pop_30min'] = 1000
if pct_cols:
    df['access_pct_30min'] = df[pct_cols].bfill(axis=1).iloc[:, 0].fillna(50)
else:
    df['access_pct_30min'] = 50

# Add climate and disease global features
df['climate_rainfall'] = climate_val
df['disease_risk'] = disease_val

# Extract features in the same order as training
X_all = df[['wealth_mean', 'wealth_std', 'pop_30min', 'access_pct_30min', 'climate_rainfall', 'disease_risk']].fillna(0)

# Make predictions for ALL barangays
y_pred = rf.predict(X_all)

# Build predictions dataframe and round to whole numbers
pred_df = pd.DataFrame(y_pred, columns=y_test.columns)
# Post-process predictions with IMF-informed caps/scales
pred_df = pred_df.clip(lower=0)

# simple scaling: if IMF disasters/year high, allow larger caps; if temp change high, slightly up-scale
inform = float(imf_constraints.get('inform_risk', 5.0))
disasters = float(imf_constraints.get('disasters_per_year', 5.0))
tempc = float(imf_constraints.get('temp_change', 0.5))
landcover = float(imf_constraints.get('land_cover_index', 100.0))

scale_factor = 1.0 + min(1.0, (disasters / 10.0)) + max(0.0, tempc) * 0.1
cap_base = 500
dynamic_cap = int(min(2000, cap_base * (1.0 + min(disasters, 50.0) / 50.0)))

# Apply IMF-informed scaling first
pred_df = (pred_df * scale_factor).round(0).astype(int).clip(lower=0)

# Ensure per-item minimums based on population and category heuristics
# Re-create the same grouping logic used in training
category_factor = {
    'medical': 0.5,
    'food': 1.5,
    'shelter': 0.4,
    'water': 1.0
}

def _item_group(name):
    n = name.lower()
    if any(k in n for k in ['para', 'first', 'antibi', 'bandage', 'alcohol', 'therm', 'blood', 'mask', 'glove', 'vitamin']):
        return 'medical'
    if any(k in n for k in ['rice', 'canned', 'noodle', 'biscuit', 'baby', 'oil', 'sugar', 'salt', 'juice', 'meal']):
        return 'food'
    if any(k in n for k in ['blanket', 'mat', 'tent', 'pillow', 'cloth', 'towel', 'slipper', 'hygiene', 'net', 'flash']):
        return 'shelter'
    return 'water'

# For each predicted column, enforce a minimum based on pop_30min and category factor
# Use a more aggressive minimum scaling: per 'scale_unit' people.
scale_unit = 250.0  # change this to tune sensitivity (smaller -> larger minima)

# base minima per category (increase to avoid very small allocations for small populations)
base_minima = {
    'medical': 8,
    'food': 10,
    'shelter': 5,
    'water': 8
}

for col in pred_df.columns:
    # column names in pred_df match training y columns
    grp = _item_group(col)
    factor = category_factor.get(grp, 1.0)
    # per-row computed minimum (scaled by population)
    pop_vals = X_all['pop_30min'].astype(float).fillna(0)
    min_units = np.ceil((pop_vals / scale_unit) * factor).astype(int)
    # enforce category base minima
    base_min = base_minima.get(grp, 5)
    min_units = np.maximum(min_units, base_min)
    # apply per-row minimum
    pred_df[col] = np.maximum(pred_df[col].astype(int), min_units)

# Finally apply a global dynamic cap
pred_df = pred_df.clip(upper=dynamic_cap)
pred_only_df = pd.concat([adm_codes.reset_index(drop=True), X_all.reset_index(drop=True), pred_df.add_prefix('pred_')], axis=1)

# Area details and predictions
print("\n=== Sample Predictions (features | predicted) ===")
with pd.option_context('display.max_rows', 10, 'display.max_columns', None):
    print(pred_only_df.head(10).round(1))

# Save predictions to ToReceive.json
output_data = pred_only_df.to_dict(orient='records')
output_dir = base.parent / 'Data'
output_dir.mkdir(parents=True, exist_ok=True)
output_path = output_dir / 'ToReceive.json'
with open(output_path, 'w') as f:
    json.dump(output_data, f, indent=2)

print(f"\n=== Predictions saved to {output_path} ===")
print(f"Total predictions: {len(output_data)}")

