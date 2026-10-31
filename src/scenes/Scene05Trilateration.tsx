import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Satellite } from '../components/Satellite';
import { Scene } from '../components/Scene';
import { Label } from '../components/Ui';
import { easeOut, useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

/**
 * Top-down view: the satellites are pinned where they are, the receiver sits in
 * the middle, and each measured distance is a circle drawn from a satellite.
 * The first two circles meet twice; the third one only agrees on the receiver.
 */
const P = { x: 540, y: 840 };

const NODES = [
  { x: 180, y: 560, color: COLORS.blue, delay: 14, key: 'A' },
  { x: 900, y: 600, color: COLORS.cyan, delay: 56, key: 'B' },
  { x: 760, y: 1150, color: COLORS.violet, delay: 128, key: 'C' },
].map((n) => ({ ...n, r: Math.hypot(n.x - P.x, n.y - P.y) }));

/** The second meeting point of circles A and B. */
const intersections = (
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
): { x: number; y: number }[] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > a.r + b.r || d < Math.abs(a.r - b.r) || d === 0) return [];
  const a2 = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - a2 * a2));
  const mx = a.x + (dx * a2) / d;
  const my = a.y + (dy * a2) / d;
  return [
    { x: mx + (dy * h) / d, y: my - (dx * h) / d },
    { x: mx - (dy * h) / d, y: my + (dx * h) / d },
  ];
};

export const Scene05Trilateration: React.FC = () => {
  const frame = useCurrentFrame();

  const grow = (delay: number) => easeOut(Math.min(1, Math.max(0, (frame - delay) / 34)));
  const radii = NODES.map((n) => n.r * grow(n.delay));

  const pairDone = frame > 92;
  const trioDone = frame > 168;

  const other = intersections(NODES[0], NODES[1]).find(
    (pt) => Math.hypot(pt.x - P.x, pt.y - P.y) > 20,
  );

  const step1 = useRise(100, 16);
  const step2 = useRise(172, 16);
  const title = useRise(4, 20);
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.16);

  return (
    <Scene
      audio="audio/scene-05.mp3"
      caption="Two circles cross at two points. A third pins you to one. That is trilateration, and your phone never says a word."
      accent={COLORS.cyan}
      chapter={{ index: '05', title: 'Trilateration' }}
    >
      <div style={{ ...title, position: 'absolute', top: 268, left: 72 }}>
        <Label style={{ color: COLORS.cyan, letterSpacing: '0.26em' }}>DISTANCE = CIRCLE</Label>
      </div>

      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        {/* ground grid so the circles read as distances on a map */}
        {[130, 260, 390, 520].map((r) => (
          <circle key={r} cx={P.x} cy={P.y} r={r} fill="none" stroke="rgba(120,160,220,0.10)" strokeWidth={1.2} />
        ))}
        <line x1={0} y1={P.y} x2={1080} y2={P.y} stroke="rgba(120,160,220,0.10)" strokeWidth={1.2} />
        <line x1={P.x} y1={0} x2={P.x} y2={1920} stroke="rgba(120,160,220,0.10)" strokeWidth={1.2} />

        {NODES.map((n, i) => (
          <circle
            key={n.key}
            cx={n.x}
            cy={n.y}
            r={Math.max(0.1, radii[i])}
            fill="none"
            stroke={n.color}
            strokeWidth={3}
            opacity={0.9}
          />
        ))}

        {pairDone && other ? (
          <g opacity={trioDone ? 0.22 : 1}>
            <circle cx={other.x} cy={other.y} r={12} fill={COLORS.amber} />
            <circle cx={other.x} cy={other.y} r={28} fill="none" stroke={COLORS.amber} strokeWidth={2} opacity={0.6} />
          </g>
        ) : null}

        <circle cx={P.x} cy={P.y} r={18 + pulse * 6} fill={COLORS.cyan} />
        <circle cx={P.x} cy={P.y} r={36 + pulse * 24} fill="none" stroke={COLORS.cyan} strokeWidth={2.5} opacity={0.55} />
      </svg>

      {NODES.map((n, i) => (
        <div key={n.key} style={{ position: 'absolute', left: n.x - 40, top: n.y - 40 }}>
          <Satellite size={80} frame={frame + i * 17} color={n.color} />
        </div>
      ))}

      <div style={{ position: 'absolute', left: P.x + 30, top: P.y + 6, ...mono(24, 600, { color: COLORS.cyan, letterSpacing: '0.22em' }) }}>
        YOU
      </div>

      {pairDone && other ? (
        <div
          style={{
            position: 'absolute',
            left: other.x + 30,
            top: other.y + 14,
            ...mono(21, 600, { color: COLORS.amber, letterSpacing: '0.16em' }),
            opacity: trioDone ? 0.25 : 1,
          }}
        >
          {trioDone ? 'RULED OUT' : 'ALSO POSSIBLE'}
        </div>
      ) : null}

      <div style={{ position: 'absolute', top: 1120, left: 72, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            ...step1,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            ...mono(24, 500, { color: COLORS.muted, letterSpacing: '0.12em' }),
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: 999, background: COLORS.amber }} />
          2 CIRCLES → 2 CANDIDATES
        </div>
        <div
          style={{
            ...step2,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            ...mono(24, 600, { color: COLORS.cyan, letterSpacing: '0.12em' }),
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: 999, background: COLORS.cyan }} />
          3 CIRCLES → 1 POINT
        </div>
      </div>

      <div
        style={{
          ...useRise(180, 14),
          position: 'absolute',
          top: 1216,
          left: 72,
          fontFamily: FONT.sans,
          fontSize: 30,
          fontWeight: 500,
          color: COLORS.faint,
          letterSpacing: '-0.01em',
        }}
      >
        No signal leaves your phone.
      </div>
    </Scene>
  );
};
