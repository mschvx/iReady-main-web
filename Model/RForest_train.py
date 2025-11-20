# ===========================================
# RANDOM FOREST TRAINING ALGORITHM
# ===========================================
import os
try:
    import jobplot
except Exception:
    jobplot = None
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
import math

# Loading CSV Functions
def _data_dir():
    return Path(__file__).resolve().parent.parent / 'Datasets'


def _load_wealth(df_path):
    df = pd.read_csv(df_path)
    if 'adm4_pcode' in df.columns and 'rwi_mean' in df.columns:
        try:
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            latest = df.sort_values('date').groupby('adm4_pcode').last().reset_index()
            return latest[['adm4_pcode', 'rwi_mean', 'rwi_std']].rename(columns={'rwi_mean': 'wealth_mean', 'rwi_std': 'wealth_std'})
        except Exception:
            return df[['adm4_pcode', 'rwi_mean', 'rwi_std']].rename(columns={'rwi_mean': 'wealth_mean', 'rwi_std': 'wealth_std'})
    else:
        return pd.DataFrame()


def _load_health(df_path):
    try:
        df = pd.read_csv(df_path, skiprows=[1])
    except Exception:
        df = pd.read_csv(df_path)
    # Keep adm4_pcode and a few useful accessibility columns 
    cols = [c for c in df.columns if 'adm4_pcode' in c or '30min' in c or 'pct_30min' in c or 'pop_reached_30min' in c]
    # fallback to specific column names if the automated list is empty
    expected = ['adm4_pcode', 'brgy_healthcenter_pop_reached_30min', 'brgy_healthcenter_pop_reached_pct_30min',
                'hospital_pop_reached_30min', 'hospital_pop_reached_pct_30min',
                'rhu_pop_reached_30min', 'rhu_pop_reached_pct_30min']
    for e in expected:
        if e in df.columns and e not in cols:
            cols.append(e)
    cols = [c for c in cols if c in df.columns]
    if 'adm4_pcode' not in cols:
        return pd.DataFrame()
    return df[cols].rename(columns={
        'brgy_healthcenter_pop_reached_30min': 'pop_brgy_30min',
        'brgy_healthcenter_pop_reached_pct_30min': 'pct_brgy_30min',
        'hospital_pop_reached_30min': 'pop_hospital_30min',
        'hospital_pop_reached_pct_30min': 'pct_hospital_30min',
        'rhu_pop_reached_30min': 'pop_rhu_30min',
        'rhu_pop_reached_pct_30min': 'pct_rhu_30min'
    })


def _load_climate(df_path):
    df = pd.read_csv(df_path)
    # use median of 'projected seasonal rainfall amount' if present
    for col in df.columns:
        if 'projected seasonal' in col.lower() or 'seasonal rainfall' in col.lower():
            vals = pd.to_numeric(df[col], errors='coerce')
            return float(np.nanmedian(vals))
    numeric = df.select_dtypes(include=[np.number])
    if not numeric.empty:
        return float(numeric.iloc[:, -1].median())
    return 0.0


def _disease_risk(df_path):
    # list proportion of infectious vector-borne/waterborne diseases in list
    df = pd.read_csv(df_path, header=0)
    if 'disease_common_name' in df.columns:
        infectious = df['disease_common_name'].str.upper().fillna('')
        keywords = ['DENGUE', 'LEPTOSPIROSIS', 'CHOLERA', 'RABIES']
        score = infectious.apply(lambda s: any(k in s for k in keywords)).sum()
        return float(score) / max(1, len(infectious))
    return 0.2


