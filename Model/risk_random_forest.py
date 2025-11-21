import os
import json
import math
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

try:
    import geopandas as gpd
    from shapely.geometry import Point
except Exception:
    gpd = None


BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'Datasets', 'Datasets')
OUTPUT_DIR = os.path.join(BASE_DIR, 'Model')
os.makedirs(OUTPUT_DIR, exist_ok=True)


def safe_read_csv(path, **kwargs):
    if not os.path.exists(path):
        print(f"Warning: {path} not found")
        return None
    return pd.read_csv(path, **kwargs)


def aggregate_wealth(df):
    # wealth_index may contain multiple rows per adm4_pcode; use mean rwi_mean
    if df is None or df.empty:
        return pd.DataFrame()
    df = df[['adm4_pcode', 'rwi_mean']].dropna()
    return df.groupby('adm4_pcode', as_index=False).mean()


def compute_min_distance_km(brgy_gdf, tracks_gdf):
    # returns series with min distance in kilometers from each brgy point to any track
    if gpd is None or brgy_gdf is None or tracks_gdf is None:
        return None

    # ensure crs set
    brgy = brgy_gdf.copy()
    tracks = tracks_gdf.copy()
    if brgy.crs is None:
        brgy.set_crs(epsg=4326, inplace=True)
    if tracks.crs is None:
        tracks.set_crs(epsg=4326, inplace=True)

    # project to metric CRS for distance (Web Mercator)
    brgy = brgy.to_crs(epsg=3857)
    tracks = tracks.to_crs(epsg=3857)

    dists = []
    for pt in brgy.geometry:
        min_d = min(pt.distance(geom) for geom in tracks.geometry)
        # meters -> km
        dists.append(min_d / 1000.0)
    return pd.Series(dists, index=brgy.index)

def haversine_km(lat1, lon1, lat2, lon2):
    # returns distance in kilometers between two lat/lon points
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return R * 2 * math.asin(math.sqrt(a))

def compute_min_distance_km_fallback(brgy_df, track_geojson_path):
    """
    Compute min haversine distance (km) from each brgy point to any coordinate in tracks geojson.
    This is a simple but robust fallback that uses track vertices (not exact line-to-point distance).
    """
    if brgy_df is None or not os.path.exists(track_geojson_path):
        return None

    # detect lat/lon columns
    lat_col = None
    lon_col = None
    for c in brgy_df.columns:
        cl = c.lower()
        if 'lat' in cl and lat_col is None:
            lat_col = c
        if ('lon' in cl or 'lng' in cl) and lon_col is None:
            lon_col = c

    if lat_col is None or lon_col is None:
        return None

    # load track coordinates from geojson
    try:
        with open(track_geojson_path, 'r', encoding='utf-8') as fh:
            gj = json.load(fh)
        track_points = []
        for feat in gj.get('features', []):
            geom = feat.get('geometry', {})
            coords = geom.get('coordinates', [])
            if geom.get('type') == 'LineString':
                for lon, lat in coords:
                    track_points.append((lat, lon))
            elif geom.get('type') == 'MultiLineString':
                for line in coords:
                    for lon, lat in line:
                        track_points.append((lat, lon))
    except Exception:
        return None

    if not track_points:
        return None

    dists = []
    for _, row in brgy_df.iterrows():
        try:
            lat = float(row[lat_col])
            lon = float(row[lon_col])
        except Exception:
            dists.append(np.nan)
            continue
        md = min(haversine_km(lat, lon, tlat, tlon) for (tlat, tlon) in track_points)
        dists.append(md)
    return pd.Series(dists, index=brgy_df.index)


