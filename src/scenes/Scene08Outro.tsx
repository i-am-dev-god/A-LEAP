import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Scene } from '../components/Scene';
import { Chip } from '../components/Ui';
import { useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

/**
 * 08 — Outro: the blue dot is applied relativity.
 */
export const Scene08Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = (frame % 64) / 64;

  const badge = useRise(4, 22);
  const title = useRise(22, 32);
  const chips = useRise(56, 18);

  return (
    <Scene
      audio="audio/scene-08.mp3"
      caption="So the next time that blue dot appears, remember. That is Einstein, working in your pocket."
      accent={COLORS.blue}
      chapter={{ index: '08', title: 'Your blue dot' }}
    >
      <div style={{ position: 'absolute', left: 540, top: 640, transform: 'translate(-50%, -50%)' }}>
        {[0, 1, 2].map((i) => {
          const p = (pulse + i / 3) % 1;
          const size = 120 + p * 560;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: -size / 2,
                top: -size / 2,
                width: size,
                height: size,
                borderRadius: 999,
                border: `2px solid rgba(79,163,255,${0.55 * (1 - p)})`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: -34,
            top: -34,
            width: 68,
            height: 68,
            borderRadius: 999,
            background: '#4FA3FF',
            boxShadow: '0 0 70px 14px rgba(79,163,255,0.6)',
          }}
        />
      </div>

      <div style={{ ...badge, position: 'absolute', top: 268, left: 72 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '12px 22px',
            borderRadius: 999,
            border: `1.5px solid ${COLORS.blue}55`,
            ...mono(22, 600, { color: '#8FB8FF', letterSpacing: '0.24em' }),
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: 999, background: '#4FA3FF' }} />
          LOCATION FOUND
        </div>
      </div>

      <div style={{ ...title, position: 'absolute', top: 830, left: 72, right: 72 }}>
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 118,
            fontWeight: 800,
            letterSpacing: '-0.055em',
            lineHeight: 0.96,
            color: COLORS.ink,
          }}
        >
          Thank
          <br />
          Einstein.
        </div>
        <div
          style={{
            marginTop: 22,
            fontFamily: FONT.sans,
            fontSize: 42,
            fontWeight: 500,
            color: COLORS.muted,
            letterSpacing: '-0.015em',
          }}
        >
          Relativity, running in your pocket.
        </div>
        <div style={{ ...chips, display: 'flex', gap: 12, marginTop: 26 }}>
          <Chip color={COLORS.cyan}>4 SATELLITES</Chip>
          <Chip color={COLORS.violet}>38 µs / DAY</Chip>
        </div>
      </div>
    </Scene>
  );
};
