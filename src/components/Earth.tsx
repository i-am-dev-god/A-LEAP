import React from 'react';
import { COLORS } from '../theme';

type Props = {
  size: number;
  frame: number;
  /** Slow spin of the graticule, in degrees per frame. */
  spin?: number;
  style?: React.CSSProperties;
};

/** A stylised, spin-stabilised Earth. No bitmaps — everything is drawn in SVG. */
export const Earth: React.FC<Props> = ({ size, frame, spin = 0.06, style }) => {
  const id = React.useId().replace(/:/g, '');
  const rotation = frame * spin;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{ overflow: 'visible', ...style }}
      aria-hidden
    >
      <defs>
        <radialGradient id={`ocean-${id}`} cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#1E4FA8" />
          <stop offset="46%" stopColor="#0E2456" />
          <stop offset="100%" stopColor="#040A18" />
        </radialGradient>
        <radialGradient id={`atmo-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="82%" stopColor="rgba(79,227,255,0)" />
          <stop offset="94%" stopColor="rgba(79,227,255,0.30)" />
          <stop offset="100%" stopColor="rgba(79,227,255,0)" />
        </radialGradient>
        <clipPath id={`clip-${id}`}>
          <circle cx="100" cy="100" r="96" />
        </clipPath>
        <filter id={`blur-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <circle cx="100" cy="100" r="118" fill={`url(#atmo-${id})`} />
      <circle cx="100" cy="100" r="96" fill={`url(#ocean-${id})`} />

      <g clipPath={`url(#clip-${id})`}>
        {/* graticule */}
        <g stroke="rgba(120,200,255,0.30)" strokeWidth="0.7" fill="none">
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = 100 - (lat / 90) * 96;
            const rx = Math.sqrt(Math.max(0, 96 * 96 - (y - 100) * (y - 100)));
            return <ellipse key={lat} cx="100" cy={y} rx={rx} ry={rx * 0.16} />;
          })}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const offset = ((i * 30 + rotation) % 180) - 90;
            const rx = Math.abs(Math.cos((offset * Math.PI) / 180)) * 96;
            return <ellipse key={i} cx="100" cy="100" rx={rx} ry="96" />;
          })}
        </g>

        {/* landmasses, kept deliberately abstract */}
        <g fill="rgba(70,150,235,0.30)">
          <path d={`M${28 + (rotation * 0.2) % 40} 66 q16 -14 34 -6 q14 6 6 18 q-10 14 -26 8 q-16 -6 -14 -20 z`} />
          <path d={`M${102 + (rotation * 0.14) % 24} 104 q22 -10 34 4 q8 12 -6 22 q-18 12 -30 -2 q-10 -12 2 -24 z`} />
          <path d="M62 132 q18 -6 26 8 q6 12 -10 18 q-16 6 -22 -8 q-4 -12 6 -18 z" />
        </g>

        {/* terminator */}
        <ellipse cx="74" cy="80" rx="96" ry="96" fill="rgba(0,0,0,0.42)" filter={`url(#blur-${id})`} />
      </g>

      <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(120,200,255,0.55)" strokeWidth="0.9" />
      <path
        d="M18 78 A96 96 0 0 1 132 12"
        fill="none"
        stroke="rgba(190,235,255,0.55)"
        strokeWidth="0.5"
        strokeLinecap="round"
      />
      <circle cx="100" cy="100" r="96" fill="none" stroke={COLORS.cyan} strokeWidth="0.6" opacity="0.35" />
    </svg>
  );
};
