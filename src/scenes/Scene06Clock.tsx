import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Scene } from '../components/Scene';
import { useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

const Unknown: React.FC<{ label: string; delay: number; solved: boolean }> = ({ label, delay, solved }) => {
  const rise = useRise(delay, 18);
  return (
    <div
      style={{
        ...rise,
        width: 128,
        height: 128,
        borderRadius: 22,
        border: `2px solid ${solved ? COLORS.amber : COLORS.line}`,
        background: solved ? 'rgba(255,181,72,0.12)' : 'rgba(8,14,30,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT.mono,
        fontSize: 58,
        fontWeight: 600,
        color: solved ? COLORS.amber : COLORS.muted,
        fontStyle: 'italic',
        boxShadow: solved ? '0 0 44px rgba(255,181,72,0.25)' : undefined,
      }}
    >
      {label}
    </div>
  );
};

/**
 * 06 — The fourth satellite exists because your phone's clock is bad.
 */
export const Scene06Clock: React.FC = () => {
  const frame = useCurrentFrame();
  const wobble = Math.sin(frame * 0.3) * 2;

  const head = useRise(4, 26);
  const card = useRise(22, 24);
  const solve = useRise(96, 22);
  const foot = useRise(150, 18);

  return (
    <Scene
      audio="audio/scene-06.mp3"
      caption="But your phone's clock is cheap. So a fourth satellite solves for time itself. One microsecond of error is three hundred metres of misplacement."
      accent={COLORS.amber}
      chapter={{ index: '06', title: 'The time problem' }}
    >
      <div style={{ ...head, position: 'absolute', top: 268, left: 72, right: 72 }}>
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 86,
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1.02,
            color: COLORS.ink,
          }}
        >
          Your clock is
          <br />
          <span style={{ color: COLORS.amber }}>the weak link.</span>
        </div>
      </div>

      <div
        style={{
          ...card,
          position: 'absolute',
          top: 528,
          left: 72,
          right: 72,
          borderRadius: 26,
          border: `1.5px solid ${COLORS.line}`,
          background: 'rgba(8,14,30,0.8)',
          padding: '34px 32px 30px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={mono(26, 500, { color: COLORS.muted, letterSpacing: '0.18em' })}>1 µs OF DRIFT</span>
          <span style={{ ...mono(28, 600, { color: COLORS.amber, letterSpacing: '0.05em', textTransform: 'none' }) }}>
            0.000001 s
          </span>
        </div>

        <div
          style={{
            margin: '22px 0',
            height: 2,
            background: `linear-gradient(90deg, ${COLORS.amber}00, ${COLORS.amber}99, ${COLORS.amber}00)`,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, transform: `translateX(${wobble}px)` }}>
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 136,
              fontWeight: 800,
              letterSpacing: '-0.05em',
              color: COLORS.ink,
              lineHeight: 1,
            }}
          >
            300 m
          </span>
          <span style={mono(26, 500, { color: COLORS.muted, letterSpacing: '0.14em' })}>OFF TARGET</span>
        </div>
      </div>

      <div style={{ ...solve, position: 'absolute', top: 860, left: 72, right: 72 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <Unknown label="x" delay={100} solved={false} />
          <Unknown label="y" delay={106} solved={false} />
          <Unknown label="z" delay={112} solved={false} />
          <Unknown label="t" delay={124} solved />
        </div>
        <div
          style={{
            marginTop: 26,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            ...mono(23, 500, { color: COLORS.muted, letterSpacing: '0.12em' }),
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: 999, background: COLORS.amber }} />
          4TH SATELLITE SOLVES FOR TIME
        </div>
      </div>

      <div
        style={{
          ...foot,
          position: 'absolute',
          top: 1132,
          left: 72,
          right: 72,
          fontFamily: FONT.sans,
          fontSize: 32,
          fontWeight: 500,
          color: COLORS.faint,
          letterSpacing: '-0.01em',
        }}
      >
        Three unknowns for where you are. One more for when.
      </div>
    </Scene>
  );
};
