'use client';

import { createContext, useContext } from 'react';
import type { ThreeWorld } from '@/lib/scene/threeWorld';

export const SceneContext = createContext<ThreeWorld | null>(null);

export function useScene(): ThreeWorld | null {
  return useContext(SceneContext);
}
