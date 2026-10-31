import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Satellite } from '../components/Satellite';
import { Scene } from '../components/Scene';
import { Label } from '../components/Ui';
import { useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

const PacketRow: React.FC<{
  k: string;
  v: string;
  delay: number;
  accent?: string;
  note?: string;
}> = ({ k, v, delay, accent = COLORS.ink, note }) => {
  const rise = useRise(delay, 22);
  return (
    <div
      style={{
        ...rise,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '20px 26px',
        borderBottom: `1.5px solid ${COLORS.line}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={mono(23, 500, { color: COLORS.muted, letterSpacing: '0.24em' })}>{k}</span>
        {note ? <span style={mono(18, 400, { color: COLORS.faint, letterSpacing: '0.18em' })}>{note}</span> : null}
      </div>
      <span
        style={{
          ...mono(34, 600, { color: accent, letterSpacing: '0.03em', textTransform: 'none' }),
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {v}
      </span>
    </div>
  );
};

/**
 * 03 — What a satellite actually says: who I am, where I am, when I left.
 */
export const Scene03Broadcast: React.FC = () => {
  const frame = useCurrentFrame();
  const card = useRise(10, 30);
  const foot = useRise(64, 20);
  const blink = Math.sin(frame * 0.35) > 0;

  return (
    <Scene
      audio="audio/scene-03.mp3"
      caption="Every satellite broadcasts one thing. Here I am, and here is the exact time I sent this message."
      accent={COLORS.cyan}
      chapter={{ index: '03', title: 'The message' }}
    >
      <div style={{ position: 'absolute', left: 448, top: 268 }}>
        <Satellite size={240} frame={frame} beam beamAngle={0} />
      </div>

      <div style={{ position: 'absolute', top: 500, left: 72, right: 72 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Label style={{ color: COLORS.cyan, letterSpacing: '0.3em' }}>NAV MESSAGE</Label>
          <span style={mono(21, 500, { color: COLORS.faint, letterSpacing: '0.2em' })}>50 bps · LIVE</span>
        </div>

        <div
          style={{
            ...card,
            marginTop: 22,
            borderRadius: 26,
            border: `1.5px solid ${COLORS.line}`,
            background: 'rgba(8,14,30,0.82)',
            overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          }}
        >
          <PacketRow k="SATELLITE" v="SV-07" delay={16} note="WHO I AM" />
          <PacketRow k="POSITION" v="20,200 km" delay={26} note="WHERE I AM" />
          <PacketRow k="TIME STAMP" v="04:31:17.000" delay={38} accent={COLORS.amber} note="WHEN I SENT IT" />
        </div>

        <div
          style={{
            ...foot,
            marginTop: 26,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            ...mono(22, 500, { color: COLORS.muted, letterSpacing: '0.14em' }),
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: blink ? COLORS.cyan : 'rgba(79,227,255,0.25)',
            }}
          />
          BROADCASTING · 1 MESSAGE EVERY 30 SECONDS
        </div>
      </div>

      <div
        style={{
          ...foot,
          position: 'absolute',
          top: 1080,
          left: 72,
          right: 160,
          fontFamily: FONT.sans,
          fontSize: 42,
          fontWeight: 500,
          color: COLORS.muted,
          letterSpacing: '-0.015em',
          lineHeight: 1.2,
        }}
      >
        No questions. No handshake.
        <br />
        <span style={{ color: COLORS.ink }}>Just a clock and a coordinate.</span>
      </div>
    </Scene>
  );
};
