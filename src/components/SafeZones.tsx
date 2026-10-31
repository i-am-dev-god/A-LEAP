import React from 'react';
import { COLORS, SAFE } from '../theme';

const bar = (style: React.CSSProperties, label: string): React.ReactNode => (
  <div
    style={{
      position: 'absolute',
      background: 'rgba(255, 64, 96, 0.16)',
      border: '1.5px solid rgba(255, 64, 96, 0.55)',
      ...style,
    }}
  >
    <span
      style={{
        position: 'absolute',
        left: 16,
        top: 12,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 20,
        letterSpacing: '0.16em',
        color: '#FF8098',
      }}
    >
      {label}
    </span>
  </div>
);

/**
 * Debug overlay: everything painted red is covered by YouTube Shorts UI.
 * Render a still with `--props='{"safeZones":true}'` to check a frame.
 */
export const SafeZones: React.FC = () => (
  <>
    {bar({ left: 0, right: 0, top: 0, height: SAFE.top }, 'YT TOP BAR')}
    {bar({ left: 0, right: 0, bottom: 0, height: SAFE.bottom }, 'TITLE · CHANNEL · DESCRIPTION')}
    {bar({ right: 0, bottom: SAFE.bottom - 60, width: 210, height: 560 }, 'LIKE · COMMENT · SHARE')}
    <div
      style={{
        position: 'absolute',
        left: SAFE.left,
        right: SAFE.right,
        top: SAFE.top,
        bottom: SAFE.bottom,
        border: '2px dashed rgba(79, 227, 255, 0.8)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          right: 10,
          top: 8,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 20,
          letterSpacing: '0.18em',
          color: COLORS.cyan,
        }}
      >
        SAFE AREA
      </span>
    </div>
    <div
      style={{
        position: 'absolute',
        left: SAFE.caption.x,
        width: 1080 - SAFE.caption.x - SAFE.caption.right,
        top: SAFE.caption.bottom - 168,
        height: 168,
        border: '2px dashed rgba(255, 181, 72, 0.8)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          right: 10,
          bottom: 8,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 20,
          letterSpacing: '0.18em',
          color: COLORS.amber,
        }}
      >
        CAPTION BAND
      </span>
    </div>
  </>
);
