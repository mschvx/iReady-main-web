import React, { useEffect, useRef } from "react";

/**
 * TyphoonAnimation
 * - Canvas overlay that renders animated spiral isobars (weather forecast-style lines)
 * - Lightweight, no external deps. Uses requestAnimationFrame and a throttled 30 FPS loop.
 * - Pointer-events disabled so it won't block map or UI interactions.
 */
export const TyphoonAnimation: React.FC<{
  className?: string;
  lineColor?: string;      // CSS color for isobars
  windColor?: string;      // CSS color for moving wind streaks
  intensity?: number;      // 0..1 density/strength
}> = ({ className = "", lineColor = "rgba(255,255,255,0.6)", windColor = "rgba(135,206,250,0.85)", intensity = 0.7 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(240, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    // Animation state
    let last = 0;
    let t = 0; // time
    const targetFps = 30;
    const frameTime = 1000 / targetFps;

    // Wind particles
    type P = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number };
    const particles: P[] = [];
    const particleCountBase = Math.floor(60 + 120 * intensity);

    const seedRand = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    const rand = seedRand(123456);

    const resetParticle = (p: P) => {
      p.x = rand() * w;
      p.y = rand() * h;
      // wind field roughly tangential around center
      const cx = w * 0.55 + Math.sin(t * 0.0003) * 20;
      const cy = h * 0.55 + Math.cos(t * 0.00025) * 16;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const r = Math.max(12, Math.hypot(dx, dy));
      // perpendicular vector (rotate 90deg)
      const tx = -dy / r;
      const ty = dx / r;
      const speed = 0.5 + 1.5 * intensity * (0.5 + rand());
      p.vx = tx * speed;
      p.vy = ty * speed;
      p.life = 0;
      p.maxLife = 40 + Math.floor(rand() * 60);
      return p;
    };

    for (let i = 0; i < particleCountBase; i++) {
      particles.push(resetParticle({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0 } as P));
    }

    const drawIsobars = (now: number) => {
      // Spiral isobars: r = a + b*theta, render multiple arms
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w * 0.55, h * 0.55);

      const rot = (now * 0.00015) % (Math.PI * 2);
      const arms = 4;
      const a = 6;                       // base radius
      const b = 1.75 + intensity * 1.25; // spiral growth
      const rings = 9;                    // set of isobar families

      for (let rIndex = 0; rIndex < rings; rIndex++) {
        const phase = rIndex * 0.45 + Math.sin(now * 0.0003 + rIndex) * 0.08;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.45 - rIndex * 0.03;

        for (let k = 0; k < arms; k++) {
          ctx.beginPath();
          const armRot = rot + (k * Math.PI * 2) / arms + phase;
          let started = false;
          for (let th = 0; th < 9.5; th += 0.03) {
            const rr = (a + b * th) * (6 + intensity * 6);
            const x = Math.cos(th + armRot) * rr;
            const y = Math.sin(th + armRot) * rr;
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const drawWind = () => {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = windColor;
      ctx.lineWidth = 1.25;
      for (const p of particles) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
        ctx.stroke();
      }
      ctx.restore();
    };

    const stepWind = () => {
      const cx = w * 0.55 + Math.sin(t * 0.0003) * 20;
      const cy = h * 0.55 + Math.cos(t * 0.00025) * 16;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        // Recompute tangential wind a bit so they arc
        const dx = p.x - cx;
        const dy = p.y - cy;
        const r = Math.max(12, Math.hypot(dx, dy));
        const tx = -dy / r;
        const ty = dx / r;
        const speed = 0.45 + 1.25 * intensity;
        p.vx = 0.9 * p.vx + 0.1 * (tx * speed);
        p.vy = 0.9 * p.vy + 0.1 * (ty * speed);
        if (p.life > p.maxLife || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50) {
          resetParticle(p);
        }
      }
    };

    const loop = (now: number) => {
      if (!last) last = now;
      const dt = now - last;
      if (dt >= frameTime) {
        last = now - (dt % frameTime);
        t += dt;
        drawIsobars(now);
        stepWind();
        drawWind();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [intensity, lineColor, windColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
};

export default TyphoonAnimation;