def try_extract_centroid_from_wkt(brgy_df):
    """
    Try to extract a centroid (lat, lon) from a WKT POLYGON/MULTIPOLYGON column.
    If successful, returns a copy of brgy_df with added 'lat' and 'lon' columns.
    Otherwise returns the original dataframe.
    """
    if brgy_df is None or brgy_df.empty:
        return brgy_df

    # find a column that contains 'POLYGON' or 'MULTIPOLYGON' text in at least one row
    poly_col = None
    for c in brgy_df.columns:
        sample = brgy_df[c].astype(str).str.upper().fillna('')
        if sample.str.contains('POLYGON').any():
            poly_col = c
            break

    if poly_col is None:
        return brgy_df

    # parse simple WKT POLYGON((lon lat, lon lat, ...))
    lats = []
    lons = []
    lat_list = []
    lon_list = []
    out = brgy_df.copy()
    lat_vals = []
    lon_vals = []
    for val in out[poly_col].astype(str).fillna(''):
        coords = []
        try:
            # extract everything between the first '((' and '))'
            m = val.upper().split('((')
            if len(m) < 2:
                lat_vals.append(np.nan); lon_vals.append(np.nan); continue
            body = m[1].split('))')[0]
            parts = [p.strip() for p in body.split(',') if p.strip()]
            pts = []
            for p in parts:
                pieces = p.split()
                if len(pieces) >= 2:
                    # WKT is lon lat
                    lon = float(pieces[0])
                    lat = float(pieces[1])
                    pts.append((lat, lon))
            if not pts:
                lat_vals.append(np.nan); lon_vals.append(np.nan); continue
            avg_lat = float(sum(p[0] for p in pts) / len(pts))
            avg_lon = float(sum(p[1] for p in pts) / len(pts))
            lat_vals.append(avg_lat)
            lon_vals.append(avg_lon)
        except Exception:
            lat_vals.append(np.nan); lon_vals.append(np.nan)

    out['lat'] = lat_vals
    out['lon'] = lon_vals
    return out


