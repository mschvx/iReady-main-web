
import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Polyline, Popup as LeafletPopup, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
// Navotas bounding box (approx) — updated to match local POIs in server/data/navotas_pois.json
const NAVOTAS_BOUNDS = {
  // loosely around the navotas POIs
  minLat: 14.42,
  maxLat: 14.45,
  minLon: 120.92,
  maxLon: 120.944,
};

// Metro Manila bounding box (approx) — used as the default area for ADM4 codes
const METRO_MANILA_BOUNDS = {
  minLat: 14.40,
  maxLat: 14.75,
  minLon: 120.90,
  maxLon: 121.10,
};


type BarangayCenter = {
  adm4_pcode: string;
  lat: number;
  lon: number;
  category?: string;
};


type NavotasPOI = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  keywords?: string[];
};


// Fallback random centers (used only until we load actual areaCodes)
const fallbackBarangayCenters: BarangayCenter[] = Array.from({ length: 50 }, (_, i) => ({
  adm4_pcode: `PH170000000${(i + 1).toString().padStart(2, "0")}`,
  lat:
    NAVOTAS_BOUNDS.minLat +
    Math.random() * (NAVOTAS_BOUNDS.maxLat - NAVOTAS_BOUNDS.minLat),
  lon:
    NAVOTAS_BOUNDS.minLon +
    Math.random() * (NAVOTAS_BOUNDS.maxLon - NAVOTAS_BOUNDS.minLon),
}));


// Tighter land-only bounds inside Navotas to reduce chance of water placement.
// We base this on the POIs file ranges and keep it slightly inset from the extreme
// POI coordinates so randomly generated points land on built-up/land areas.
const NAVOTAS_LAND_BOUNDS = {
  minLat: 14.427,
  maxLat: 14.444,
  minLon: 120.923,
  maxLon: 120.94,
};


function getLatLonForCode(code: string): { lat: number; lon: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const t = (h % 100000) / 100000;
  const u = ((h >>> 7) % 100000) / 100000;
  // Use Metro Manila bounds for deterministic placement so ADM4 area codes
  // land within Metro Manila (Navotas, Mandaluyong, Muntinlupa, etc.). When
              <div className="text-xs text-gray-500 mt-2">
                <div className="font-medium">Quick note about the two numbers you see:</div>
                <div>- <strong>Proxy score</strong> is the summed contributions from the table (a 0–1 score we created to rank places).</div>
                <div>- <strong>Model confidence</strong> (e.g. 0.99) is the Random Forest's probability for the class it predicted — it measures how sure the classifier is about its class label, not the proxy score.</div>
              </div>
  // real CSV centroids are available we will prefer them instead.
  const lat = METRO_MANILA_BOUNDS.minLat + t * (METRO_MANILA_BOUNDS.maxLat - METRO_MANILA_BOUNDS.minLat);
  const lon = METRO_MANILA_BOUNDS.minLon + u * (METRO_MANILA_BOUNDS.maxLon - METRO_MANILA_BOUNDS.minLon);
  return { lat, lon };
}
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";


interface User {
  id: string;
  username: string;
}


interface SupplyPrediction {
  adm4_pcode: string;
  [key: string]: any;
}


interface CategorySupplies {
  medical: { [key: string]: number };
  food: { [key: string]: number };
  shelter: { [key: string]: number };
  water: { [key: string]: number };
}


