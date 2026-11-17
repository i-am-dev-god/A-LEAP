'use client';

import { useEffect } from 'react';
import { createLandmarks } from '@/lib/scene/landmarks';
import { useScene } from './SceneContext';

/** Procedural hero architecture: Arts College dome, library atrium, OUCE, masjid. */
export default function LandmarkModels() {
  const world = useScene();

  useEffect(() => {
    if (!world) return;
    const landmarks = createLandmarks();
    world.addModule(landmarks);
    return () => world.removeModule(landmarks.name);
  }, [world]);

  return null;
}