def build_feature_table():
    # Load files
    hf = safe_read_csv(os.path.join(DATA_DIR, 'CCHAIN', 'health_facilities.csv'))
    wi = safe_read_csv(os.path.join(DATA_DIR, 'CCHAIN', 'wealth_index.csv'))
    brgy = safe_read_csv(os.path.join(DATA_DIR, 'CCHAIN', 'brgy_geography.csv'))

    imf14 = safe_read_csv(os.path.join(DATA_DIR, 'IMF', '14_storm_frequency.csv'))
    imf15 = safe_read_csv(os.path.join(DATA_DIR, 'IMF', '15_inform_risk.csv'))
    imf16 = safe_read_csv(os.path.join(DATA_DIR, 'IMF', '16_food_health_water.csv'))
    imf26 = safe_read_csv(os.path.join(DATA_DIR, 'IMF', '26_land_data.csv'))

    track_geojson = os.path.join(DATA_DIR, 'PH_CYCLONE_TRACKS', 'ph-all-tc-tracks-2024.geojson')

    # Prepare base table keyed by adm4_pcode
    if hf is None:
        raise FileNotFoundError('health_facilities.csv required')

    # Coerce known numeric columns to numeric (some CSVs include a descriptive second row)
    for col in ['brgy_healthcenter_pop_reached_30min', 'hospital_pop_reached_30min', 'rhu_pop_reached_pct_30min']:
        if col in hf.columns:
            hf[col] = pd.to_numeric(hf[col], errors='coerce')

    base = hf[['adm4_pcode']].copy()

    # Health features
    base = base.merge(hf[['adm4_pcode', 'brgy_healthcenter_pop_reached_30min',
                          'hospital_pop_reached_30min', 'rhu_pop_reached_pct_30min']],
                      on='adm4_pcode', how='left')

    # Wealth aggregated
    # ensure rwi_mean is numeric
    if wi is not None and 'rwi_mean' in wi.columns:
        wi['rwi_mean'] = pd.to_numeric(wi['rwi_mean'], errors='coerce')
    wagg = aggregate_wealth(wi)
    if not wagg.empty:
        base = base.merge(wagg, on='adm4_pcode', how='left')

    # Country-level IMF features: expand to all rows
    if imf14 is not None:
        # choose rows using the descriptors if present
        # try to get numeric values for 2024 where available
        try:
            storm_row = imf14[imf14['Indicator'].str.contains('Number of Disasters', na=False)].iloc[0]
            storms_2024 = float(storm_row.get('2024', np.nan))
        except Exception:
            storms_2024 = np.nan
        try:
            people_row = imf14[imf14['Indicator'].str.contains('Number of People Affected', na=False)].iloc[0]
            people_2024 = float(people_row.get('2024', np.nan))
        except Exception:
            people_2024 = np.nan
    else:
        storms_2024 = np.nan
        people_2024 = np.nan

    base['storms_2024'] = storms_2024
    base['people_affected_2024'] = people_2024

    # IMF15 indicators (country-level)
    if imf15 is not None:
        def find_indicator(name):
            try:
                return float(imf15[imf15['Indicator'].str.contains(name, na=False)].iloc[0]['2022'])
            except Exception:
                return np.nan

        base['inform_risk_index'] = find_indicator('Climate-driven INFORM Risk Indicator')
        base['lack_of_coping'] = find_indicator('Lack of coping capacity')
        base['inform_vulnerability'] = find_indicator('Vulnerability')

    # IMF16
    if imf16 is not None:
        def find_imf16(name):
            try:
                return float(imf16[imf16['Indicator'].str.contains(name, na=False)].iloc[0]['2022'])
            except Exception:
                return np.nan

        base['vuln_food'] = find_imf16('Vulnerability score, Food')
        base['vuln_health'] = find_imf16('Vulnerability score, Heath|Health')
        base['vuln_water'] = find_imf16('Vulnerability score, Water')

    # IMF26 land data (country-level)
    if imf26 is not None and 'Indicator' in imf26.columns:
        for idx, row in imf26.iterrows():
            col = row['Indicator'].lower().replace(' ', '_')
            base[col] = row.get('2022', np.nan)

    # Distance to cyclone tracks if possible: try geopandas first, then haversine fallback
    dist_km = None
    if os.path.exists(track_geojson) and brgy is not None:
        # Try geopandas approach when available
        if gpd is not None:
            try:
                brgy_df = brgy.copy()
                # Try to detect lat/lon columns
                lat_col = None
                lon_col = None
                for c in brgy_df.columns:
                    if 'lat' in c.lower():
                        lat_col = c
                    if 'lon' in c.lower() or 'lng' in c.lower():
                        lon_col = c

                if lat_col and lon_col:
                    gdf_brgy = gpd.GeoDataFrame(brgy_df,
                                                geometry=gpd.points_from_xy(brgy_df[lon_col], brgy_df[lat_col]),
                                                crs='EPSG:4326')
                    tracks = gpd.read_file(track_geojson)
                    dist_km = compute_min_distance_km(gdf_brgy, tracks)
                    # align by adm4_pcode
                    if dist_km is not None:
                        gdf_brgy['dist_km_to_track'] = dist_km.values
                        base = base.merge(gdf_brgy[['adm4_pcode', 'dist_km_to_track']], on='adm4_pcode', how='left')
            except Exception as e:
                print('Geopandas distance computation failed, will try haversine fallback:', e)

        # If geopandas not available or failed, use haversine fallback
        if dist_km is None:
            try:
                # If brgy doesn't have explicit lat/lon columns, try to extract
                # centroids from WKT POLYGON/MULTIPOLYGON text before fallback.
                brgy_for_fallback = brgy
                # try to add lat/lon if missing
                has_lat = any('lat' in c.lower() for c in brgy_for_fallback.columns)
                has_lon = any('lon' in c.lower() or 'lng' in c.lower() for c in brgy_for_fallback.columns)
                if not (has_lat and has_lon):
                    try:
                        brgy_for_fallback = try_extract_centroid_from_wkt(brgy_for_fallback)
                        has_lat = any('lat' in c.lower() for c in brgy_for_fallback.columns)
                        has_lon = any('lon' in c.lower() or 'lng' in c.lower() for c in brgy_for_fallback.columns)
                    except Exception:
                        pass

                fallback = compute_min_distance_km_fallback(brgy_for_fallback, track_geojson)
                if fallback is not None:
                    brgy_copy = brgy.copy()
                    brgy_copy['dist_km_to_track'] = fallback.values
                    base = base.merge(brgy_copy[['adm4_pcode', 'dist_km_to_track']], on='adm4_pcode', how='left')
            except Exception as e:
                print('Haversine fallback for distances failed:', e)

    return base