export const Home = (): JSX.Element => {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [areaCodes, setAreaCodes] = useState<string[]>([]);
  const [areaSuggestions, setAreaSuggestions] = useState<string[]>([]);
  const [poiCenters, setPoiCenters] = useState<NavotasPOI[]>([]);
  const [displayCenters, setDisplayCenters] = useState<BarangayCenter[]>([]);
  // Layer visibility state for legend toggles
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({});
  // mapRef removed: we use a small MapViewUpdater component to control view

  // Check for barangay navigation from Account page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const barangayCode = params.get('barangay');
    if (barangayCode) {
      // Focus on this barangay when coming from Account page
      setSearchQuery(barangayCode);
      setSelectedBarangay(barangayCode);
      // Will be handled by displayCenters effect below
      // Clear the URL parameter
      window.history.replaceState({}, '', '/home');
    }
  }, []);

  


  function MapViewUpdater({ center }: { center: { lat: number; lon: number } }) {
    const map = useMap();
    useEffect(() => {
      if (!map) return;
      try {
        // always use the external mapZoom when animating to a new center
        // prefer flyTo so the clicked point becomes the visible center and
        // the zoom animation is smooth and consistent across handlers
        if (typeof map.flyTo === 'function') {
          try {
            map.flyTo([center.lat, center.lon], mapZoom, { animate: true, duration: 0.6 });
          } catch (_e) {
            map.setView([center.lat, center.lon], mapZoom, { animate: true });
          }
        } else {
          map.setView([center.lat, center.lon], mapZoom, { animate: true });
        }
      } catch {
        // ignore if map not ready
      }
    }, [center.lat, center.lon, mapZoom, map]);
    return null;
  }

  // set the mapRef using react-leaflet's `useMap` hook to get the real Leaflet map instance
  function MapRefSetter() {
    const map = useMap();
    useEffect(() => {
      mapRef.current = map;
      try {
        console.debug('leaflet map created (MapRefSetter)', map && (map as any)?._leaflet_id);
      } catch {}
      return () => { mapRef.current = null; };
    }, [map]);
    return null;
  }


  // Fit the map to the Navotas bounding box once on initial load
  function FitNavotasBounds() {
    const map = useMap();
    const fitted = useRef(false);
    useEffect(() => {
      if (fitted.current) return;
      try {
        // Fit to Metro Manila bounds by default so markers from PH area codes
        // that fall in Metro Manila are visible on load.
        const southWest: [number, number] = [METRO_MANILA_BOUNDS.minLat, METRO_MANILA_BOUNDS.minLon];
        const northEast: [number, number] = [METRO_MANILA_BOUNDS.maxLat, METRO_MANILA_BOUNDS.maxLon];
        map.fitBounds([southWest, northEast], { animate: false, padding: [20, 20] });
        fitted.current = true;
      } catch (err) {
        // ignore
      }
    }, [map]);
    return null;
  }
  // derive centers from areaCodes (first 50) or fallback; actual display centers are
  // generated from nearby POIs to ensure points fall on land (we jitter around
  // non-water POIs). displayCenters is computed in an effect below.
  const barangayCenters: BarangayCenter[] = (areaCodes && areaCodes.length > 0)
    ? areaCodes.slice(0, 50).map((c) => {
        const { lat, lon } = getLatLonForCode(c);
        return { adm4_pcode: c, lat, lon };
      })
    : fallbackBarangayCenters;
  // default map center set to Metro Manila (so markers for Manila-area ADM4 codes are visible)
  const defaultCenterLat = (METRO_MANILA_BOUNDS.minLat + METRO_MANILA_BOUNDS.maxLat) / 2;
  const defaultCenterLon = (METRO_MANILA_BOUNDS.minLon + METRO_MANILA_BOUNDS.maxLon) / 2;
  const [mapCenter, setMapCenter] = useState({ lat: defaultCenterLat, lon: defaultCenterLon });
  const [mapZoom, setMapZoom] = useState<number>(13); // <- new: zoom state
  // reference to the Leaflet map instance so handlers can directly fly/zoom
  const mapRef = useRef<any>(null);

  // Helper to fly to a lat/lon with a vertical pixel offset so popped labels/popups
  // appear nicely above the marker (helps match the provided screenshot).
  const flyToWithOffset = (lat: number, lon: number, zoomLevel: number = 19, offsetPx: [number, number] = [0, -120]) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const pt = map.latLngToContainerPoint([lat, lon]);
      const shifted = { x: pt.x + offsetPx[0], y: pt.y + offsetPx[1] };
      const dest = map.containerPointToLatLng(shifted);
      if (typeof map.flyTo === 'function') {
        map.flyTo(dest, zoomLevel, { animate: true, duration: 0.6 });
      } else if (typeof map.setView === 'function') {
        map.setView(dest, zoomLevel, { animate: true });
      }
    } catch (err) {
      try {
        if (typeof map.flyTo === 'function') map.flyTo([lat, lon], zoomLevel, { animate: true, duration: 0.6 });
      } catch {}
    }
  };
  // brgy points loaded from CSV (adm4_pcode -> centroid)
  const [brgyPoints, setBrgyPoints] = useState<{ id: string; lat: number; lon: number }[]>([]);
  // typhoon track state (will be replaced by GeoJSON if available)
  const [typhoonTrack, setTyphoonTrack] = useState<[number, number][]>(() => {
    const midLat = (NAVOTAS_BOUNDS.minLat + NAVOTAS_BOUNDS.maxLat) / 2;
    const midLon = (NAVOTAS_BOUNDS.minLon + NAVOTAS_BOUNDS.maxLon) / 2;
    return [
      [9.0, 137.0],
      [10.0, 133.5],
      [10.8, 130.0],
      [11.5, 126.5],
      [12.3, 123.5],
      [13.0, 121.8],
      [midLat, midLon],
      [15.0, 119.0],
      [17.0, 116.0],
      [19.0, 114.0],
    ];
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; lat: number; lon: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [adm4Suggestions, setAdm4Suggestions] = useState<Array<any>>([]);
  const [supplies, setSupplies] = useState<CategorySupplies | null>(null);
  const [selectedBarangay, setSelectedBarangay] = useState<string>("");
  // New state to load and hold prediction data for a searched adm4 code
  const [toReceiveData, setToReceiveData] = useState<SupplyPrediction[] | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<SupplyPrediction | null>(null);
  const [riskMap, setRiskMap] = useState<Record<string, { level: number; confidence: number; proxy?: number }>>({});
  const [topUnclaimed, setTopUnclaimed] = useState<Array<{ adm4_pcode: string; proxy?: number; level?: number; confidence?: number }>>([]);
  const [riskModelMeta, setRiskModelMeta] = useState<any | null>(null);
  
  // Legend / layer toggles
  const [showAreaCircles, setShowAreaCircles] = useState<boolean>(false);
  const [showPoiLabels, setShowPoiLabels] = useState<boolean>(false);
  // Once user focuses a barangay, hide the button and show their username
  const [focusedByUser, setFocusedByUser] = useState<boolean>(false);
  // Track barangay claims (barangayCode -> username)
  const [barangayClaims, setBarangayClaims] = useState<Record<string, string>>({});
  // Track if current barangay is claimed
  const [currentBarangayClaim, setCurrentBarangayClaim] = useState<{claimed: boolean, claimant?: string} | null>(null);
  // Error modal for claiming multiple barangays
  const [showClaimLimitModal, setShowClaimLimitModal] = useState<boolean>(false);

  // compute top 3 unclaimed vulnerable barangays whenever riskMap or barangayClaims changes
  useEffect(() => {
    if (!riskMap || Object.keys(riskMap).length === 0) {
      setTopUnclaimed([]);
      return;
    }
    const arr = Object.entries(riskMap).map(([adm4_pcode, v]) => ({ adm4_pcode, level: v.level, confidence: v.confidence, proxy: v.proxy }));
    // filter out claimed barangays
    const unclaimed = arr.filter(a => !barangayClaims || !Object.prototype.hasOwnProperty.call(barangayClaims, a.adm4_pcode));
    // sort by proxy score desc (use proxy if available), fallback to level then confidence
    unclaimed.sort((a, b) => {
      const ap = (a.proxy != null) ? a.proxy : ((a.level != null) ? a.level / 3 : 0);
      const bp = (b.proxy != null) ? b.proxy : ((b.level != null) ? b.level / 3 : 0);
      if (bp !== ap) return bp - ap;
      if (b.level !== a.level) return b.level - a.level;
      return (b.confidence || 0) - (a.confidence || 0);
    });
    setTopUnclaimed(unclaimed.slice(0, 3));
  }, [riskMap, barangayClaims]);

  // New state to load and hold prediction data for a searched adm4 code
  const [explain, setExplain] = useState<null | {
    features: Array<{ name: string; raw: number; norm: number; weight: number; contrib: number }>;
    proxy: number;
    label: string;
    raw?: number;
  }>(null);

  // Friendly labels for features to show plain-language names in the UI
  const featureFriendlyLabels: Record<string, string> = {
    inv_wealth: 'Wealth (lower is worse)',
    low_health_access: 'Health access (lower is worse)',
    inform_vulnerability: 'Inform vulnerability',
    lack_of_coping: 'Lack of coping capacity',
    inform_risk_index: 'INFORM risk index',
    vuln_food: 'Food vulnerability',
    vuln_health: 'Health vulnerability',
    vuln_water: 'Water vulnerability',
    storms_2024: 'Recent storm frequency',
    inv_dist: 'Distance to typhoon track (closer is worse)',
    wealth_mean: 'Wealth (mean)',
    wealth_std: 'Wealth (std dev)',
    pop_30min: 'Population (within 30min)',
    access_pct_30min: 'Access % (30min)',
    climate_rainfall: 'Climate rainfall',
    disease_risk: 'Disease risk'
  };

  function humanJoin(list: string[]) {
    if (!list || list.length === 0) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
  }

  // Compute explainability (proxy score + contributions) for a given barangay code.
  const computeExplain = (code: string | null) => {
    if (!code) {
      setExplain(null);
      return;
    }

    // If we have exact model metadata, use it to compute exact normalized values and contributions.
    if (riskModelMeta && Array.isArray(riskModelMeta.features) && Array.isArray(riskModelMeta.proxy_weights)) {
      const feats = riskModelMeta.features as string[];
      const weights = riskModelMeta.proxy_weights as number[];

      const pv = Array.isArray(riskModelMeta.proxy_feature_values)
        ? riskModelMeta.proxy_feature_values.find((r: any) => String(r.adm4_pcode) === String(code))
        : null;

      const rawRow = pv || ((Array.isArray(toReceiveData) && toReceiveData.find(r => String(r.adm4_pcode) === String(code))) || riskMap[code]);
      if (!rawRow) {
        setExplain(null);
        return;
      }

      const mins = (riskModelMeta.proxy_scaler_data_min || []).slice();
      const maxs = (riskModelMeta.proxy_scaler_data_max || []).slice();

      const featuresOut: Array<{ name: string; raw: number; norm: number; weight: number; contrib: number }> = [];
      let proxy = 0;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        let rawVal = Number(rawRow[f] ?? rawRow[f.replace(/^inv_/, '')] ?? 0);
        if (!pv) {
          if (f === 'inv_wealth' && rawRow['wealth_mean'] !== undefined) {
            rawVal = 1 - Number(rawRow['wealth_mean'] ?? 0);
          } else if (f === 'low_health_access' && rawRow['brgy_healthcenter_pop_reached_30min'] !== undefined) {
            const val = Number(rawRow['brgy_healthcenter_pop_reached_30min'] ?? 0);
            const maxVal = Array.isArray(toReceiveData) && toReceiveData.length ? Math.max(...toReceiveData.map(d => Number(d['brgy_healthcenter_pop_reached_30min'] ?? 0))) : (val || 1);
            rawVal = 1 - (val / (maxVal + 1));
          }
        }

        const mn = (mins && mins[i] != null) ? Number(mins[i]) : 0;
        const mx = (maxs && maxs[i] != null) ? Number(maxs[i]) : mn + 1;
        const norm = (rawVal - mn) / Math.max(1e-9, (mx - mn));
        const weight = Number(weights[i] ?? 0);
        const contrib = norm * weight;
        proxy += contrib;
        featuresOut.push({ name: f, raw: rawVal, norm: Math.max(0, Math.min(1, norm)), weight, contrib });
      }

      // The backend stores the raw weighted sum (proxy) and also provides
      // `proxy_raw_min` / `proxy_raw_max` which were used to normalize that
      // raw sum into the 0-1 range exposed as the public "proxy score".
      // To match the model exactly we must apply the same normalization here.
      const rawProxy = proxy;
      const rawMin = Number(riskModelMeta.proxy_raw_min ?? 0);
      const rawMax = Number(riskModelMeta.proxy_raw_max ?? (rawMin + 1));
      const normProxy = (rawProxy - rawMin) / Math.max(1e-9, (rawMax - rawMin));
      const proxyClamped = Math.max(0, Math.min(1, normProxy));

      const edges = Array.isArray(riskModelMeta.proxy_quartile_edges) ? riskModelMeta.proxy_quartile_edges : [0.25, 0.5, 0.75];
      const label = proxyClamped < edges[0] ? 'Low' : proxyClamped < edges[1] ? 'Medium' : proxyClamped < edges[2] ? 'High' : 'Very High';
      setExplain({ features: featuresOut, proxy: proxyClamped, label, raw: rawProxy });
      return;
    }

    // Fallback legacy behavior (no exact meta available)
    const feats = ['wealth_mean','wealth_std','pop_30min','access_pct_30min','climate_rainfall','disease_risk'];
    const weights = [0.25,0.05,0.25,0.2,0.125,0.125];

    const row = (Array.isArray(toReceiveData) && toReceiveData.find(r => String(r.adm4_pcode) === String(code))) || riskMap[code];
    if (!row) {
      setExplain(null);
      return;
    }

    const dataset = Array.isArray(toReceiveData) && toReceiveData.length > 0 ? toReceiveData : null;
    const mins: Record<string, number> = {};
    const maxs: Record<string, number> = {};
    if (dataset) {
      for (const f of feats) {
        const vals = dataset.map(d => Number(d[f] ?? 0)).filter(v => !Number.isNaN(v));
        mins[f] = vals.length ? Math.min(...vals) : 0;
        maxs[f] = vals.length ? Math.max(...vals) : mins[f] + 1;
      }
    }

    const featuresOut: Array<{ name: string; raw: number; norm: number; weight: number; contrib: number }> = [];
    let proxy = 0;
    for (let i=0;i<feats.length;i++){
      const f = feats[i];
      const raw = Number((row as any)[f] ?? 0);
      let norm = 0;
      if (dataset) {
        const mn = mins[f];
        const mx = maxs[f];
        norm = (raw - mn) / (Math.max(1e-9, mx - mn));
      } else {
        if (f.includes('wealth')) norm = 1 - Math.min(Math.max(raw,0),1);
        else if (f.includes('pop')) norm = Math.min(raw / 50000, 1);
        else if (f.includes('access')) norm = 1 - Math.min(Math.max(raw,0),100)/100;
        else norm = Math.min(Math.max(raw,0)/100,1);
      }
      const weight = weights[i] ?? 0;
      const contrib = norm * weight;
      proxy += contrib;
      featuresOut.push({ name: f, raw, norm, weight, contrib });
    }

    const label = proxy < 0.25 ? 'Low' : proxy < 0.5 ? 'Medium' : proxy < 0.75 ? 'High' : 'Very High';
    setExplain({ features: featuresOut, proxy, label });
  };

  // Recompute explain whenever the selected barangay or relevant data changes
  useEffect(() => {
    computeExplain(selectedBarangay);
  }, [selectedBarangay, toReceiveData, riskMap, riskModelMeta]);

  // Load typhoon GeoJSON and barangay CSV from frontend `public/data/`.
  // These populate `typhoonTrack` and `brgyPoints` state respectively.
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/data/ph-all-tc-tracks-2024.geojson');
        if (!resp.ok) return;
        const gj = await resp.json();
        if (gj && Array.isArray(gj.features) && gj.features.length > 0) {
          // find first LineString feature
          const ln = gj.features.find((f: any) => f.geometry && f.geometry.type === 'LineString');
          if (ln && Array.isArray(ln.geometry.coordinates)) {
            const coords = ln.geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
            setTyphoonTrack(coords);
          }
        }
      } catch (err) {
        // ignore
      }
    })();

    (async () => {
      try {
        // prefer precomputed centroids if available
        let resp = await fetch('/data/brgy_centroids.json');
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            setBrgyPoints(data.map((d: any) => ({ id: d.id || d[0] || d.code, lat: Number(d.lat), lon: Number(d.lon) })));
            return;
          }
        }

        // fallback to raw CSV parsing if centroids file not present
        resp = await fetch('/data/brgy_geography.csv');
        if (!resp.ok) return;
        const txt = await resp.text();
        const lines = txt.split(/\r?\n/).filter(Boolean);
        const parsed: { id: string; lat: number; lon: number }[] = [];
        for (const line of lines) {
          // naive CSV split (id, "POLYGON ((...))")
          const m = line.match(/^\s*([^,]+),\s*"?POLYGON \(\((.+)\)\)"?\s*$/i);
          if (!m) continue;
          const id = m[1];
          const coordsStr = m[2];
          const parts = coordsStr.split(/,\s*/).map(p => p.trim());
          const verts: [number, number][] = [];
          for (const part of parts) {
            const pair = part.split(/\s+/).map(Number);
            if (pair.length >= 2 && !Number.isNaN(pair[0]) && !Number.isNaN(pair[1])) {
              const lon = pair[0];
              const lat = pair[1];
              verts.push([lat, lon]);
            }
          }
          if (verts.length === 0) continue;
          // simple centroid (arithmetic mean of vertices)
          const sum = verts.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1]] as [number, number], [0, 0]);
          const cen: [number, number] = [sum[0] / verts.length, sum[1] / verts.length];
          parsed.push({ id, lat: cen[0], lon: cen[1] });
        }
        if (parsed.length > 0) setBrgyPoints(parsed);
      } catch (err) {
        // ignore
      }
    })();

      // fetch model metadata (normalizer + weights) for exact explainability, if present
      (async () => {
        try {
          const resp = await fetch('/data/risk_model_meta.json');
          if (!resp.ok) return;
          const meta = await resp.json();
          setRiskModelMeta(meta);
        } catch (err) {
          // ignore
        }
      })();
  }, []);

  // Utility: Haversine distance in meters
  const haversineMeters = (a: [number, number], b: [number, number]) => {
    const R = 6371000; // m
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  // Compute 6 equally spaced snapshot points along the typhoon track
  const typhoonSnapshots = React.useMemo(() => {
    if (!typhoonTrack || typhoonTrack.length < 2) return [] as Array<{ lat: number; lon: number; hours: number; rain: number; wind: number; gusts: number; pressure: number }>;

    // Build cumulative distances
    const segLens: number[] = [];
    let total = 0;
    for (let i = 0; i < typhoonTrack.length - 1; i++) {
      const d = haversineMeters(typhoonTrack[i], typhoonTrack[i + 1]);
      segLens.push(d);
      total += d;
    }
    if (total <= 0) return [] as any[];

    const points: Array<{ lat: number; lon: number; hours: number; rain: number; wind: number; gusts: number; pressure: number }> = [];
    const N = 6;

    // Simple deterministic PRNG based on index
    const rng = (seed: number) => {
      let h = 2166136261 ^ seed;
      return () => {
        h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
        // convert to [0,1)
        return ((h >>> 0) % 10000) / 10000;
      };
    };

    for (let k = 1; k <= N; k++) {
      const target = (k / (N + 1)) * total;
      // locate segment
      let acc = 0;
      let segIdx = 0;
      for (; segIdx < segLens.length; segIdx++) {
        if (target <= acc + segLens[segIdx]) break;
        acc += segLens[segIdx];
      }
      const t = Math.min(1, Math.max(0, (target - acc) / (segLens[segIdx] || 1)));
      const A = typhoonTrack[segIdx];
      const B = typhoonTrack[segIdx + 1];
      const lat = A[0] + (B[0] - A[0]) * t;
      const lon = A[1] + (B[1] - A[1]) * t;

      // Metrics (synthetic, stable per point index)
      const r = rng(k);
      const hours = 3 * k; // 3h increments along the line
      const rain = Math.round(50 + r() * 150); // 50-200 mm/24h equivalent
      const wind = Math.round(70 + r() * 90); // 70-160 km/h
      const gusts = Math.round(wind * (1.25 + r() * 0.25)); // 1.25x - 1.5x
      const pressure = Math.round(950 + r() * 45); // 950-995 hPa

      points.push({ lat, lon, hours, rain, wind, gusts, pressure });
    }
    return points;
  }, [typhoonTrack]);


  useEffect(() => {
    checkAuth();
    // keep loading supplies predictions (previous behavior)
    loadSupplies();

    // Load all barangay claims
    loadBarangayClaims();

    // fetch local toreceive area codes for simple search
    (async () => {
      try {
        const resp = await fetch('/api/toreceive');
        if (!resp.ok) return;
        const data = await resp.json();
        if (Array.isArray(data.codes)) setAreaCodes(data.codes);
      } catch (err) {
        // ignore
      }
    })();


    // fetch all Navotas POIs (used to place accurate markers). We'll use these
    // POIs as anchors to scatter our 50 circles on land (we filter out POIs that
    // look like water to avoid placing circles in the bay/sea).
    (async () => {
      try {
        const resp = await fetch('/api/pois?all=true');
        if (!resp.ok) return;
        const data = await resp.json();
        const pois: NavotasPOI[] = data.results || data || [];
        const waterKeywords = ['sea','bay','ocean','lake','river','channel','canal','marina','harbor','harbour','ferry','port'];
        const filtered = pois.filter(p => {
          const kw = p.keywords || [];
          return !kw.some((k: string) => waterKeywords.some(w => k.toLowerCase().includes(w)));
        });
        // further restrict POIs to the Navotas bounding box to avoid out-of-area data
        const inNavotas = filtered.filter(p => {
          return p && typeof p.lat === 'number' && typeof p.lon === 'number' &&
            p.lat >= NAVOTAS_BOUNDS.minLat && p.lat <= NAVOTAS_BOUNDS.maxLat &&
            p.lon >= NAVOTAS_BOUNDS.minLon && p.lon <= NAVOTAS_BOUNDS.maxLon;
        });
  // Only use POIs that are actually inside the Navotas bounding box.
  // Avoid falling back to results outside Navotas which can place
  // display centers in the wrong municipality (e.g. Cavite).
  setPoiCenters(inNavotas);
      } catch (err) {
        // ignore
      }
    })();

    // initialize visible layer toggles once (only two layers controlled by legend)
    setVisibleLayers({
      barangays: true,
      typhoon: true,
    });
  }, []);


  // Compute 50 display centers anchored on land POIs or fall back to deterministic
  // pseudo-random locations derived from ADM4 codes. We jitter near POIs so
  // the points are guaranteed to be close to known land locations.
  useEffect(() => {
    const count = 50;
    const centers: BarangayCenter[] = [];
    const rng = (seed: string) => {
      // simple deterministic PRNG based on code string
      let h = 2166136261 >>> 0;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
        const res = (h >>> 0) / 4294967295;
        return res;
      };
    };

    // Map of CSV-derived barangay centroids for quick lookup (id -> centroid)
    const brgyMap = new Map<string, { id: string; lat: number; lon: number }>(
      (brgyPoints || []).map((b) => [String(b.id).toLowerCase(), b])
    );


    // We only use a single category for display centers: 'barangays'.
    // This ensures all points are styled consistently with the Barangay legend.
    if (areaCodes && areaCodes.length > 0) {
      const codes = areaCodes.slice(0, count);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        const lc = String(code).toLowerCase();
        const match = brgyMap.get(lc);
        if (!match) {
          // No centroid available for this ADM4 code — skip it rather than inventing one
          console.warn(`No brgy centroid found for ${code}; skipping marker.`);
          continue;
        }
        centers.push({ adm4_pcode: code, lat: match.lat, lon: match.lon, category: 'barangays' });
      }
    } else {
      // Fallback deterministic centers; mark all as 'barangays'
      for (let i = 0; i < count; i++) {
        const code = `PH-FAKE-${i + 1}`;
        const { lat: baseLat, lon: baseLon } = getLatLonForCode(code);
        const prng = rng(code + String(i));
        const jitterLat = (prng() - 0.5) * 0.003;
        const jitterLon = (prng() - 0.5) * 0.003;
        let lat = baseLat + jitterLat;
        let lon = baseLon + jitterLon;
        lat = Math.max(METRO_MANILA_BOUNDS.minLat, Math.min(METRO_MANILA_BOUNDS.maxLat, lat));
        lon = Math.max(METRO_MANILA_BOUNDS.minLon, Math.min(METRO_MANILA_BOUNDS.maxLon, lon));
        centers.push({ adm4_pcode: code, lat, lon, category: 'barangays' });
      }
    }


    setDisplayCenters(centers);
  }, [areaCodes, poiCenters, brgyPoints]);

  // Handle focusing on barangay when navigating from Account page
  useEffect(() => {
    if (!selectedBarangay || displayCenters.length === 0) return;
    
    const lc = selectedBarangay.toLowerCase();
    const matched = displayCenters.find((d) => (d.adm4_pcode || "").toLowerCase() === lc);
    
    if (matched) {
      setMapCenter({ lat: matched.lat, lon: matched.lon });
      setMapZoom(18);
      flyToWithOffset(matched.lat, matched.lon, 18, [0, -120]);
      
      // Load prediction data if available
      if (toReceiveData) {
        const pred = toReceiveData.find((p) => (p.adm4_pcode || "").toLowerCase() === lc);
        if (pred) {
          setSelectedPrediction(pred);
          categorizeSupplies(pred);
        }
      }
    } else if (areaCodes && areaCodes.some((c) => c.toLowerCase() === lc)) {
      const { lat, lon } = getLatLonForCode(selectedBarangay);
      setMapCenter({ lat, lon });
      setMapZoom(18);
      flyToWithOffset(lat, lon, 18, [0, -120]);
      
      if (toReceiveData) {
        const pred = toReceiveData.find((p) => (p.adm4_pcode || "").toLowerCase() === lc);
        if (pred) {
          setSelectedPrediction(pred);
          categorizeSupplies(pred);
        }
      }
    }
  }, [selectedBarangay, displayCenters, toReceiveData]);

  // Check claim status when selected barangay changes
  useEffect(() => {
    if (!selectedBarangay) {
      setCurrentBarangayClaim(null);
      setFocusedByUser(false);
      return;
    }

    // Check if this barangay is claimed
    (async () => {
      try {
        const response = await fetch(`/api/barangay/claim/${encodeURIComponent(selectedBarangay)}`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          setCurrentBarangayClaim(data);
          // If claimed by current user, show their name
          if (data.claimed && user && data.claimant === user.username) {
            setFocusedByUser(true);
          } else {
            setFocusedByUser(false);
          }
        }
      } catch (err) {
        console.error("Failed to check barangay claim:", err);
      }
    })();
  }, [selectedBarangay, user]);


  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        setLocation("/login");
        return;
      }
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      setLocation("/login");
    } finally {
      setIsLoading(false);
    }
  };

  const loadBarangayClaims = async () => {
    try {
      const response = await fetch("/api/barangay/claims", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        const claimsMap: Record<string, string> = {};
        data.claims.forEach((claim: any) => {
          claimsMap[claim.barangayCode] = claim.username;
        });
        setBarangayClaims(claimsMap);
      }
    } catch (err) {
      console.error("Failed to load barangay claims:", err);
    }
  };


  const loadSupplies = async () => {
    try {
      const response = await fetch("/ToReceive.json");
      if (response.ok) {
        const data: SupplyPrediction[] = await response.json();
        console.log("Loaded supplies data:", data.length, "barangays");
        // Load area codes but don't auto-select any barangay
        if (data.length > 0) {
          // Use the adm4_pcode values from ToReceive.json as our area codes so
          // the map markers show real barangay codes instead of PH-FAKE.
          try {
            const codes = data.map((d) => d.adm4_pcode).filter(Boolean) as string[];
            if (codes.length > 0) setAreaCodes(codes);
          } catch (err) {
            // ignore malformed data
          }
        }
      } else {
        console.error("Failed to fetch supplies:", response.status);
      }
    } catch (err) {
      console.error("Failed to load supplies:", err);
    }
  };


  const categorizeSupplies = (barangayData: SupplyPrediction) => {
    const categories: CategorySupplies = {
      medical: {},
      food: {},
      shelter: {},
      water: {}
    };


    Object.keys(barangayData).forEach(key => {
      if (key.startsWith("pred_")) {
        const itemName = key.replace("pred_", "").replace(/_/g, " ");
        const value = barangayData[key];
       
        // Categorize based on item name (matching RForest_train.py logic)
        if (/para|first|antibi|bandage|alcohol|therm|blood|mask|glove|vitamin/.test(key)) {
          categories.medical[itemName] = value;
        } else if (/rice|canned|noodle|biscuit|baby|oil|sugar|salt|juice|meal/.test(key)) {
          categories.food[itemName] = value;
        } else if (/blanket|mat|tent|pillow|cloth|towel|slipper|hygiene|net|flash/.test(key)) {
          categories.shelter[itemName] = value;
        } else if (key.startsWith("pred_")) {
          categories.water[itemName] = value;
        }
      }
    });


    setSupplies(categories);
  };


  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      setLocation("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };


  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;


    setIsSearching(true);
    setSearchError("");
    setSelectedPrediction(null);


    try {
      const lc = q.toLowerCase();


  // 1) If the query is an adm4 code or matches a display center, jump to it
      const matched = displayCenters.find((d) => (d.adm4_pcode || "").toLowerCase() === lc);
      if (matched) {
        setMapCenter({ lat: matched.lat, lon: matched.lon });
        setMapZoom(19); // zoom in more when focusing a single barangay
        setSelectedBarangay(matched.adm4_pcode);
        computeExplain(matched.adm4_pcode);
        flyToWithOffset(matched.lat, matched.lon, 19, [0, -120]);
 
  // show the formatted prediction summary (if loaded)
        if (toReceiveData) {
          const pred = toReceiveData.find((p) => (p.adm4_pcode || "").toLowerCase() === lc);
          if (pred) {
            setSelectedPrediction(pred);
            categorizeSupplies(pred);
          } else {
            setSelectedPrediction(null);
          }
        }
 
        setIsSearching(false);
        return;
      }
 
      // 2) If it's in areaCodes but not in displayCenters, compute deterministic lat/lon
      if (areaCodes && areaCodes.some((c) => c.toLowerCase() === lc)) {
        const { lat, lon } = getLatLonForCode(q);
        setMapCenter({ lat, lon });
        setMapZoom(19);
        setSelectedBarangay(q);
        computeExplain(q);
        flyToWithOffset(lat, lon, 19, [0, -120]);
 
        if (toReceiveData) {
          const pred = toReceiveData.find((p) => (p.adm4_pcode || "").toLowerCase() === lc);
          if (pred) {
            setSelectedPrediction(pred);
            categorizeSupplies(pred);
          } else {
            setSelectedPrediction(null);
          }
        }
 
        setIsSearching(false);
        return;
      }
 
      // 3) Fallback: server geocode for free-text locations
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).message || "Location not found");
      }
      const data = await response.json();
      if (data && typeof data.lat === "number" && typeof data.lon === "number") {
        setMapCenter({ lat: data.lat, lon: data.lon });
        setMapZoom(13);
        setSelectedPrediction(null);
      } else {
        throw new Error("Invalid geocode result");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Search failed";
      setSearchError(errorMsg);
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };


  // Fetch POI suggestions from server
  useEffect(() => {
      if (!searchQuery.trim()) {
        // clear both area-code suggestions and POI/adm4 suggestions when search is empty
        setAreaSuggestions([]);
        setSuggestions([]);
        setAdm4Suggestions([]);
        setShowSuggestions(false);
      return;
    }


    const handle = setTimeout(async () => {
      try {
        // fetch POI suggestions
        const resp = await fetch(`/api/pois?q=${encodeURIComponent(searchQuery)}`);
        if (resp.ok) {
          const data = await resp.json();
          setSuggestions(data.results || []);
        }
      } catch (err) {
        console.error("POI suggestion error:", err);
      }


      try {
        // fetch adm4 matches
        const adm = await fetch(`/api/adm4?q=${encodeURIComponent(searchQuery)}`);
        if (adm.ok) {
          const admData = await adm.json();
          setAdm4Suggestions(admData.results || []);
        }
      } catch (err) {
        console.error("ADM4 suggestion error:", err);
      }


      setShowSuggestions(true);
    }, 250); // debounce


    return () => clearTimeout(handle);
  }, [searchQuery]);


  const handleSelectSuggestion = (s: { id: string; name: string; lat: number; lon: number }) => {
    setMapCenter({ lat: s.lat, lon: s.lon });
    setMapZoom(15);
    flyToWithOffset(s.lat, s.lon, 15, [0, -100]);
    setSearchQuery(s.name);
    setShowSuggestions(false);
  };


  const handleSelectAdm4 = async (adm: any) => {
    if (!adm) return;
    // set selected barangay and supplies
    setSelectedBarangay(adm.adm4_pcode || "");
    computeExplain(adm.adm4_pcode || "");
    setMapZoom(19);
    try {
      categorizeSupplies(adm);
    } catch (err) {
      console.error("Failed to categorize supplies for adm4:", err);
    }


    // set search text to the adm4 code for clarity
    setSearchQuery(adm.adm4_pcode || "");
    setShowSuggestions(false);


    // attempt to geocode adm4 code (server will fallback to nominatim)
    try {
      const resp = await fetch(`/api/geocode?q=${encodeURIComponent(adm.adm4_pcode)}`);
      if (resp.ok) {
        const data = await resp.json();
          if (data.lat && data.lon) {
          setMapCenter({ lat: data.lat, lon: data.lon });
          setMapZoom(19);
          flyToWithOffset(data.lat, data.lon, 19, [0, -120]);
        }
      }
    } catch (err) {
      console.error("Geocode adm4 failed:", err);
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };


  // load predictions JSON once (served from server/static)
  useEffect(() => {
    (async () => {
      try {
        let res = await fetch("/data/ToReceive.json");
        if (!res.ok) res = await fetch("/ToReceive.json");
        if (res.ok) {
          const data = await res.json();
          setToReceiveData(Array.isArray(data) ? data : []);
        } else {
          setToReceiveData([]);
        }
      } catch (err) {
        console.warn("Failed to load ToReceive.json", err);
        setToReceiveData([]);
      }
    })();
  }, []);

  // load risk predictions CSV from public data
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('/data/risk_predictions.csv');
        if (!resp.ok) return;
        const txt = await resp.text();
        const lines = txt.split(/\r?\n/).filter(Boolean);
        const map: Record<string, { level: number; confidence: number; proxy?: number }> = {};
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].trim();
          if (!row) continue;
          // naive CSV parse: adm4_pcode may be quoted and fields are: adm4_pcode,proxy_risk_score,predicted_risk_level,predicted_risk_confidence
          // split on comma but allow quoted values
          const parts = row.split(',');
          const code = parts[0].replace(/^"|"$/g, '').trim();
          const proxy = parts[1] ? Number(parts[1]) : NaN;
          const level = parts[2] ? Number(parts[2]) : NaN;
          const conf = parts[3] ? Number(parts[3]) : NaN;
          if (code) map[code] = { level: Number.isFinite(level) ? level : 0, confidence: Number.isFinite(conf) ? conf : 0, proxy: Number.isFinite(proxy) ? proxy : undefined };
        }
        setRiskMap(map);
      } catch (err) {
        // ignore
      }
    })();
  }, []);


  if (isLoading) {
    return (
      <div className="bg-white w-full min-h-screen flex items-center justify-center">
        <p className="text-2xl">Loading...</p>
      </div>
    );
  }


  return (
    <div className="bg-white relative w-full min-h-screen">
      {/* Header copied from FirstPage (logo on left, fixed) */}
      <header className="fixed top-0 left-0 w-full h-18 md:h-20 lg:h-24 z-[4000] bg-black shadow-none border-b-0 flex items-center">
        <div className="pl-4 md:pl-6 lg:pl-8">
          <img
            className="h-18 md:h-20 lg:h-22 w-auto block"
            alt="iReady Header"
            src="/figmaAssets/fixed.png"
          />
        </div>
      </header>

      {/* Top-right nav styled like FirstPage */}
      <nav className="fixed top-0 right-0 z-[4100] flex gap-3 md:gap-4 pr-4 md:pr-8 pt-3 md:pt-4 lg:pt-6">
        <Button
          onClick={() => setLocation("/home")}
          className="h-10 md:h-12 px-4 md:px-6 bg-gray-700 rounded-full hover:bg-gray-600 text-sm md:text-base"
        >
          Home
        </Button>
        <Button
          onClick={() => setLocation("/account")}
          className="h-10 md:h-12 px-4 md:px-6 bg-blue-700 rounded-full hover:bg-sky-300 text-sm md:text-base"
        >
          Account
        </Button>
      </nav>


      {/* Main Content (pad for fixed header) */}
      <div className="pt-18 md:pt-20 lg:pt-24 min-h-[500px] md:min-h-[630px] grid grid-cols-1 lg:grid-cols-[70%_30%] items-stretch">
        {/* Map Section */}
        <div className="relative sticky top-16 md:top-20 lg:top-24 shrink-0 bg-[#d9d9d9] h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] lg:h-[calc(100vh-6rem)] flex items-center justify-center">
          <MapContainer
            center={[mapCenter.lat, mapCenter.lon]}
            zoom={mapZoom}
             scrollWheelZoom={true}
             style={{ height: '100%', width: '100%', minHeight: '400px' }}
           >
            <MapViewUpdater center={mapCenter} />
            <MapRefSetter />
            <FitNavotasBounds />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Typhoon track (toggleable) */}
            {visibleLayers.typhoon && (
              <>
                {/* Glow layer */}
                <Polyline
                  positions={typhoonTrack as [number, number][]}
                  pathOptions={{ color: '#7dd3fc', weight: 8, opacity: 0.25 }}
                />
                {/* Main line */}
                <Polyline
                  positions={typhoonTrack as [number, number][]}
                  pathOptions={{ color: '#0ea5e9', weight: 4, opacity: 0.9 }}
                />

              </>
            )}
            {/* barangay points layer (small markers) - now colored by category */}
            {displayCenters.map((b: any, idx: number) => {
              const category = b.category || 'barangays';
              
              // Don't render if this category is hidden
              if (!visibleLayers[category]) return null;
              
              const colorMap: Record<string, string> = {
                barangays: '#2563eb', // blue
                evacuation: '#f97316', // orange
                hospital: '#ef4444', // red
                school: '#6366f1', // indigo
                market: '#16a34a', // green
                church: '#7c3aed', // purple
                other: '#6b7280', // gray
              };
              
              const fillColor = colorMap[category] || '#2563eb';
              
              return (
                <CircleMarker
                  key={b.adm4_pcode || idx}
                  center={[b.lat, b.lon]}
                  radius={5}
                  pathOptions={{ color: '#fff', fillColor, fillOpacity: 0.95, weight: 1 }}
                  eventHandlers={{
                    click: (e: any) => {
                      const code = b.adm4_pcode || String(idx);
                      setSelectedBarangay(code);
                      computeExplain(code);
                      // Keep React state in sync so MapViewUpdater won't later override
                      // the map view with stale values.
                      setMapCenter({ lat: b.lat, lon: b.lon });
                      setMapZoom(19);

                      // Try to use the actual Leaflet map instance to flyTo the point —
                      // this guarantees the clicked point becomes the center and the map zooms in smoothly.
                      flyToWithOffset(b.lat, b.lon, 19, [0, -120]);
                    }
                  }}
                >
                  <LeafletPopup>{b.adm4_pcode}</LeafletPopup>
                  <LeafletTooltip direction="top" offset={[0, -6]} permanent className="bg-white text-xs text-black px-1 py-0 rounded shadow-sm">
                    {b.adm4_pcode}
                  </LeafletTooltip>
                </CircleMarker>
              );
            })}
              {/* barangay markers rendered once — controlled by visibleLayers.barangays */}


              {/* POIs rendered as neutral markers when barangay layer is visible */}
              {showAreaCircles && visibleLayers.barangays && poiCenters.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lon]}
                  radius={10}
                  pathOptions={{ color: '#6b7280', fillColor: '#6b7280', fillOpacity: 0.12, weight: 0.8 }}
                >
                  {showPoiLabels && (
                    <LeafletTooltip direction="top" offset={[0, -6]} className="bg-white text-xs text-black px-1 py-0 rounded shadow-sm">
                      {p.name}
                    </LeafletTooltip>
                  )}
                </CircleMarker>
              ))}


            {/* POI area markers simplified (no per-category coloring) - handled above */}
          </MapContainer>
          <button className="absolute left-2 bottom-8 bg-[#93c5fd] px-6 py-2 rounded-xl text-white text-lg hover:bg-[#7ab8f7]" style={{ zIndex: 10 }}>
            go back
          </button>
        </div>


        {/* Right Sidebar */}
      <div className="w-full h-full flex flex-col gap-4 p-6 md:p-10 bg-gray-50 box-border justify-center">
          {/* Barangay Search */}
          <div className="mb-6">
            <div className="relative bg-[#e6e6e6] rounded-[23px] p-4">
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  placeholder="Search barangay or location..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value;
                    setSearchQuery(v);
                    // update suggestions from areaCodes (simple substring match)
                    const q = v.trim().toLowerCase();
                    if (!q) {
                        setAreaSuggestions([]);
                      } else {
                        const matches = areaCodes.filter((c) => c.toLowerCase().includes(q)).slice(0, 10);
                        setAreaSuggestions(matches);
                      }
                    setSearchError("");
                  }}
                  onKeyPress={handleKeyPress}
                  disabled={isSearching}
                  className="flex-1 h-16 bg-white rounded-[23px] border-0 px-6 text-2xl md:text-3xl text-center placeholder:text-xl md:placeholder:text-2xl placeholder:text-gray-400"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="h-16 w-16 md:w-[72px] rounded-[23px] bg-blue-600 flex items-center justify-center text-white text-[32px] md:text-[37.5px] hover:bg-sky-300 disabled:opacity-50"
                >
                  {isSearching ? "..." : "→"}
                </button>
              </div>
                </div>

                {/* Explainability moved below Vulnerability Ranking (near Legend) */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg z-50 shadow-lg">
                {suggestions.map((s) => (
                  <div key={s.id} className="p-3 hover:bg-gray-100 cursor-pointer" onClick={() => handleSelectSuggestion(s)}>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-500">{s.lat.toFixed(5)}, {s.lon.toFixed(5)}</div>
                  </div>
                ))}
                {adm4Suggestions.length > 0 && (
                  <div className="border-t border-gray-100">
                    {adm4Suggestions.map((a) => (
                      <div key={a.adm4_pcode} className="p-3 hover:bg-gray-100 cursor-pointer" onClick={() => handleSelectAdm4(a)}>
                        <div className="font-medium">{a.adm4_pcode}</div>
                        <div className="text-sm text-gray-500">Population: {a.pop_30min ?? 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {searchError && (
              <p className="text-red-600 text-sm mt-2 px-4">{searchError}</p>
            )}
            {/* Suggestions list */}
            {areaSuggestions.length > 0 && (
              <div className="mt-2 bg-white rounded-md shadow-sm max-h-60 overflow-auto">
                {areaSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSearchQuery(s);
                      setAreaSuggestions([]);
                      // Immediately select and focus this barangay
                      setSelectedBarangay(s);
                      computeExplain(s);
                      const matched = displayCenters.find((d) => (d.adm4_pcode || '').toLowerCase() === (s || '').toLowerCase());
                      if (matched) {
                        setMapCenter({ lat: matched.lat, lon: matched.lon });
                        setMapZoom(18);
                        const lm = mapRef.current;
                        if (lm && typeof lm.flyTo === 'function') {
                          try { lm.flyTo([matched.lat, matched.lon], 18, { animate: true, duration: 0.6 }); } catch {}
                        }
                      } else {
                        const { lat, lon } = getLatLonForCode(s);
                        setMapCenter({ lat, lon });
                        setMapZoom(18);
                        const lm = mapRef.current;
                        if (lm && typeof lm.flyTo === 'function') {
                          try { lm.flyTo([lat, lon], 18, { animate: true, duration: 0.6 }); } catch {}
                        }
                      }
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>


          {/* Main Respondent */}
          <p className="font-extrabold text-2xl md:text-3xl text-black tracking-tight mb-3">
            Main Respondent
          </p>

          <div className="mb-8">
            {!selectedBarangay ? (
              <div className="w-full h-12 md:h-14 flex items-center justify-center rounded-xl bg-gray-50 border-2 border-dashed border-gray-300 text-base md:text-lg text-gray-500">
                Please search first
              </div>
            ) : currentBarangayClaim?.claimed ? (
              <div className="w-full h-12 md:h-14 flex items-center justify-center rounded-xl bg-gray-100 border text-base md:text-lg font-bold text-gray-800">
                {currentBarangayClaim.claimant === user?.username ? (
                  <span>{currentBarangayClaim.claimant}</span>
                ) : (
                  <button
                    onClick={() => setLocation(`/u/${encodeURIComponent(currentBarangayClaim.claimant || '')}`)}
                    className="text-blue-600 underline hover:text-blue-800"
                    aria-label={`View ${currentBarangayClaim.claimant}'s public profile`}
                  >
                    {currentBarangayClaim.claimant}
                  </button>
                )}
              </div>
            ) : (
              <Button
                onClick={async () => {
                  if (!selectedBarangay) {
                    alert("Please select a barangay first by searching for it.");
                    return;
                  }
                  
                  // Check if user has already claimed a barangay
                  const userClaimedBarangay = Object.entries(barangayClaims).find(
                    ([_, claimant]) => claimant === user?.username
                  );
                  
                  if (userClaimedBarangay) {
                    // Show error modal if user already has a claim
                    setShowClaimLimitModal(true);
                    return;
                  }
                  
                  console.log("Attempting to claim barangay:", selectedBarangay);
                  
                  try {
                    const response = await fetch("/api/barangay/claim", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      credentials: "include",
                      body: JSON.stringify({ barangayCode: selectedBarangay }),
                    });

                    console.log("Claim response status:", response.status);

                    if (response.ok) {
                      const data = await response.json();
                      console.log("Claim successful:", data);
                      
                      // Update local state
                      setFocusedByUser(true);
                      setCurrentBarangayClaim({
                        claimed: true,
                        claimant: user?.username,
                      });
                      setBarangayClaims((prev) => ({
                        ...prev,
                        [selectedBarangay]: user?.username || "",
                      }));

                      // compute explain so ranking & table appear immediately after claiming
                      computeExplain(selectedBarangay);

                      // Navigate to center
                      const lc = selectedBarangay.toLowerCase();
                      const matched = displayCenters.find((d) => (d.adm4_pcode || "").toLowerCase() === lc);
                      if (matched) {
                        setMapCenter({ lat: matched.lat, lon: matched.lon });
                        setMapZoom(18);
                        flyToWithOffset(matched.lat, matched.lon, 18, [0, -120]);
                      } else {
                        const { lat, lon } = getLatLonForCode(selectedBarangay);
                        setMapCenter({ lat, lon });
                        setMapZoom(18);
                        flyToWithOffset(lat, lon, 18, [0, -120]);
                      }

                      // Save to history in localStorage
                      try {
                        const historyKey = "barangay_history";
                        const existing = localStorage.getItem(historyKey);
                        let history: Array<{code: string, timestamp: number}> = [];
                        if (existing) {
                          history = JSON.parse(existing);
                        }
                        // Add new entry if not already the most recent
                        if (history.length === 0 || history[0].code !== selectedBarangay) {
                          history.unshift({ code: selectedBarangay, timestamp: Date.now() });
                          // Keep only the last 20 entries
                          history = history.slice(0, 20);
                          localStorage.setItem(historyKey, JSON.stringify(history));
                        }
                      } catch (err) {
                        console.error("Failed to save barangay history:", err);
                      }
                    } else if (response.status === 409) {
                      const errorData = await response.json().catch(() => ({}));
                      alert("This barangay has already been claimed by another user.");
                      console.error("Claim conflict:", errorData);
                    } else if (response.status === 401) {
                      alert("You must be logged in to claim a barangay.");
                    } else {
                      const errorData = await response.json().catch(() => ({}));
                      console.error("Claim failed:", errorData);
                      alert("Failed to claim barangay. Please try again.");
                    }
                  } catch (err) {
                    console.error("Failed to claim barangay:", err);
                    alert("Network error. Please check your connection and try again.");
                  }
                }}
                disabled={!selectedBarangay}
                className="w-full h-12 md:h-14 bg-blue-700 rounded-xl text-white hover:bg-sky-300 text-base md:text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                I want to focus on this barangay
              </Button>
              )}
              {/* Co-responder action: show a small request button under main respondent when enabled for this barangay */}
              {currentBarangayClaim?.claimed && selectedBarangay && (() => {
                try {
                  const raw = localStorage.getItem(`co_responder_${selectedBarangay}`);
                  if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.enabled) {
                      const qty = typeof parsed.qty === 'number' ? parsed.qty : 1;
                      return (
                        <div className="mt-2 flex justify-center">
                          <button
                            onClick={() => {
                              try {
                                const key = `co_request_sent_${selectedBarangay}`;
                                localStorage.setItem(key, JSON.stringify({ qty, ts: Date.now() }));
                              } catch {}
                              alert(`Backup requested (${qty} co-responders).`);
                            }}
                            className="text-sm bg-yellow-600 text-white px-3 py-1 rounded-md"
                          >
                            Request backup ({qty})
                          </button>
                        </div>
                      );
                    }
                  }
                } catch (e) {}
                return null;
              })()}
            <div className="mt-2 text-sm text-gray-600">
              {selectedBarangay ? (
                <span>Selected: {selectedBarangay}</span>
              ) : (
                <span>Search and select a barangay to enable focusing.</span>
              )}
              {currentBarangayClaim && (
                <div className="mt-1 text-xs">
                  {currentBarangayClaim.claimed ? (
                    currentBarangayClaim.claimant === user?.username ? (
                      <span className="text-green-600">✓ Claimed by you</span>
                    ) : (
                      <span className="text-green-600">✓ Claimed by 
                        <button
                          onClick={() => setLocation(`/u/${encodeURIComponent(currentBarangayClaim.claimant || '')}`)}
                          className="ml-1 text-blue-600 underline hover:text-blue-800"
                        >
                          {currentBarangayClaim.claimant}
                        </button>
                      </span>
                    )
                  ) : (
                    <span className="text-blue-600">Available to claim</span>
                  )}
                </div>
              )}

                {/* Top-3 most vulnerable unclaimed barangays (live) - now sorted by proxy score */}
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2">Top vulnerable unclaimed barangays</h4>
                  <div className="space-y-2">
                    {topUnclaimed.length === 0 ? (
                      <div className="text-xs text-gray-500">Loading or none available</div>
                    ) : (
                      topUnclaimed.map((t) => {
                        const score = Number(t.proxy ?? 0);
                        const pct = Math.round(score * 100);
                        const label = score >= 0.75 ? 'Very High' : score >= 0.5 ? 'High' : score >= 0.25 ? 'Medium' : 'Low';
                        return (
                          <button
                            key={t.adm4_pcode}
                            onClick={() => {
                              setSearchQuery(t.adm4_pcode);
                              setSelectedBarangay(t.adm4_pcode);
                              // compute explain immediately so the table appears without waiting
                              computeExplain(t.adm4_pcode);
                              // attempt to focus map
                              const matched = displayCenters.find((d) => (d.adm4_pcode || '').toLowerCase() === (t.adm4_pcode || '').toLowerCase());
                              if (matched) {
                                setMapCenter({ lat: matched.lat, lon: matched.lon });
                                setMapZoom(18);
                                flyToWithOffset(matched.lat, matched.lon, 18, [0, -120]);
                              }
                            }}
                            className="w-full text-left p-2 bg-white rounded border hover:bg-gray-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium text-sm">{t.adm4_pcode}</div>
                              <div className="text-xs text-gray-500">Risk: {label}</div>
                            </div>
                            <div className="text-sm font-semibold text-red-600">{pct}%</div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
            </div>
          </div>

          {}

          <p className="font-extrabold text-2xl md:text-3xl text-black tracking-tight mb-3">
            Legend
          </p>


          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { key: 'barangays', label: 'Barangay', color: '#2563eb', desc: 'Target local communities', shape: 'circle' },
              { key: 'typhoon', label: 'Typhoon track', color: '#0ea5e9', desc: 'Forecast path', shape: 'line' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setVisibleLayers(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`flex items-center gap-3 p-2 rounded hover:bg-gray-100 text-left ${!visibleLayers[item.key] ? 'opacity-50' : ''}`}
              >
                {item.shape === 'line' ? (
                  <span
                    className="inline-block mr-2"
                    style={{
                      background: item.color,
                      height: '4px',
                      width: '28px',
                      borderRadius: '2px',
                      boxShadow: `0 0 6px ${item.color}33`
                    }}
                  />
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full mr-2" style={{ background: item.color, border: '1px solid white' }} />
                )}
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-gray-600">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Vulnerability ranking tab (small) - appears after Legend */}
          <div className="mb-6">
            <div className="bg-white rounded-lg p-3 border shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Vulnerability Ranking</div>
                <div className="text-xs text-gray-500">Model</div>
              </div>
              {selectedBarangay ? (
                (() => {
                  const r = riskMap[selectedBarangay] || riskMap[selectedBarangay.toUpperCase()];
                  if (!r) return <div className="text-xs text-gray-500">No ranking available for {selectedBarangay}</div>;
                  const labels = ['Low', 'Medium', 'High', 'Very High'];
                  const colors = ['#10b981', '#f59e0b', '#ef4444', '#7f1d1d'];
                  const lvl = Number(r.level) || 0;
                  const proxy = (typeof r.proxy === 'number') ? r.proxy : (lvl / 3);
                  const pct = Math.round((proxy || 0) * 100);
                  const labelText = proxy >= 0.75 ? 'Very High' : proxy >= 0.5 ? 'High' : proxy >= 0.25 ? 'Medium' : 'Low';
                  return (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{selectedBarangay}</div>
                        <div className="text-xs text-gray-600">Score: {pct}% — {labelText}</div>
                        {/* Show classifier prediction confidence explanation if we have meta */}
                        {riskModelMeta && (typeof riskModelMeta.rf_n_estimators === 'number') && (
                          <div className="text-xs text-gray-600">Model confidence: {(r.confidence || 0).toFixed(2)} — this means approximately <strong>{Math.round((r.confidence || 0) * (riskModelMeta.rf_n_estimators || 200))}</strong> out of <strong>{riskModelMeta.rf_n_estimators}</strong> trees voted for this class.</div>
                        )}
                      </div>
                      <div className="text-white px-3 py-1 rounded" style={{ background: colors[lvl] || '#6b7280' }}>{pct}%</div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-xs text-gray-500">Select a barangay to view its ranking.</div>
              )}
            </div>
          </div>

          {/* Explainability: show how the ranking was computed for selected barangay */}
          {explain && (
            <div className="mb-6">
              <div className="bg-white border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">How Ranking Was Computed</div>
                  <div className="text-xs text-gray-500">Proxy model</div>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <div className="font-medium">Proxy score (normalized): <span className="ml-1">{Math.round((explain.proxy || 0) * 100)}% <span className="text-xs text-gray-500">({(explain.proxy || 0).toFixed(3)})</span></span></div>
                  <div className="text-sm mt-1">Label: <span className="font-semibold">{explain.label}</span></div>
                </div>
                {/* Show note if model metadata lists dropped constant features */}
                {riskModelMeta && Array.isArray(riskModelMeta.dropped_constant_features) && riskModelMeta.dropped_constant_features.length > 0 && (
                  <div className="mb-2 text-xs text-gray-600">
                    <div className="font-medium">Note:</div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500">
                        <th className="pb-1">Factor</th>
                        <th className="pb-1">Value</th>
                        <th className="pb-1">Scaled (0–1)</th>
                        <th className="pb-1">Importance</th>
                        <th className="pb-1">Effect on score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {explain.features.map(f => (
                        <tr key={f.name} className="border-t">
                          <td className="py-2 align-top">{featureFriendlyLabels[f.name] || f.name.replace(/_/g, ' ')}</td>
                          <td className="py-2 align-top">{Number(f.raw).toFixed(2)}</td>
                          <td className="py-2 align-top">{Number(f.norm).toFixed(3)}</td>
                          <td className="py-2 align-top">{Number(f.weight).toFixed(3)}</td>
                          <td className="py-2 align-top font-medium">
                            <div>{Number(f.contrib).toFixed(3)}</div>
                            <div className="text-xs text-gray-500">{Number(f.weight).toFixed(3)} × {Number(f.norm).toFixed(3)} = {Number((f.weight || 0) * (f.norm || 0)).toFixed(3)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  <div className="font-medium text-sm">Quick guide (plain English):</div>
                  <ul className="text-xs text-gray-600 list-disc pl-5 mt-1">
                    <li><strong>Value:</strong> the original measurement (e.g., population, wealth index).</li>
                    <li><strong>Scaled (0–1):</strong> we convert different measurements to a common 0–1 range so they can be compared (1 means more risk).</li>
                    <li><strong>Importance:</strong> how much this factor matters (bigger = more influence).</li>
                    <li><strong>Effect on score:</strong> what this factor adds to the total risk (Importance × Scaled).</li>
                  </ul>
                  <div className="text-xs text-gray-500 mt-2">How the score is computed: we add up all the "Effect on score" numbers to get the proxy score (a number between 0 and 1), then map that to a label: Low / Medium / High / Very High.</div>
                </div>
                {explain.raw != null && (
                  <div className="text-xs text-gray-500 mt-2">
                    Raw weighted sum (pre-normalization): <span className="font-mono">{Number(explain.raw).toFixed(3)}</span>
                    {riskModelMeta && (riskModelMeta.proxy_raw_min != null) && (riskModelMeta.proxy_raw_max != null) && (
                      <div className="mt-1">Normalization: <span className="font-mono">(raw - {Number(riskModelMeta.proxy_raw_min).toFixed(3)}) / ({Number(riskModelMeta.proxy_raw_max).toFixed(3)} - {Number(riskModelMeta.proxy_raw_min).toFixed(3)})</span> =&nbsp;
                        <span className="font-mono">{(((Number(explain.raw) - Number(riskModelMeta.proxy_raw_min)) / Math.max(1e-9, (Number(riskModelMeta.proxy_raw_max) - Number(riskModelMeta.proxy_raw_min))))).toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Plain-language summary: show top contributors in simple English */}
                {explain && explain.features && explain.features.length > 0 && (
                  (() => {
                    const sorted = [...explain.features].sort((a, b) => (b.contrib || 0) - (a.contrib || 0));
                    const top = sorted.slice(0, 3).map(s => featureFriendlyLabels[s.name] || s.name.replace(/_/g, ' '));
                    const sentence = `${explain.label} risk mainly because of ${humanJoin(top)}.`;
                    return (<div className="mt-2 text-sm text-gray-700 font-medium">{sentence}</div>);
                  })()
                )}
              </div>
            </div>
          )}


          {/* Prediction and Needs sections removed as requested. */}


          {/* Duplicate bottom prediction removed — only the top prediction panel is shown */}


        </div>
      </div>

      {/* Claim Limit Error Modal */}
      {showClaimLimitModal && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowClaimLimitModal(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl mx-4
                       transform transition-all duration-300 ease-out scale-100 opacity-100"
            onClick={(e) => e.stopPropagation()}
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              position: "absolute",
            }}
          >
            <div className="text-center">
              <div className="mb-4 text-4xl">⚠️</div>
              <h3 className="text-xl font-bold mb-4 text-gray-900">Claim Limit Reached</h3>
              <p className="text-base text-gray-700 leading-relaxed mb-6">
                To ensure all barangays get the help they need, we limit users to only help one at a time. Thank you for your continuous efforts in helping those in need.
              </p>
              <button
                onClick={() => setShowClaimLimitModal(false)}
                className="w-full px-6 py-3 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};