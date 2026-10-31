import React from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORS } from '../theme';
import { seeded } from '../lib/anim';

const rand = seeded(20240311);
const STARS = Array.from({ length: 130 }, () => ({
  x: rand(),
  y: rand(),
  r: 0.7 + rand() * 2.1,
  o: 0.18 + rand() * 0.62,
  speed: 0.004 + rand() * 0.014,
  phase: rand() * Math.PI * 2,
  depth: 0.3 + rand() * 0.7,
}));

type Props = {
  /** Adds a slow drift so star fields never look frozen. */
  frame?: number;
  /** Extra tint for scenes that need a different mood. */
  tint?: string;
  grid?: boolean;
};

export const Backdrop: React.FC<Props> = ({ frame = 0, tint, grid = true }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% -10%, ${tint ?? COLORS.glowBlue} 0%, rgba(4,6,14,0) 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(90% 60% at 50% 112%, ${COLORS.glowCyan} 0%, rgba(4,6,14,0) 60%)`,
        }}
      />

      {STARS.map((star, i) => {
        const drift = (frame * star.speed) % 1;
        const y = ((star.y + drift) % 1) * 1920;
        const twinkle = 0.62 + 0.38 * Math.sin(frame * 0.05 + star.phase);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: star.x * 1080 + Math.sin(frame * 0.008 + star.phase) * 6 * star.depth,
              top: y,
              width: star.r * 2,
              height: star.r * 2,
              borderRadius: '50%',
              backgroundColor: i % 9 === 0 ? COLORS.cyan : '#DCE8FF',
              opacity: star.o * twinkle,
              boxShadow: star.r > 2 ? '0 0 12px rgba(180,215,255,0.7)' : undefined,
            }}
          />
        );
      })}

      {grid ? (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(to right, rgba(120,150,200,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(120,150,200,0.055) 1px, transparent 1px)`,
            backgroundSize: '108px 108px',
            maskImage: 'radial-gradient(80% 60% at 50% 42%, black 20%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(80% 60% at 50% 42%, black 20%, transparent 78%)',
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          background:
            'radial-gradient(75% 55% at 50% 45%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