def compute_proxy_risk(df):
    # Use a weighted combination of features as a proxy label (higher -> more risk)
    # Features considered: low wealth, low health access, inform_vulnerability, lack_of_coping,
    # vulnerability food/health/water, proximity to track (closer -> higher risk), storms

    df2 = df.copy()
    # Select features and fillna
    features = []
    # inverse wealth: lower rwi_mean -> higher risk
    if 'rwi_mean' in df2.columns:
        df2['inv_wealth'] = 1 - df2['rwi_mean'].fillna(df2['rwi_mean'].mean())
        features.append('inv_wealth')

    # healthcare access: use brgy_healthcenter_pop_reached_30min normalized (lower -> higher risk)
    if 'brgy_healthcenter_pop_reached_30min' in df2.columns:
        df2['low_health_access'] = 1 - (df2['brgy_healthcenter_pop_reached_30min'].fillna(0) /
                                        (df2['brgy_healthcenter_pop_reached_30min'].max() + 1))
        features.append('low_health_access')

    for col in ['inform_vulnerability', 'lack_of_coping', 'inform_risk_index', 'vuln_food', 'vuln_health', 'vuln_water']:
        if col in df2.columns:
            df2[col] = df2[col].fillna(df2[col].mean())
            features.append(col)

    if 'dist_km_to_track' in df2.columns:
        # closer distance => higher risk; convert to inverse with cap
        df2['inv_dist'] = 1 / (1 + df2['dist_km_to_track'].fillna(df2['dist_km_to_track'].mean()))
        features.append('inv_dist')

    if 'storms_2024' in df2.columns:
        df2['storms_2024'] = df2['storms_2024'].fillna(df2['storms_2024'].mean())
        features.append('storms_2024')

    # Ensure we have features
    if not features:
        raise RuntimeError('No features available to compute proxy risk')

    # Build matrix of raw feature values (these are the derived features like inv_wealth, inv_dist)
    X_raw = df2[features].fillna(0).values.astype(float)

    # Detect constant features (zero variance) and drop them before fitting scaler.
    # Constant features provide no discriminative power at the barangay level
    # and lead to degenerate MinMax scaling (min == max). Removing them makes
    # the proxy and downstream model focus on varying inputs.
    const_idx = [i for i in range(X_raw.shape[1]) if np.nanmax(X_raw[:, i]) - np.nanmin(X_raw[:, i]) < 1e-12]
    dropped_features = [features[i] for i in const_idx] if const_idx else []
    if dropped_features:
        print('Dropping constant proxy features:', dropped_features)

    keep_idx = [i for i in range(X_raw.shape[1]) if i not in const_idx]
    if not keep_idx:
        raise RuntimeError('All proxy features are constant; cannot compute proxy')

    # Keep only non-constant columns
    features_kept = [features[i] for i in keep_idx]
    X = X_raw[:, keep_idx]

    # Fit a MinMaxScaler to the proxy features so we can save min/max for frontend
    proxy_scaler = MinMaxScaler()
    Xs = proxy_scaler.fit_transform(X)

    # Weighted sum; weights chosen to reflect relative influence (tweakable)
    weights = np.ones(Xs.shape[1], dtype=float)
    # Put slightly higher weight on vulnerability and distance
    for i, name in enumerate(features_kept):
        if 'vuln' in name or 'inform' in name or 'inv_dist' in name:
            weights[i] = 1.5
        if 'inv_wealth' in name:
            weights[i] = 1.2

    # compute continuous proxy as weighted sum of scaled features
    raw_score = Xs.dot(weights)

    # normalize score to 0..1 range (robust to constant arrays)
    if np.nanmax(raw_score) - np.nanmin(raw_score) < 1e-12:
        score = np.zeros_like(raw_score)
    else:
        score = (raw_score - np.nanmin(raw_score)) / (np.nanmax(raw_score) - np.nanmin(raw_score))

    # compute quartile edges used for labeling (so we can reproduce mapping later)
    try:
        edges = list(np.quantile(score, [0.25, 0.5, 0.75]))
    except Exception:
        edges = [0.25, 0.5, 0.75]

    # Use digitize for deterministic bin assignment (0..3). This avoids pd.qcut tie-related surprises.
    bins = np.digitize(score, bins=[edges[0], edges[1], edges[2]])

    df2['proxy_risk_score'] = score
    df2['risk_level'] = bins.astype(int)

    # Also attach scaled feature columns (for reproducibility / debug)
    scaled_cols = []
    for i, name in enumerate(features_kept):
        col = f'scaled__{name}'
        df2[col] = Xs[:, i]
        scaled_cols.append(col)

    # also return raw_score min/max so callers can reproduce the exact normalization
    raw_min = float(np.nanmin(raw_score)) if raw_score.size > 0 else 0.0
    raw_max = float(np.nanmax(raw_score)) if raw_score.size > 0 else 0.0
    # Return dropped_features so callers can record which features were removed
    return df2, features_kept, proxy_scaler, weights, edges, raw_min, raw_max, dropped_features