def train_rf_model():
    """Load datasets, build features per administrative area, synthesize reasonable per-evacuation-center
    supply targets (kept small — generally <500), train a RandomForestRegressor and return model and test split.

    Returns: rf, X_test, y_test
    """
    base = _data_dir()
    wealth_fp = base / 'CCHAIN' / 'wealth_index.csv'
    health_fp = base / 'CCHAIN' / 'health_facility_evacuation_center_proximity_population.csv'
    disease_fp = base / 'CCHAIN' / 'disease_index.csv'
    climate_fp = base / 'CLIMAP' / 'laguna_rainfall.csv'

    wealth = _load_wealth(wealth_fp)
    health = _load_health(health_fp)
    climate_val = _load_climate(climate_fp)
    disease_val = _disease_risk(disease_fp)

    # Load IMF-derived constraints (used to adjust synthesized targets)
    def _load_imf(base_dir):
        imf_dir = base_dir / 'IMF'
        constraints = {
            'inform_risk': None,
            'disasters_per_year': None,
            'temp_change': None,
            'land_cover_index': None
        }
        try:
            f15 = imf_dir / '15_Climate-driven_INFORM_Risk.csv'
            if f15.exists():
                df15 = pd.read_csv(f15)
                # try to find a row about Inform Risk
                for key in ['Climate-driven INFORM Risk Indicator', 'Climate-driven Hazard & Exposure', 'Climate-driven Inform Risk Indicator']:
                    sel = df15[df15['Indicator'].str.contains(key, na=False, case=False)]
                    if not sel.empty:
                        row = sel.iloc[0]
                        # pick last numeric column
                        vals = [v for v in row.tolist() if isinstance(v, (int, float))]
                        if vals:
                            constraints['inform_risk'] = float(vals[-1])
                            break
        except Exception:
            pass
        try:
            f14 = imf_dir / '14_Climate-related_Disasters_Frequency.csv'
            if f14.exists():
                df14 = pd.read_csv(f14)
                sel = df14[df14['Indicator'].str.contains('TOTAL', na=False, case=False)]
                if not sel.empty:
                    row = sel.iloc[0]
                    # get last numeric
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
                # pick the first indicator row, take last numeric
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

        # set sensible defaults if any missing
        if constraints['inform_risk'] is None:
            constraints['inform_risk'] = 5.0
        if constraints['disasters_per_year'] is None:
            constraints['disasters_per_year'] = 5.0
        if constraints['temp_change'] is None:
            constraints['temp_change'] = 0.5
        if constraints['land_cover_index'] is None:
            constraints['land_cover_index'] = 100.0

        return constraints

    imf_constraints = _load_imf(base)

    # join datasets on adm4_pcode; start from health (contains adm4 list)
    if health.empty:
        raise RuntimeError('Health dataset could not be loaded or has unexpected format.')

    df = health.copy()
    # normalize column names present
    if 'adm4_pcode' not in df.columns:
        df = df.rename(columns={df.columns[0]: 'adm4_pcode'})

    # merge wealth if available
    if not wealth.empty:
        df = df.merge(wealth, on='adm4_pcode', how='left')
    else:
        df['wealth_mean'] = 0.6
        df['wealth_std'] = 0.1

    # population served (choose first available 30 million populations)
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

    # add climate and disease global features
    df['climate_rainfall'] = climate_val
    df['disease_risk'] = disease_val

    features = df[['wealth_mean', 'wealth_std', 'pop_30min', 'access_pct_30min', 'climate_rainfall', 'disease_risk']].fillna(0)

    # Using heuristics and a random seed to synthesize needed data

    np.random.seed(42)

    supplies = [
        # Medical & Health
        'paracetamol', 'first_aid_kits', 'antibiotics', 'bandages_gauze', 'alcohol_disinfectants',
        'thermometers', 'blood_pressure_monitors', 'surgical_masks', 'gloves', 'vitamins_supplements',
        # Food & Nutrition
        'rice', 'canned_goods', 'instant_noodles', 'biscuits_crackers', 'baby_food_milk', 'cooking_oil',
        'sugar', 'salt', 'bottled_juices', 'ready_to_eat_meals',
        # Shelter & Personal Relief
        'blankets', 'mats_sleeping_bags', 'tents_tarpaulins', 'pillows', 'clothing_sets', 'towels',
        'slippers', 'hygiene_kits', 'mosquito_nets', 'flashlights_batteries',
        # Water & Sanitation
        'bottled_water', 'water_containers', 'water_purification_tablets', 'portable_filters', 'buckets_basins',
        'toiletries', 'detergent_cleaning_agents', 'waste_bags', 'portable_toilets', 'disinfectant_sprays'
    ]



    # item category factors — roughly how many units per 100 people
    category_factor = {
        'medical': 0.5,  # items per 100 people (low)
        'food': 1.5,
        'shelter': 0.4,
        'water': 1.0
    }

    item_group = {}
    # assign groups by name heuristics
    for s in supplies:
        name = s.lower()
        if any(k in name for k in ['para', 'first', 'antibi', 'bandage', 'alcohol', 'therm', 'blood', 'mask', 'glove', 'vitamin']):
            item_group[s] = 'medical'
        elif any(k in name for k in ['rice', 'canned', 'noodle', 'biscuit', 'baby', 'oil', 'sugar', 'salt', 'juice', 'meal']):
            item_group[s] = 'food'
        elif any(k in name for k in ['blanket', 'mat', 'tent', 'pillow', 'cloth', 'towel', 'slipper', 'hygiene', 'net', 'flash']):
            item_group[s] = 'shelter'
        else:
            item_group[s] = 'water'

    targets = {}
    for s in supplies:
        grp = item_group[s]
        base_factor = category_factor.get(grp, 1.0)
        # need index: higher when wealth low, access low, disease high
        # derive modifiers from IMF constraints
        inform = float(imf_constraints.get('inform_risk', 5.0))
        disasters = float(imf_constraints.get('disasters_per_year', 5.0))
        tempc = float(imf_constraints.get('temp_change', 0.5))
        lcover = float(imf_constraints.get('land_cover_index', 100.0))

        # base weighted need index
        need_index = (1 - features['wealth_mean'].astype(float).fillna(0)) * 0.6
        need_index += (1 - features['access_pct_30min'].astype(float).fillna(50) / 100.0) * 0.4
        # adjust disease contribution weight based on INFORM risk (scale INFORM ~0-10)
        disease_weight = 0.2 + (min(max(inform, 0.0), 10.0) / 10.0) * 0.4
        need_index += features['disease_risk'].astype(float).fillna(0) * disease_weight
        # overall IMF-driven scale: disasters and temperature increase urgency
        disasters_scale = 1.0 + min(disasters, 50.0) / 100.0  # e.g., 5 disasters -> 1.05
        temp_scale = 1.0 + max(0.0, tempc) * 0.05
        landcover_scale = 1.0 + (lcover - 100.0) / 1000.0
        overall_imf_scale = disasters_scale * temp_scale * landcover_scale

        need_index = (need_index * overall_imf_scale).clip(0.05, 2.0)

        # evac_size proxy — scale down large population numbers so results stay reasonable
        # IMF land cover and disasters slightly influence the scaling divisor (more disasters/loss of cover -> larger needs)
        evac_divisor = max(100.0, 200.0 * (1.0 - (lcover - 100.0) / 1000.0))
        evac_size = (features['pop_30min'].astype(float).fillna(500) / evac_divisor).clip(lower=20, upper=800)

        # noise scaled by INFORM risk (higher risk -> slightly more variance)
        noise_scale = float(max(0.02, min(0.2, 0.08 * (1.0 + (inform - 5.0) / 10.0))))
        noise = np.random.normal(loc=1.0, scale=noise_scale, size=len(features))

        raw = (evac_size * (base_factor) * need_index * noise).round().astype(int)
        # cap at dynamic max (base 500 influenced by disasters)
        max_cap = int(min(2000, max(200, 500 * (1.0 + min(disasters, 50.0) / 50.0))))
        raw = raw.clip(lower=0, upper=max_cap)
        targets[s] = raw

    y = pd.DataFrame(targets)

    # Train-test split
    X_train, X_test, y_train, y_test = train_test_split(features, y, test_size=0.25, random_state=42)

    rf = RandomForestRegressor(n_estimators=200, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)

    return rf, X_test, y_test

