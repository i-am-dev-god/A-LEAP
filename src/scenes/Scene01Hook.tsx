import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Earth } from '../components/Earth';
import { Chip, Label } from '../components/Ui';
import { Scene } from '../components/Scene';
import { CLAMP, useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

/**
 * 01 — Hook. The number of satellites overhead lands first, the Earth creeps in
 * underneath so the frame already feels like "up there".
 */
export const Scene01Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kick = useRise(2);
  const number = useRise(8, 60);
  const sub = useRise(16);
  const chip = useRise(28);

  const entrance = spring({ frame, fps, config: { damping: 26, mass: 1.1, stiffness: 58 } });
  const count = Math.round(interpolate(entrance, [0, 1], [0, 31], CLAMP));

  return (
    <Scene
      audio="audio/scene-01.mp3"
      caption="Right now, thirty-one satellites are orbiting above you. And four of them know exactly where you are standing."
      chapter={{ index: '01', title: 'Overhead' }}
    >
      <Earth
        size={1520}
        frame={frame}
        style={{ position: 'absolute', left: -200, top: 1190, opacity: 0.9 }}
      />

      <div style={{ position: 'absolute', top: 300, left: 72, right: 72, display: 'flex', justifyContent: 'center', ...kick }}>
        <Label style={{ color: COLORS.cyan, letterSpacing: '0.3em' }}>GLOBAL POSITIONING SYSTEM</Label>
      </div>

      <div
        style={{
          ...number,
          position: 'absolute',
          top: 350,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 360,
            fontWeight: 800,
            letterSpacing: '-0.06em',
            lineHeight: 0.92,
            color: COLORS.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {String(count).padStart(2, '0')}
        </span>
      </div>

      <div
        style={{
          ...sub,
          position: 'absolute',
          top: 748,
          left: 72,
          right: 72,
          textAlign: 'center',
          fontFamily: FONT.sans,
          fontSize: 60,
          fontWeight: 500,
          color: COLORS.ink,
          letterSpacing: '-0.025em',
          lineHeight: 1.15,
        }}
      >
        satellites in orbit,
        <br />
        <span style={{ color: COLORS.muted }}>right now.</span>
      </div>

      <div style={{ ...chip, position: 'absolute', top: 960, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <Chip>4 OF THEM KNOW WHERE YOU ARE</Chip>
      </div>

      <div
        style={{
          ...sub,
          position: 'absolute',
          top: 1052,
          left: 0,
          right: 0,
          textAlign: 'center',
          ...mono(23, 500, { color: COLORS.faint, letterSpacing: '0.28em' }),
        }}
      >
        LISTENING ONLY · NO SIGNAL SENT
      </div>
    </Scene>
  );
};
