import React from 'react';
import { COLORS } from '../theme';

type Props = {
  size?: number;
  frame: number;
  /** Highlight colour of the beacon. */
  color?: string;
  /** Adds a narrow broadcast beam pointing `beamAngle` degrees (0 = down). */
  beam?: boolean;
  beamAngle?: number;
  opacity?: number;
};

export const Satellite: React.FC<Props> = ({
  size = 96,
  frame,
  color = COLORS.cyan,
  beam = false,
  beamAngle = 180,
  opacity = 1,
}) => {
  const blink = 0.55 + 0.45 * Math.sin(frame * 0.28);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ overflow: 'visible', opacity }} aria-hidden>
      <defs>
        <radialGradient id="sat-glow">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="60%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {beam ? (
        <g transform={`rotate(${beamAngle} 60 60)`} opacity={0.5}>
          <path d="M60 66 L30 118 L90 118 Z" fill={color} opacity={0.10} />
          <path d="M60 66 L46 118 L74 118 Z" fill={color} opacity={0.13} />
        </g>
      ) : null}

      <circle cx="60" cy="60" r="52" fill="url(#sat-glow)" />
      <g stroke={color} strokeWidth="1.6" fill="none" opacity="0.85">
        <rect x="24" y="52" width="16" height="16" rx="2" fill="rgba(79,227,255,0.16)" />
        <rect x="80" y="52" width="16" height="16" rx="2" fill="rgba(79,227,255,0.16)" />
        <line x1="40" y1="60" x2="48" y2="60" />
        <line x1="72" y1="60" x2="80" y2="60" />
      </g>
      <rect x="48" y="46" width="24" height="28" rx="5" fill="#0B1730" stroke={color} strokeWidth="1.8" />
      <circle cx="60" cy="60" r="3.4" fill={color} opacity={blink} />
      <circle cx="60" cy="60" r="9" fill="none" stroke={color} strokeWidth="0.8" opacity={0.35 * blink} />
    </svg>
  );
};
