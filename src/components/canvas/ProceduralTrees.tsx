'use client';

import { useEffect } from 'react';
import { createTreeField } from '@/lib/scene/trees';
import { useScene } from './SceneContext';

/** Instanced 3D tree field — 900+ procedural canopies on one draw call. */
export default function ProceduralTrees() {
  const world = useScene();

  useEffect(() => {
    if (!world) return;
    const field = createTreeField();
    world.addModule(field);
    return () => world.removeModule(field.name);
  }, [world]);

  return null;
}
