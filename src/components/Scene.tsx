import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from './Backdrop';
import { Caption, CaptionScrim } from './Caption';
import { COLORS, SAFE } from '../theme';
import { CLAMP, easeOut } from '../lib/anim';

export type SceneProps = {
  /** Narration clip that belongs to this scene, e.g. "audio/scene-03.mp3". */
  audio: string;
  /** Exactly what the narration says — used for the timed captions. */
  caption: string;
  accent?: string;
  children: React.ReactNode;
  /** Small chapter marker in the safe area, top-left. */
  chapter?: { index: string; title: string };
};

/** Shared frame: backdrop, audio, captions, and the safe-area content box. */
export const Scene: React.FC<SceneProps> = ({ audio, caption, accent = COLORS.cyan, children, chapter }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fadeIn = easeOut(Math.min(1, frame / 5));

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
      <Backdrop frame={frame} />

      <AbsoluteFill style={{ opacity: fadeIn }}>{children}</AbsoluteFill>

      {chapter ? (
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            top: SAFE.top + 6,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: 0.9,
          }}
        >
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.16em',
              color: accent,
              padding: '6px 12px',
              border: `1.5px solid ${accent}55`,
              borderRadius: 8,
            }}
          >
            {chapter.index}
          </span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '0.26em',
              textTransform: 'uppercase',
              color: COLORS.muted,
            }}
          >
            {chapter.title}
          </span>
        </div>
      ) : null}

      <CaptionScrim />
      <Caption text={caption} duration={durationInFrames / fps} frame={frame} accent={accent} />

      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};

/** Content column that never moves: it is pinned inside the Shorts safe area. */
export const SafeBox: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      position: 'absolute',
      left: SAFE.left,
      right: SAFE.right,
      top: SAFE.top,
      bottom: SAFE.bottom,
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    {children}
  </div>
);

export const safeCenter = {
  position: 'absolute',
  left: SAFE.left,
  right: SAFE.right,
  top: SAFE.top,
  bottom: SAFE.bottom,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...CLAMP,
} as React.CSSProperties;
