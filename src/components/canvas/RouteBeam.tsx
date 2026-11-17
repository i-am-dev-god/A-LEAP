'use client';

import { useEffect } from 'react';
import { createRouteBeam } from '@/lib/scene/routeBeam';
import { useScene } from './SceneContext';

/** Animated GLSL energy ribbon that draws the active A* route. */
export default function RouteBeam() {
  const world = useScene();

  useEffect(() => {
    if (!world) return;
    const beam = createRouteBeam();
    world.addModule(beam);
    return () => world.removeModule(beam.name);
  }, [world]);

  return null;
}
