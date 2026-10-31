import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Deterministic PRNG — every frame must render identically. */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 0 -> 1 over `frames`, eased. */
export const progress = (frame: number, start: number, frames: number) =>
  Math.max(0, Math.min(1, (frame - start) / Math.max(1, frames)));

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Spring that starts at `delay`. */
export const useSpringIn = (delay = 0, config: { damping?: number; mass?: number; stiffness?: number } = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.7, stiffness: 90, ...config },
  });
};

/** Rise-and-fade entrance, ready to spread into a style object. */
export const useRise = (delay = 0, distance = 40) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6, stiffness: 90 } });
  const o = Math.min(1, Math.max(0, (frame - delay) / 8));
  return {
    opacity: o * Math.min(1, s * 1.4),
    transform: `translateY(${(1 - s) * distance}px)`,
  };
};
