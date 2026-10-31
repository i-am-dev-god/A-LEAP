import React from 'react';
import { COLORS, FONT, SAFE } from '../theme';
import { buildCaptions } from '../lib/captions';
import { easeOut } from '../lib/anim';

type Props = {
  text: string;
  /** Length of this scene's narration clip. */
  duration: number;
  frame: number;
  accent?: string;
  maxWords?: number;
  maxChars?: number;
};

/**
 * Burned-in captions that sit inside the Shorts safe area: above the
 * description block and to the left of the like / comment / share rail.
 */
export const Caption: React.FC<Props> = ({
  text,
  duration,
  frame,
  accent = COLORS.cyan,
  maxWords = 4,
  maxChars = 20,
}) => {
  const time = frame / 30;
  const lines = React.useMemo(
    () => buildCaptions(text, duration, maxWords, maxChars),
    [text, duration, maxWords, maxChars],
  );

  const active = lines.findIndex((line) => time >= line.start - 0.08 && time <= line.end + 0.26);
  const index = active === -1 ? (time > (lines.at(-1)?.end ?? 0) ? lines.length - 1 : 0) : active;
  const line = lines[index];
  if (!line) return null;

  const enter = Math.min(1, Math.max(0, (time - (line.start - 0.08)) / 0.12));

  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.caption.x,
        width: 1080 - SAFE.caption.x - SAFE.caption.right,
        top: SAFE.caption.bottom - 168,
        fontFamily: FONT.sans,
        fontSize: 62,
        fontWeight: 800,
        lineHeight: 1.18,
        letterSpacing: '-0.025em',
        color: COLORS.ink,
        opacity: easeOut(enter),
        transform: `translateY(${(1 - easeOut(enter)) * 18}px)`,
        textShadow: '0 6px 26px rgba(0,0,0,0.55)',
      }}
    >
      {line.words.map((word) => {
        const isActive = time >= word.start - 0.02 && time < word.end + 0.06;
        return (
          <span
            key={`${word.start}-${word.text}`}
            style={{
              display: 'inline-block',
              marginRight: 12,
              padding: '2px 10px 4px',
              borderRadius: 12,
              background: isActive ? accent : 'transparent',
              color: isActive ? '#04121B' : COLORS.ink,
              transition: 'none',
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

/** Soft floor so captions stay readable when the artwork behind them is bright. */
export const CaptionScrim: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 620,
      background: 'linear-gradient(to top, rgba(2,4,10,0.92) 8%, rgba(2,4,10,0.55) 45%, rgba(2,4,10,0) 100%)',
      pointerEvents: 'none',
      opacity: 1,
      transform: 'translateZ(0)',
    }}
  />
);
