import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Earth } from '../components/Earth';
import { Satellite } from '../components/Satellite';
import { Scene } from '../components/Scene';
import { useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

const EARTH = { cx: 540, cy: 2700, r: 1500 };
const ORBIT_R = 1840;

const SpecRow: React.FC<{
  k: string;
  v: string;
  delay: number;
  accent?: string;
}> = ({ k, v, delay, accent = COLORS.ink }) => {
  const rise = useRise(delay, 24);
  return (
    <div
      style={{
        ...rise,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 24,
        padding: '14px 0',
        borderBottom: `1.5px solid ${COLORS.line}`,
      }}
    >
      <span style={mono(26, 500, { color: COLORS.muted, letterSpacing: '0.2em' })}>{k}</span>
      <span
        style={{
          ...mono(32, 600, { color: accent, letterSpacing: '0.04em', textTransform: 'none' }),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {v}
      </span>
    </div>
  );
};

/**
 * 02 — The constellation: altitude, period, and the clock that makes it work.
 * The horizon and the orbit are concentric circles, so the altitude dimension
 * is drawn true to the diagram.
 */
export const Scene02Orbit: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = frame * 0.004;

  const headline = useRise(4, 26);

  const satellites = [0, 1, 2, 3, 4].map((i) => {
    const angle = ((262 + i * 4 + drift * 8) * Math.PI) / 180;
    return {
      i,
      x: EARTH.cx + Math.cos(angle) * ORBIT_R,
      y: EARTH.cy + Math.sin(angle) * ORBIT_R,
    };
  });

  const orbitStartX = EARTH.cx + Math.cos((248 * Math.PI) / 180) * ORBIT_R;
  const orbitStartY = EARTH.cy + Math.sin((248 * Math.PI) / 180) * ORBIT_R;
  const orbitEndX = EARTH.cx + Math.cos((292 * Math.PI) / 180) * ORBIT_R;
  const orbitEndY = EARTH.cy + Math.sin((292 * Math.PI) / 180) * ORBIT_R;

  return (
    <Scene
      audio="audio/scene-02.mp3"
      caption="They fly twenty thousand kilometres up, each carrying an atomic clock that will not drift a second in a hundred thousand years."
      chapter={{ index: '02', title: 'The constellation' }}
    >
      {/* horizon + orbit share a centre, so the gap between them is the altitude */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <path
          d={`M ${orbitStartX} ${orbitStartY} A ${ORBIT_R} ${ORBIT_R} 0 0 1 ${orbitEndX} ${orbitEndY}`}
          fill="none"
          stroke="rgba(79,227,255,0.55)"
          strokeWidth={2.5}
        />
        <path
          d={`M ${orbitStartX} ${orbitStartY} A ${ORBIT_R} ${ORBIT_R} 0 0 1 ${orbitEndX} ${orbitEndY}`}
          fill="none"
          stroke="rgba(79,227,255,0.12)"
          strokeWidth={16}
        />
        {/* altitude dimension */}
        <line x1={176} y1={900} x2={176} y2={1236} stroke="rgba(255,181,72,0.65)" strokeWidth={2} strokeDasharray="7 9" />
        <line x1={156} y1={900} x2={196} y2={900} stroke={COLORS.amber} strokeWidth={3} />
        <line x1={156} y1={1236} x2={196} y2={1236} stroke={COLORS.amber} strokeWidth={3} />
      </svg>

      <Earth size={3000} frame={frame} style={{ position: 'absolute', left: -960, top: 1200 }} />

      {satellites.map((s) => (
        <div key={s.i} style={{ position: 'absolute', left: s.x - 44, top: s.y - 44 }}>
          <Satellite size={88} frame={frame + s.i * 20} />
        </div>
      ))}

      <div style={{ position: 'absolute', left: 232, top: 1036, ...mono(26, 600, { color: COLORS.amber, letterSpacing: '0.16em' }) }}>
        20,200 km
      </div>
      <div style={{ position: 'absolute', left: 232, top: 1074, ...mono(20, 500, { color: COLORS.faint, letterSpacing: '0.2em' }) }}>
        ABOVE THE SURFACE
      </div>

      <div style={{ ...headline, position: 'absolute', top: 268, left: 72, right: 72 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 92, fontWeight: 800, letterSpacing: '-0.045em', color: COLORS.ink, lineHeight: 1 }}>
          Flying clocks.
        </div>
      </div>

      <div style={{ position: 'absolute', top: 456, left: 72, right: 72 }}>
        <SpecRow k="ORBIT PERIOD" v="11 h 58 m" delay={16} />
        <SpecRow k="ORBITS PER DAY" v="2" delay={26} />
        <SpecRow k="ON-BOARD CLOCK" v="ATOMIC" delay={36} accent={COLORS.amber} />
        <SpecRow k="CLOCK DRIFT" v="1 s in 100,000 yr" delay={46} accent={COLORS.amber} />
      </div>

    </Scene>
  );
};
