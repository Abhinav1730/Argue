"use client";
import { useEffect, useRef } from "react";
export function Waveform({
  active = true,
  seed = 1,
  analyser,
  wide = false,
}: {
  active?: boolean;
  seed?: number;
  analyser?: AnalyserNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let time = 0;
    let visible = true;
    const values = new Uint8Array(analyser?.frequencyBinCount || 128);
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio, 2);
      if (
        canvas.width !== Math.round(rect.width * dpr) ||
        canvas.height !== Math.round(rect.height * dpr)
      ) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (analyser) analyser.getByteFrequencyData(values);
      const bars = Math.floor(rect.width / (wide ? 9 : 8));
      const gap = rect.width / (bars - 1);
      time += motion.matches ? 0 : 0.025;
      for (let i = 0; i < bars; i++) {
        const x = i / (bars - 1);
        const peaks =
          Math.exp(-((x - 0.31) ** 2) / 0.0015) +
          0.85 * Math.exp(-((x - 0.55) ** 2) / 0.002) +
          0.35 * Math.exp(-((x - 0.73) ** 2) / 0.0008);
        const ripple = 0.46 + 0.54 * Math.abs(Math.sin(i * 1.7 + seed + time));
        let amp = active
          ? 3 + peaks * ripple * rect.height * 0.8
          : 2 + peaks * rect.height * 0.15;
        if (analyser)
          amp =
            2 +
            (values[
              Math.min(values.length - 1, Math.floor(x * values.length * 0.6))
            ] /
              255) *
              (rect.height - 4);
        const grey = wide && (x < 0.22 || x > 0.76);
        ctx.fillStyle = active && !grey ? "#c6fa46" : "#747874";
        ctx.shadowColor = "#c6fa46";
        ctx.shadowBlur = active && !grey ? 4 : 0;
        ctx.fillRect(i * gap, rect.height / 2 - amp / 2, 2, amp);
      }
      if (!motion.matches && visible) frame = requestAnimationFrame(draw);
    };
    const resize = new ResizeObserver(() => {
      if (motion.matches) draw();
    });
    resize.observe(canvas);
    const update = () => {
      cancelAnimationFrame(frame);
      draw();
    };
    motion.addEventListener("change", update);
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) draw();
    });
    observer.observe(canvas);
    draw();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      motion.removeEventListener("change", update);
    };
  }, [active, seed, analyser, wide]);
  return (
    <canvas
      ref={ref}
      className={wide ? "waveform wide-wave" : "waveform"}
      aria-hidden="true"
    />
  );
}
