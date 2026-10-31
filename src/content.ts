import type React from 'react';
import { Scene01Hook } from './scenes/Scene01Hook';
import { Scene02Orbit } from './scenes/Scene02Orbit';
import { Scene03Broadcast } from './scenes/Scene03Broadcast';
import { Scene04TimeOfFlight } from './scenes/Scene04TimeOfFlight';
import { Scene05Trilateration } from './scenes/Scene05Trilateration';
import { Scene06Clock } from './scenes/Scene06Clock';
import { Scene07Relativity } from './scenes/Scene07Relativity';
import { Scene08Outro } from './scenes/Scene08Outro';

export type SceneSpec = {
  id: string;
  audio: string;
  Component: React.FC;
};

/**
 * The running order. Files must line up with public/audio and with the frame
 * counts that scripts/timings.mjs writes into src/timings.json.
 */
export const SCENES: SceneSpec[] = [
  { id: 'scene-01', audio: 'audio/scene-01.mp3', Component: Scene01Hook },
  { id: 'scene-02', audio: 'audio/scene-02.mp3', Component: Scene02Orbit },
  { id: 'scene-03', audio: 'audio/scene-03.mp3', Component: Scene03Broadcast },
  { id: 'scene-04', audio: 'audio/scene-04.mp3', Component: Scene04TimeOfFlight },
  { id: 'scene-05', audio: 'audio/scene-05.mp3', Component: Scene05Trilateration },
  { id: 'scene-06', audio: 'audio/scene-06.mp3', Component: Scene06Clock },
  { id: 'scene-07', audio: 'audio/scene-07.mp3', Component: Scene07Relativity },
  { id: 'scene-08', audio: 'audio/scene-08.mp3', Component: Scene08Outro },
];
