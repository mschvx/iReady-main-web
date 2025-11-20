import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in react-leaflet
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = icon;

interface PhilippinesMapProps {
  className?: string;
}

export const PhilippinesMap: React.FC<PhilippinesMapProps> = ({ className = '' }) => {
  // Center of the Philippines (approximately Manila)
  const philippinesCenter: [number, number] = [12.8797, 121.7740];
  const zoom = 6;

  // --- Typhoon track data (simple sample path across PH) ---
  // Order: from southeast (Pacific) moving northwest.
  const trackPoints = useMemo<readonly [number, number][]>(() => [
    [10.0, 135.5],
    [10.2, 132.0],
    [10.4, 129.0],
    [10.6, 126.2],
    [11.0, 123.8], // approaching E. Visayas
    [11.8, 122.2], // crossing Visayas
    [12.8, 121.0], // near Mindoro
    [13.7, 120.1], // S. Luzon / Mindoro Strait
    [14.8, 119.2], // W of Luzon
  ], []);

  // Animation state for moving marker along the path
  const [animPos, setAnimPos] = useState<[number, number]>(trackPoints[0]);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  
  // Geographic helpers: destination point given distance and bearing
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const destPoint = (lat: number, lon: number, distanceMeters: number, bearingDeg: number): [number, number] => {
    const R = 6371000; // Earth radius meters
    const δ = distanceMeters / R; // angular distance
    const θ = toRad(bearingDeg);
    const φ1 = toRad(lat);
    const λ1 = toRad(lon);
    const sinφ1 = Math.sin(φ1);
    const cosφ1 = Math.cos(φ1);
    const sinδ = Math.sin(δ);
    const cosδ = Math.cos(δ);
    const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
    const φ2 = Math.asin(sinφ2);
    const y = Math.sin(θ) * sinδ * cosφ1;
    const x = cosδ - sinφ1 * sinφ2;
    const λ2 = λ1 + Math.atan2(y, x);
    return [toDeg(φ2), ((toDeg(λ2) + 540) % 360) - 180];
  };

  const nowRef = useRef(0);
  const [progressAlongPath, setProgressAlongPath] = useState(0); // 0 to 1

  useEffect(() => {
    // Precompute segment lengths for time weighting
    const segLen: number[] = [];
    let total = 0;
    for (let i = 0; i < trackPoints.length - 1; i++) {
      const a = trackPoints[i];
      const b = trackPoints[i + 1];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segLen.push(d);
      total += d;
    }
    const segDur = segLen.map((d) => (d / total) * 14000); // total ~14s per loop
    const totalDuration = segDur.reduce((a, b) => a + b, 0);

    const loop = (now: number) => {
      if (!startRef.current) startRef.current = now;
      nowRef.current = now;
      const elapsed = (now - startRef.current) % totalDuration;
      const progress = elapsed / totalDuration; // 0 to 1
      setProgressAlongPath(progress);
      
      // Find which segment we're in
      let acc = 0;
      let idx = 0;
      for (; idx < segDur.length; idx++) {
        if (elapsed < acc + segDur[idx]) break;
        acc += segDur[idx];
      }
      const t = Math.min(1, (elapsed - acc) / segDur[idx]);
      const a = trackPoints[idx];
      const b = trackPoints[(idx + 1) % trackPoints.length];
      const lat = a[0] + (b[0] - a[0]) * t;
      const lon = a[1] + (b[1] - a[1]) * t;
      setAnimPos([lat, lon]);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = 0;
    };
  }, [trackPoints]);

  // Compute pulsing ring radii/opacity from time
  const GREY = '#374151'; // Tailwind gray-700 (darker, more visible)
  const GREY_DARK = '#111827'; // gray-900 for stroke
  
  // Growth factor based on progress (0.3 at start, 1.0 at end)
  const growthFactor = 0.3 + progressAlongPath * 0.7;
  
  const pulsePeriod = 1200; // ms per pulse (faster for windy effect)
  const phase = ((nowRef.current % pulsePeriod) / pulsePeriod) || 0;
  const r1 = (10 + 24 * phase) * growthFactor; // apply growth to pulsing rings
  const a1 = 0.75 * (1 - phase); // stronger visibility
  const phase2 = (phase + 0.25) % 1;
  const r2 = (10 + 24 * phase2) * growthFactor; // apply growth
  const a2 = 0.68 * (1 - phase2);
  const phase3 = (phase + 0.5) % 1;
  const r3 = (10 + 24 * phase3) * growthFactor; // apply growth
  const a3 = 0.60 * (1 - phase3);
  const phase4 = (phase + 0.75) % 1;
  const r4 = (10 + 24 * phase4) * growthFactor; // apply growth
  const a4 = 0.52 * (1 - phase4);
  // dash offsets to visually "rotate" the circles
  const dashOffset1 = `${-((nowRef.current / 12) % 120)}px`; // faster rotation
  const dashOffset2 = `${((nowRef.current / 15) % 120)}px`;
  const dashOffset3 = `${-((nowRef.current / 18) % 120)}px`;
  const dashOffset4 = `${((nowRef.current / 21) % 120)}px`;

  // Static forecast radii (meters) around center, plus dashed spokes
  const radiiMeters = [80000 * growthFactor, 150000 * growthFactor, 220000 * growthFactor]; // grow with progress
  
  // Pulsing effect for outer circles too
  const outerPulse = Math.abs(Math.sin((nowRef.current / 800) * Math.PI)); // 0-1 pulse
  const outerOpacityBoost = 0.15 + outerPulse * 0.25; // 0.15-0.40 boost

  // Add rotation to forecast circles as well
  const circleRotation = ((nowRef.current / 1000) * 20) % 360; // 20 deg/sec for circles
  
  const spokes = useMemo(() => {
    const [lat, lon] = animPos;
    const L = 220000 * growthFactor; // 220 km spokes - grow with progress
    const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
    // Add rotation to outer spokes
    const rot = ((nowRef.current / 1000) * 30) % 360; // 30 deg/sec rotation
    return bearings.map((b) => {
      const ang = (b + rot) % 360;
      return [[lat, lon], destPoint(lat, lon, L, ang)] as [number, number][];
    });
  }, [animPos, nowRef.current, growthFactor]);

  // Rotating "wheel" spokes close to the center (rotate while moving)
  const wheelSpokes = (() => {
    const [lat, lon] = animPos;
    const L = 70000 * growthFactor; // 70 km per spoke (inner wheel) - grow with progress
    const base = [0, 45, 90, 135, 180, 225, 270, 315]; // 8 spokes for more density
    const speedDegPerSec = 60; // faster rotation speed
    const rot = ((nowRef.current / 1000) * speedDegPerSec) % 360;
    return base.map((b) => {
      const ang = (b + rot) % 360;
      return [[lat, lon], destPoint(lat, lon, L, ang)] as [number, number][];
    });
  })();

  return (
    <MapContainer
      center={philippinesCenter}
      zoom={zoom}
      scrollWheelZoom={true}
      className={`${className} rounded-3xl overflow-hidden`}
      style={{ height: '100%', width: '100%', minHeight: '400px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={philippinesCenter}>
        <Popup>
          Philippines
        </Popup>
      </Marker>

      {/* Forecast-style track line (solid for past/current, dashed for forecast) */}
      {/* Glow effect layers */}
      <Polyline
        positions={trackPoints as [number, number][]}
        pathOptions={{ 
          color: '#93c5fd', 
          weight: 8 + outerPulse * 4, 
          opacity: 0.15 + outerPulse * 0.15 
        }}
      />
      <Polyline
        positions={trackPoints as [number, number][]}
        pathOptions={{ 
          color: '#60a5fa', 
          weight: 5 + outerPulse * 2, 
          opacity: 0.25 + outerPulse * 0.2 
        }}
      />
      <Polyline
        positions={trackPoints as [number, number][]}
        pathOptions={{ 
          color: '#2563eb', 
          weight: 3, 
          opacity: 0.95 
        }}
      />
      {/* Dashed extension beyond last known point to hint forecast cone */}
      <Polyline
        positions={[trackPoints[trackPoints.length - 2], trackPoints[trackPoints.length - 1]] as [number, number][]}
        pathOptions={{ 
          color: '#93c5fd', 
          weight: 8 + outerPulse * 4, 
          opacity: 0.15 + outerPulse * 0.15 
        }}
      />
      <Polyline
        positions={[trackPoints[trackPoints.length - 2], trackPoints[trackPoints.length - 1]] as [number, number][]}
        pathOptions={{ 
          color: '#60a5fa', 
          weight: 5 + outerPulse * 2, 
          opacity: 0.25 + outerPulse * 0.2,
          dashArray: '6 6' 
        }}
      />
      <Polyline
        positions={[trackPoints[trackPoints.length - 2], trackPoints[trackPoints.length - 1]] as [number, number][]}
        pathOptions={{ 
          color: '#2563eb', 
          weight: 3, 
          opacity: 0.95, 
          dashArray: '6 6' 
        }}
      />

      {/* Storm center with pulsing forecast rings (grey theme) */}
      {/* Outer glow layers for cloudy effect - scaled by growth */}
      <CircleMarker center={animPos} radius={(8 + outerPulse * 6) * growthFactor} pathOptions={{ color: '#9ca3af', weight: 3, opacity: 0.12 + outerPulse * 0.12, fillOpacity: 0 }} />
      <CircleMarker center={animPos} radius={(6 + outerPulse * 4) * growthFactor} pathOptions={{ color: '#6b7280', weight: 2, opacity: 0.18 + outerPulse * 0.15, fillOpacity: 0 }} />
      
      <CircleMarker center={animPos} radius={5 * growthFactor} pathOptions={{ color: GREY_DARK, fillColor: GREY, fillOpacity: 0.95, weight: 2 }}>
        <Popup>Storm center (simulated)</Popup>
      </CircleMarker>
      
      {/* Pulsing inner rings with glow - r1-r4 already include growthFactor */}
      <CircleMarker center={animPos} radius={r1 + 4 * growthFactor} pathOptions={{ color: GREY, weight: 3, opacity: a1 * 0.3, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset1 }} />
      <CircleMarker center={animPos} radius={r1} pathOptions={{ color: GREY, weight: 2.5, opacity: a1, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset1 }} />
      
      <CircleMarker center={animPos} radius={r2 + 4 * growthFactor} pathOptions={{ color: GREY, weight: 3, opacity: a2 * 0.3, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset2 }} />
      <CircleMarker center={animPos} radius={r2} pathOptions={{ color: GREY, weight: 2.5, opacity: a2, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset2 }} />
      
      <CircleMarker center={animPos} radius={r3 + 4 * growthFactor} pathOptions={{ color: GREY, weight: 3, opacity: a3 * 0.3, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset3 }} />
      <CircleMarker center={animPos} radius={r3} pathOptions={{ color: GREY, weight: 2.5, opacity: a3, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset3 }} />
      
      <CircleMarker center={animPos} radius={r4 + 4 * growthFactor} pathOptions={{ color: GREY, weight: 3, opacity: a4 * 0.3, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset4 }} />
      <CircleMarker center={animPos} radius={r4} pathOptions={{ color: GREY, weight: 2.5, opacity: a4, fillOpacity: 0, dashArray: '6 8', dashOffset: dashOffset4 }} />

      {/* Meter-based forecast circles (scale with zoom) - with glow layers */}
      {radiiMeters.map((rad, i) => (
        <React.Fragment key={`ring-group-${i}`}>
          <Circle
            center={animPos}
            radius={rad + 15000 * growthFactor}
            pathOptions={{ 
              color: '#6b7280', 
              weight: 6 + outerPulse * 2, 
              opacity: 0.08 + outerPulse * 0.08, 
              fillOpacity: 0.03 + outerPulse * 0.03, 
              dashArray: '8 10', 
              dashOffset: `${-((circleRotation + i * 60) % 360) * 3}px` // rotating dash pattern
            }}
          />
          <Circle
            center={animPos}
            radius={rad}
            pathOptions={{ 
              color: GREY_DARK, 
              weight: 3 + outerPulse * 0.5, 
              opacity: 0.65 - i * 0.08 + outerOpacityBoost, 
              fillOpacity: 0.10 + outerPulse * 0.05, 
              dashArray: '8 10', 
              dashOffset: `${-((circleRotation + i * 60) % 360) * 3}px` // rotating dash pattern
            }}
          />
        </React.Fragment>
      ))}
      {/* Dashed radial spokes with glow */}
      {spokes.map((seg, i) => (
        <React.Fragment key={`spoke-group-${i}`}>
          <Polyline 
            positions={seg} 
            pathOptions={{ 
              color: '#6b7280', 
              weight: 4 + outerPulse * 0.8, 
              opacity: 0.12 + outerOpacityBoost * 0.4, 
              dashArray: '4 6' 
            }} 
          />
          <Polyline 
            positions={seg} 
            pathOptions={{ 
              color: GREY_DARK, 
              weight: 2 + outerPulse * 0.3, 
              opacity: 0.60 + outerOpacityBoost * 0.8, 
              dashArray: '4 6' 
            }} 
          />
        </React.Fragment>
      ))}

      {/* Rotating inner wheel spokes with glow */}
      {wheelSpokes.map((seg, i) => (
        <React.Fragment key={`wheel-group-${i}`}>
          <Polyline 
            positions={seg} 
            pathOptions={{ 
              color: '#4b5563', 
              weight: 5 + outerPulse * 1, 
              opacity: 0.15 + outerPulse * 0.12 
            }} 
          />
          <Polyline 
            positions={seg} 
            pathOptions={{ 
              color: GREY_DARK, 
              weight: 2.5 + outerPulse * 0.5, 
              opacity: 0.85 + outerPulse * 0.15 
            }} 
          />
        </React.Fragment>
      ))}
    </MapContainer>
  );
};
