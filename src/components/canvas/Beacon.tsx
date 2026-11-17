'use client';

import { useEffect } from 'react';
import { createBeacon } from '@/lib/scene/beacon';
import { useScene } from './SceneContext';

/** Holographic destination beacon + origin ping. */
export default function Beacon() {
  const world = useScene();

  useEffect(() => {
    if (!world) return;
    const beacon = createBeacon();
    world.addModule(beacon);
    return () => world.removeModule(beacon.name);
  }, [world]);

  return null;
}
