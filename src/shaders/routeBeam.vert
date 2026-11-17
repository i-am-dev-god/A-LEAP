// ─────────────────────────────────────────────────────────────
// OU SPATIAL ENGINE — route ribbon vertex stage
// Hologram lift + micro-undulation of the elevated energy ribbon
// ─────────────────────────────────────────────────────────────
precision highp float;

uniform float uTime;
uniform float uTotal;
uniform float uLift;

attribute float aDist;
attribute float aSide;
attribute float aElev;

varying float vDist;
varying float vSide;
varying float vElev;
varying float vT;

void main() {
  vec3 p = position;

  // holographic breathing: the ribbon floats above the terrain
  float wander = sin(aDist * 0.14 - uTime * 2.1) * 0.18
               + sin(aDist * 0.052 + uTime * 0.9) * 0.32;

  // lift the centre of the ribbon slightly higher than its rails
  p.y += uLift + wander + (1.0 - abs(aSide)) * 0.22;
  // ribbon narrows subtly with the undulation
  p.xz *= 1.0 + sin(uTime * 1.6 + aDist * 0.05) * 0.004;

  vDist = aDist;
  vSide = aSide;
  vElev = aElev;
  vT = clamp(aDist / max(uTotal, 0.001), 0.0, 1.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
