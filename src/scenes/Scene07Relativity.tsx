import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Scene } from '../components/Scene';
import { useRise } from '../lib/anim';
import { COLORS, FONT, mono } from '../theme';

const BAR_WIDTH = 300;
const ZERO = 76; // where the zero line sits inside the track
const SCALE = 4.4; // px per microsecond per day

const Effect: React.FC<{
  label: string;
  value: number;
  delay: number;
  color: string;
}> = ({ label, value, delay, color }) => {
  const rise = useRise(delay, 20);
  const width = Math.abs(value) * SCALE;
  const negative = value < 0;
  return (
    <div style={{ ...rise, display: 'flex', alignItems: 'center', gap: 18, height: 62 }}>
      <span style={{ width: 250, ...mono(20, 500, { color: COLORS.muted, letterSpacing: '0.14em' }), whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ position: 'relative', width: BAR_WIDTH, height: 22 }}>
        <div style={{ position: 'absolute', left: ZERO - 1, top: -6, width: 2, height: 34, background: 'rgba(140,160,196,0.4)' }} />
        <div
          style={{
            position: 'absolute',
            left: negative ? ZERO - width : ZERO,
            top: 0,
            width,
            height: 22,
            borderRadius: negative ? '11px 0 0 11px' : '0 11px 11px 0',
            background: color,
            boxShadow: `0 0 24px ${color}55`,
          }}
        />
      </div>
      <span
        style={{
          width: 150,
          textAlign: 'right',
          ...mono(30, 600, { color, letterSpacing: '0.02em', textTransform: 'none' }),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value > 0 ? '+' : '−'}
        {Math.abs(value)} µs
      </span>
    </div>
  );
};

/**
 * 07 — Relativity: the clocks up there run 38 microseconds a day fast.
 */
export const Scene07Relativity: React.FC = () => {
  const frame = useCurrentFrame();
  const head = useRise(4, 26);
  const net = useRise(110, 22);
  const drift = useRise(178, 22);

  const travel = Math.min(1, Math.max(0, (frame - 190) / 90));

  return (
    <Scene
      audio="audio/scene-07.mp3"
      caption="And because they move fast through weaker gravity, those clocks tick thirty-eight microseconds a day faster. Ignore that, and GPS drifts ten kilometres a day."
      accent={COLORS.violet}
      chapter={{ index: '07', title: 'Relativity' }}
    >
      <div style={{ ...head, position: 'absolute', top: 268, left: 72, right: 72 }}>
        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 82,
            fontWeight: 800,
            letterSpacing: '-0.045em',
            lineHeight: 1.03,
            color: COLORS.ink,
          }}
        >
          Speed slows time.
          <br />
          <span style={{ color: COLORS.violet }}>Gravity speeds it up.</span>
        </div>
      </div>

      <div style={{ position: 'absolute', top: 486, left: 72, right: 72, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Effect label="SPECIAL · SPEED" value={-7} delay={30} color={COLORS.blue} />
        <Effect label="GENERAL · GRAVITY" value={45} delay={56} color={COLORS.violet} />
      </div>

      <div
        style={{
          ...net,
          position: 'absolute',
          top: 650,
          left: 72,
          right: 72,
          paddingTop: 24,
          borderTop: `1.5px solid ${COLORS.line}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 124,
              fontWeight: 800,
              letterSpacing: '-0.05em',
              color: COLORS.ink,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            +38
          </span>
          <span style={mono(28, 600, { color: COLORS.muted, letterSpacing: '0.1em' })}>µs / DAY</span>
        </div>
        <div style={{ marginTop: 8, ...mono(20, 500, { color: COLORS.faint, letterSpacing: '0.18em' }) }}>
          CLOCKS ABOVE TICK FASTER THAN CLOCKS BELOW
        </div>
      </div>

      <div style={{ ...drift, position: 'absolute', top: 900, left: 72, right: 72 }}>
        <div style={{ position: 'relative', height: 66, borderTop: `1.5px dashed ${COLORS.line}` }}>
          <div
            style={{
              position: 'absolute',
              top: -9,
              left: 300 + travel * 500,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: COLORS.amber,
              boxShadow: '0 0 26px rgba(255,181,72,0.8)',
            }}
          />
          <div style={{ position: 'absolute', top: 16, left: 0, ...mono(19, 500, { color: COLORS.faint, letterSpacing: '0.18em' }) }}>
            ERROR IF YOU IGNORE IT
          </div>
          <div style={{ position: 'absolute', top: -34, left: 300 + travel * 500 - 40, ...mono(18, 500, { color: COLORS.amber, letterSpacing: '0.14em' }) }}>
            TODAY
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 12 }}>
          <span style={{ fontFamily: FONT.sans, fontSize: 72, fontWeight: 800, color: COLORS.amber, letterSpacing: '-0.04em' }}>
            10 km
          </span>
          <span style={mono(24, 500, { color: COLORS.muted, letterSpacing: '0.16em' })}>OF DRIFT EVERY DAY</span>
        </div>
      </div>
    </Scene>
  );
};
