import React from 'react';
import { COLORS, FONT, mono } from '../theme';

export const Chip: React.FC<{
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
  filled?: boolean;
}> = ({ children, color = COLORS.cyan, style, filled = false }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '14px 22px',
      borderRadius: 999,
      border: `1.5px solid ${color}${filled ? '' : '55'}`,
      background: filled ? color : 'rgba(8,14,30,0.72)',
      ...mono(26, 600, { color: filled ? '#04121B' : color, letterSpacing: '0.1em' }),
      ...style,
    }}
  >
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div style={mono(27, 600, { color: COLORS.muted, letterSpacing: '0.34em', lineHeight: 1, ...style })}>
    {children}
  </div>
);

export const Rule: React.FC<{ width?: number | string; color?: string; style?: React.CSSProperties }> = ({
  width = '100%',
  color = COLORS.line,
  style,
}) => <div style={{ width, height: 1.5, background: color, ...style }} />;

export const BigNumber: React.FC<{
  value: string;
  unit?: string;
  color?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ value, unit, color = COLORS.ink, size = 210, style }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, ...style }}>
    <span
      style={{
        fontFamily: FONT.sans,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '-0.055em',
        lineHeight: 0.9,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
    {unit ? (
      <span style={{ ...mono(size * 0.2, 600, { color: COLORS.muted, letterSpacing: '0.12em' }) }}>{unit}</span>
    ) : null}
  </div>
);
