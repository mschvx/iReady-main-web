import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * LiveUpdates
 * - Small, constantly changing storm metrics panel
 * - Values drift with a constrained random walk to feel "live"
 */
export const LiveUpdates: React.FC<{ className?: string }>
= ({ className = "" }) => {
  type Metric = { label: string; unit: string; value: number; min: number; max: number; step: number };
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: "Wind speed", unit: "kph", value: 85, min: 40, max: 220, step: 4 },
    { label: "Gusts", unit: "kph", value: 110, min: 60, max: 260, step: 6 },
    { label: "Central pressure", unit: "hPa", value: 980, min: 910, max: 1015, step: 2 },
    { label: "Rainfall", unit: "mm/hr", value: 18, min: 0, max: 80, step: 3 },
    { label: "Movement", unit: "km/h", value: 22, min: 5, max: 45, step: 2 },
  ]);

  // Every ~1.2s, nudge values
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(prev => prev.map((m, i) => {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const jitter = (Math.random() * m.step) * dir;
        let next = Number((m.value + jitter).toFixed(0));
        if (next < m.min) next = m.min + Math.random() * m.step;
        if (next > m.max) next = m.max - Math.random() * m.step;
        // keep pressure inverse to wind a bit
        if (m.label === "Central pressure") {
          const wind = prev[0].value;
          const target = 1005 - (wind - 60) * 0.6; // lower with higher wind
          next = Math.round(next * 0.6 + target * 0.4);
        }
        return { ...m, value: next };
      }));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // Randomized headline changing every ~6s
  const [headlineIdx, setHeadlineIdx] = useState(0);
  const headlines = useMemo(() => [
    "Model indicates intensification over warm waters",
    "Outer rainbands moving closer to coast",
    "Track confidence cone narrowing in next 12 hours",
    "Increasing gusts recorded by coastal stations",
  ], []);
  useEffect(() => {
    const id = setInterval(() => setHeadlineIdx(i => (i + 1) % headlines.length), 6000);
    return () => clearInterval(id);
  }, [headlines.length]);

  return (
    <div className={`rounded-2xl bg-gray-900 text-gray-100 p-4 shadow-lg ${className}`}>
      <div className="text-xs uppercase tracking-wide text-blue-300">Live forecast</div>
      <div className="text-sm font-semibold mt-1 text-white">{headlines[headlineIdx]}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="bg-black/30 rounded-lg p-3 border border-white/10">
            <div className="text-[11px] text-gray-300">{m.label}</div>
            <div className="text-lg font-bold text-white transition-colors">
              {m.value}
              <span className="text-xs font-normal text-gray-300 ml-1">{m.unit}</span>
            </div>
            <div className="w-full h-1 mt-2 bg-white/10 rounded">
              <div className="h-1 bg-blue-400 rounded transition-all" style={{ width: `${((m.value - m.min) / (m.max - m.min)) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-gray-300">
        Updated every ~1.2s • Simulated live data
      </div>
    </div>
  );
};

export default LiveUpdates;
