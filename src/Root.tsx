import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { GpsShort } from './Video';
import timings from './timings.json';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="GpsShort"
    component={GpsShort}
    durationInFrames={timings.totalFrames}
    fps={timings.fps}
    width={1080}
    height={1920}
    defaultProps={{ safeZones: false }}
  />
);
