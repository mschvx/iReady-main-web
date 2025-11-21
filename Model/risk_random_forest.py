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
                fallback = compute_min_distance_km_fallback(brgy, track_geojson)
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

    X = df2[features].fillna(0).values.astype(float)
    scaler = MinMaxScaler()
    Xs = scaler.fit_transform(X)

    # Weighted sum; weights chosen to reflect relative influence (tweakable)
    weights = np.ones(Xs.shape[1])
    # Put slightly higher weight on vulnerability and distance
    for i, name in enumerate(features):
        if 'vuln' in name or 'inform' in name or 'inv_dist' in name:
            weights[i] = 1.5
        if 'inv_wealth' in name:
            weights[i] = 1.2

    score = Xs.dot(weights)
    # normalize score
    score = (score - score.min()) / (score.max() - score.min() + 1e-9)

    # create 4-level risk bins
    # compute quartile edges used for labeling (so we can reproduce mapping later)
    try:
        edges = list(np.quantile(score, [0.25, 0.5, 0.75]))
    except Exception:
        edges = [0.25, 0.5, 0.75]

    bins = pd.qcut(score, q=4, labels=[0, 1, 2, 3])
    df2['proxy_risk_score'] = score
    df2['risk_level'] = bins.astype(int)
    return df2, features, scaler, weights, edges


def train_and_save(df, feature_names):
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

    # Save model and scaler
    joblib.dump({'model': clf, 'scaler': scaler, 'features': feature_names}, os.path.join(OUTPUT_DIR, 'rf_risk_model.joblib'))
    print('Saved model to', os.path.join(OUTPUT_DIR, 'rf_risk_model.joblib'))

    # Predict for all rows
    probs = clf.predict_proba(Xs)
    preds = clf.predict(Xs)
    df_out = df[['adm4_pcode']].copy()
    # include the continuous proxy score if present on the df
    if 'proxy_risk_score' in df.columns:
        df_out['proxy_risk_score'] = df['proxy_risk_score']
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
    df_with_risk, feats, proxy_scaler, proxy_weights, proxy_edges = compute_proxy_risk(table)

    # feature names used by classifier: use the features used to build proxy risk
    feature_names = feats

    print('Training Random Forest...')
    clf = train_and_save(df_with_risk, feature_names)

    # Export proxy model metadata for frontend explainability
    meta = {
        'features': feats,
        'proxy_weights': [float(w) for w in proxy_weights],
        'proxy_scaler_data_min': (proxy_scaler.data_min_.tolist() if hasattr(proxy_scaler, 'data_min_') else None),
        'proxy_scaler_data_max': (proxy_scaler.data_max_.tolist() if hasattr(proxy_scaler, 'data_max_') else None),
        'proxy_scaler_scale': (proxy_scaler.scale_.tolist() if hasattr(proxy_scaler, 'scale_') else None),
        'proxy_quartile_edges': [float(e) for e in proxy_edges]
    }
    # include classifier details when available
    try:
        meta['rf_n_estimators'] = int(clf.n_estimators)
    except Exception:
        meta['rf_n_estimators'] = None
    # include transformed feature values per adm4_pcode so frontend can exactly reproduce normalization
    try:
        feat_df = df_with_risk[['adm4_pcode'] + feats].copy()
        # coerce to numeric where possible
        for c in feats:
            feat_df[c] = pd.to_numeric(feat_df[c], errors='coerce')
        meta['proxy_feature_values'] = feat_df.fillna(0).to_dict(orient='records')
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


if __name__ == '__main__':
    main()
