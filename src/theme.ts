import type { CSSProperties } from 'react';

export const COLORS = {
  bg: '#04060E',
  bgDeep: '#010206',
  glowBlue: 'rgba(56, 120, 255, 0.30)',
  glowCyan: 'rgba(79, 227, 255, 0.18)',
  ink: '#F2F6FF',
  muted: '#8CA0C4',
  faint: '#43536E',
  cyan: '#4FE3FF',
  blue: '#3C7BFF',
  amber: '#FFB548',
  violet: '#A78BFA',
  line: 'rgba(140, 160, 196, 0.22)',
} as const;

/**
 * YouTube Shorts safe area for a 1080x1920 frame.
 *
 * Shorts lays a title / channel / description stack over the bottom of the
 * frame and a column of like / comment / share buttons over the bottom-right.
 * Anything inside these insets gets covered, so every caption and every piece
 * of readable type in this film is kept inside `content`.
 */
export const SAFE = {
  top: 210,
  bottom: 470,
  left: 72,
  right: 72,
  /** Burned-in captions sit here: above the description block and clear of the button rail. */
  caption: {
    x: 84,
    right: 232,
    bottom: 1448,
  },
} as const;

export const CONTENT = {
  width: 1080 - SAFE.left - SAFE.right,
  height: 1920 - SAFE.top - SAFE.bottom,
} as const;

export const FONT = {
  sans: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const text = (size: number, weight: number, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: FONT.sans,
  fontSize: size,
  fontWeight: weight,
  color: COLORS.ink,
  lineHeight: 1.08,
  letterSpacing: '-0.02em',
  ...extra,
});

export const mono = (size: number, weight = 500, extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: FONT.mono,
  fontSize: size,
  fontWeight: weight,
  color: COLORS.muted,
  letterSpacing: '0.14em',
  ...extra,
});