def train_and_save(df, feature_names, proxy_scaler=None):
    X = df[feature_names].fillna(0).values.astype(float)
    # If any feature needs transformation (inv_wealth, inv_dist), they already included in features list
    y = df['risk_level'].values

    scaler = MinMaxScaler()
    Xs = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(Xs, y, test_size=0.2, random_state=42, stratify=y)

    clf = RandomForestClassifier(n_estimators=200, random_state=42, class_weight='balanced')
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print('Classification report on held-out set:')
    print(classification_report(y_test, y_pred))

    # Save model and scaler (include proxy scaler if present on df)
    to_save = {'model': clf, 'scaler': scaler, 'features': feature_names}
    if proxy_scaler is not None:
        to_save['proxy_scaler'] = proxy_scaler
    # If proxy scaled columns exist, the df should contain scaled__ columns and a proxy_scaler attribute
    # but callers can add proxy_scaler into df metadata externally if desired
    joblib.dump(to_save, os.path.join(OUTPUT_DIR, 'rf_risk_model.joblib'))
    print('Saved model to', os.path.join(OUTPUT_DIR, 'rf_risk_model.joblib'))

    # Predict for all rows
    probs = clf.predict_proba(Xs)
    preds = clf.predict(Xs)
    df_out = df[['adm4_pcode']].copy()
    # include the continuous proxy score if present on the df (should be present when compute_proxy_risk used)
    if 'proxy_risk_score' in df.columns:
        df_out['proxy_risk_score'] = df['proxy_risk_score'].astype(float)
    else:
        # fallback: compute approx from model probabilities by taking weighted class index
        df_out['proxy_risk_score'] = 0.0
    df_out['predicted_risk_level'] = preds
    # take max class probability
    df_out['predicted_risk_confidence'] = probs.max(axis=1)
    # write CSV with proxy score (0..1), level, and confidence
    out_path = os.path.join(OUTPUT_DIR, 'risk_predictions.csv')
    df_out.to_csv(out_path, index=False)
    print('Saved predictions to', out_path)
    # return classifier so caller can inspect properties (n_estimators etc.)
    return clf


def main():
    print('Building feature table...')
    table = build_feature_table()
    print('Rows:', len(table))

    print('Computing proxy risk label...')
    df_with_risk, feats, proxy_scaler, proxy_weights, proxy_edges, proxy_raw_min, proxy_raw_max, dropped = compute_proxy_risk(table)

    # feature names used by classifier: use the features used to build proxy risk
    feature_names = feats

    print('Training Random Forest...')
    clf = train_and_save(df_with_risk, feature_names, proxy_scaler)

    # Export proxy model metadata for frontend explainability
    meta = {
        'features': feats,
        'proxy_weights': [float(w) for w in proxy_weights],
        'proxy_scaler_data_min': (proxy_scaler.data_min_.tolist() if hasattr(proxy_scaler, 'data_min_') else None),
        'proxy_scaler_data_max': (proxy_scaler.data_max_.tolist() if hasattr(proxy_scaler, 'data_max_') else None),
        'proxy_scaler_scale': (proxy_scaler.scale_.tolist() if hasattr(proxy_scaler, 'scale_') else None),
        'proxy_quartile_edges': [float(e) for e in proxy_edges]
    }
    # include raw proxy score normalization bounds so frontend can compute the normalized proxy:
    # normalized = (raw - proxy_raw_min) / (proxy_raw_max - proxy_raw_min)
    try:
        meta['proxy_raw_min'] = float(proxy_raw_min)
        meta['proxy_raw_max'] = float(proxy_raw_max)
    except Exception:
        meta['proxy_raw_min'] = None
        meta['proxy_raw_max'] = None
    # record any dropped constant features so frontend can explain why some IMF
    # indicators do not appear in the proxy computation
    try:
        meta['dropped_constant_features'] = dropped
    except Exception:
        meta['dropped_constant_features'] = []
    # include classifier details when available
    try:
        meta['rf_n_estimators'] = int(clf.n_estimators)
    except Exception:
        meta['rf_n_estimators'] = None
    # include transformed feature values per adm4_pcode so frontend can exactly reproduce normalization
    try:
        # store the proxy feature (pre-scaled) values
        feat_df = df_with_risk[['adm4_pcode'] + feats].copy()
        # coerce to numeric where possible
        for c in feats:
            feat_df[c] = pd.to_numeric(feat_df[c], errors='coerce')
        meta['proxy_feature_values'] = feat_df.fillna(0).to_dict(orient='records')

        # also store the scaled feature values (the inputs used to compute the proxy score)
        # If a feature is constant across the dataset (zero variance), MinMax scaler
        # produces a degenerate column. To avoid misleading `0.0` values in the
        # frontend we explicitly export `null` for constant features so the UI can
        # show "constant across dataset" instead of a numeric zero.
        scaled_cols = [c for c in df_with_risk.columns if c.startswith('scaled__')]
        if scaled_cols:
            scaled_df = df_with_risk[['adm4_pcode'] + scaled_cols].copy()
            # map scaled column order to feature index so we can detect constant cols
            out_scaled = []
            # try to read scaler bounds if available
            scaler_mins = None
            scaler_maxs = None
            try:
                scaler_mins = proxy_scaler.data_min_.tolist()
                scaler_maxs = proxy_scaler.data_max_.tolist()
            except Exception:
                scaler_mins = None
                scaler_maxs = None

            for _, r in scaled_df.iterrows():
                row = {'adm4_pcode': r['adm4_pcode']}
                for i, sc in enumerate(scaled_cols):
                    fname = sc.replace('scaled__', '')
                    val = r[sc]
                    # if scaler min/max are present and equal for this feature,
                    # export null to indicate constant feature
                    is_const = False
                    if scaler_mins is not None and scaler_maxs is not None and i < len(scaler_mins):
                        try:
                            is_const = float(scaler_mins[i]) == float(scaler_maxs[i])
                        except Exception:
                            is_const = False
                    if is_const:
                        row[fname] = None
                    else:
                        try:
                            row[fname] = float(val)
                        except Exception:
                            row[fname] = None
                out_scaled.append(row)
            meta['proxy_scaled_feature_values'] = out_scaled
        else:
            meta['proxy_scaled_feature_values'] = []
    except Exception:
        meta['proxy_feature_values'] = []
    try:
        meta_path = os.path.join(OUTPUT_DIR, 'risk_model_meta.json')
        with open(meta_path, 'w', encoding='utf-8') as fh:
            json.dump(meta, fh, indent=2)
        print('Saved proxy metadata to', meta_path)
        # Also copy to frontend public data folder so the client can fetch it
        public_meta_dir = os.path.join(BASE_DIR, 'Landing', 'client', 'public', 'data')
        os.makedirs(public_meta_dir, exist_ok=True)
        public_meta_path = os.path.join(public_meta_dir, 'risk_model_meta.json')
        with open(public_meta_path, 'w', encoding='utf-8') as fh:
            json.dump(meta, fh, indent=2)
        print('Copied proxy metadata to', public_meta_path)
        # Also copy predictions CSV to frontend public data folder if present
        try:
            src_preds = os.path.join(OUTPUT_DIR, 'risk_predictions.csv')
            dst_preds = os.path.join(public_meta_dir, 'risk_predictions.csv')
            if os.path.exists(src_preds):
                import shutil
                shutil.copy2(src_preds, dst_preds)
                print('Copied predictions CSV to', dst_preds)
        except Exception as e:
            print('Failed copying predictions to public folder:', e)
    except Exception as e:
        print('Failed to write proxy metadata to public folder:', e)


