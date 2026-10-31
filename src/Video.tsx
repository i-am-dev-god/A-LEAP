import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { SCENES } from './content';
import { SafeZones } from './components/SafeZones';
import { COLORS } from './theme';
import timings from './timings.json';

export type VideoProps = {
  /** Paint the YouTube Shorts UI exclusion zones over the frame. */
  safeZones?: boolean;
};

export const GpsShort: React.FC<VideoProps> = ({ safeZones = false }) => (
  <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
    <Series>
      {SCENES.map((scene, i) => (
        <Series.Sequence key={scene.id} durationInFrames={timings.scenes[i].frames}>
          <scene.Component />
        </Series.Sequence>
      ))}
    </Series>
    {safeZones ? <SafeZones /> : null}
  </AbsoluteFill>
);
