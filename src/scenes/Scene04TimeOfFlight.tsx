import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { Satellite } from '../components/Satellite';
import { Scene } from '../components/Scene';
import { CLAMP, easeOut, useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

const PATH = { left: 168, right: 862, y: 878 };

/**
 * 04 — Speed of light does the measuring: a delay of 67 ms is 20,200 km.
 */
export const Scene04TimeOfFlight: React.FC = () => {
  const frame = useCurrentFrame();

  // The pulse leaves at frame 30 and lands at frame 96.
  const travel = easeOut(Math.min(1, Math.max(0, (frame - 30) / 66)));
  const seconds = travel * 0.0674;

  const eq = useRise(4, 26);
  const result = useRise(78, 24);
  const ruler = useRise(92, 18);

  const pulseX = PATH.left + (PATH.right - PATH.left) * travel;
  const ticks = Array.from({ length: 21 }, (_, i) => i);

  return (
    <Scene
      audio="audio/scene-04.mp3"
      caption="Your phone times the signal. Sixty-seven milliseconds means twenty thousand kilometres, and that distance draws one perfect circle around the satellite."
      accent={COLORS.cyan}
      chapter={{ index: '04', title: 'Time of flight' }}
    >
      <div style={{ ...eq, position: 'absolute', top: 268, left: 72, right: 72 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 168,
              fontWeight: 800,
              letterSpacing: '-0.055em',
              color: COLORS.ink,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 0.95,
            }}
          >
            {seconds.toFixed(3)}
          </span>
          <span style={{ ...mono(52, 600, { color: COLORS.muted, letterSpacing: '0.02em', textTransform: 'none' }) }}>s</span>
        </div>
        <div style={{ marginTop: 22, ...mono(28, 500, { color: COLORS.muted, letterSpacing: '0.06em' }) }}>
          × SPEED OF LIGHT, 299,792 km/s
        </div>
      </div>

      <div style={{ ...result, position: 'absolute', top: 596, left: 72, right: 72, display: 'flex', alignItems: 'baseline', gap: 20 }}>
        <span style={mono(52, 500, { color: COLORS.faint, letterSpacing: '0.04em', textTransform: 'none' })}>=</span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 124,
            fontWeight: 800,
            letterSpacing: '-0.05em',
            color: COLORS.cyan,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          20,200 km
        </span>
      </div>

      {/* signal path */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <line
          x1={PATH.left}
          y1={PATH.y}
          x2={PATH.right}
          y2={PATH.y}
          stroke="rgba(140,160,196,0.35)"
          strokeWidth={2}
          strokeDasharray="8 12"
        />
        <circle cx={pulseX} cy={PATH.y} r={13} fill={COLORS.cyan} />
        <circle cx={pulseX} cy={PATH.y} r={30} fill="none" stroke={COLORS.cyan} strokeWidth={2} opacity={0.45} />
        <circle cx={PATH.right} cy={PATH.y} r={14} fill={COLORS.ink} />
        <circle cx={PATH.right} cy={PATH.y} r={32} fill="none" stroke={COLORS.amber} strokeWidth={2.5} opacity={0.85} />
      </svg>

      <div style={{ position: 'absolute', left: 52, top: 728 }}>
        <Satellite size={110} frame={frame} beam beamAngle={135} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 842, ...mono(19, 500, { color: COLORS.muted, letterSpacing: '0.2em' }) }}>
        SATELLITE
      </div>
      <div
        style={{
          position: 'absolute',
          left: PATH.right - 78,
          top: PATH.y + 30,
          ...mono(20, 500, { color: COLORS.amber, letterSpacing: '0.2em' }),
        }}
      >
        YOUR PHONE
      </div>

      {/* distance ruler */}
      <div style={{ ...ruler, position: 'absolute', top: 1010, left: 72, right: 72, height: 120 }}>
        <div style={{ position: 'absolute', top: 26, left: 0, right: 0, height: 2, background: COLORS.line }} />
        {ticks.map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: i % 5 === 0 ? 12 : 18,
              left: `${(i / (ticks.length - 1)) * 100}%`,
              width: 2,
              height: i % 5 === 0 ? 30 : 16,
              background: i % 5 === 0 ? 'rgba(140,160,196,0.55)' : 'rgba(140,160,196,0.3)',
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 0,
            width: `${interpolate(travel, [0, 1], [0, 100], CLAMP)}%`,
            height: 9,
            borderRadius: 6,
            background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.cyan})`,
            boxShadow: '0 0 26px rgba(79,227,255,0.55)',
          }}
        />
        <div style={{ position: 'absolute', top: 82, left: 0, ...mono(19, 500, { color: COLORS.faint, letterSpacing: '0.18em' }) }}>
          0 km
        </div>
        <div style={{ position: 'absolute', top: 82, right: 0, ...mono(19, 500, { color: COLORS.faint, letterSpacing: '0.18em' }) }}>
          20,200 km
        </div>
      </div>
    </Scene>
  );
};