def load_model(path=None):
    """Load saved RF model bundle and return dict with keys 'model','scaler','features' and optional 'proxy_scaler'."""
    path = path or os.path.join(OUTPUT_DIR, 'rf_risk_model.joblib')
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return joblib.load(path)


def predict_from_model(df_in, model_bundle=None):
    """Predict risk level and confidence for rows in df_in.

    df_in: DataFrame that contains at least 'adm4_pcode' and the model features (the same feature names saved in bundle['features']).
    model_bundle: optional preloaded bundle (dict) from load_model(). If None the default saved model will be loaded.
    Returns: DataFrame with adm4_pcode, proxy_risk_score (if present), predicted_risk_level, predicted_risk_confidence.
    """
    if model_bundle is None:
        model_bundle = load_model()
    model = model_bundle.get('model')
    scaler = model_bundle.get('scaler')
    features = model_bundle.get('features')
    if model is None or scaler is None or features is None:
        raise RuntimeError('Model bundle missing required components')

    missing = [f for f in features if f not in df_in.columns]
    if missing:
        raise RuntimeError(f'Missing features in input dataframe: {missing}')

    X = df_in[features].fillna(0).values.astype(float)
    Xs = scaler.transform(X)
    preds = model.predict(Xs)
    probs = model.predict_proba(Xs)
    out = pd.DataFrame({'adm4_pcode': df_in['adm4_pcode'].values})
    if 'proxy_risk_score' in df_in.columns:
        out['proxy_risk_score'] = df_in['proxy_risk_score'].astype(float)
    out['predicted_risk_level'] = preds
    out['predicted_risk_confidence'] = probs.max(axis=1)
    return out


if __name__ == '__main__':
    main()
