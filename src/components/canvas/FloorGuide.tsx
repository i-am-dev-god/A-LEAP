'use client';

import { useEffect } from 'react';
import { createFloorGuide } from '@/lib/scene/floorGuide';
import { useScene } from './SceneContext';

/** Floor-stack slicing for the selected building. */
export default function FloorGuide() {
  const world = useScene();

  useEffect(() => {
    if (!world) return;
    const guide = createFloorGuide();
    world.addModule(guide);
    return () => world.removeModule(guide.name);
  }, [world]);

  return null;
}
