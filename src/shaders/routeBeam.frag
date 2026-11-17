// ─────────────────────────────────────────────────────────────
// OU SPATIAL ENGINE — route ribbon fragment stage
// Animated directional chevrons, energy rails, travelling head pulse
// ─────────────────────────────────────────────────────────────
precision highp float;

uniform float uTime;
uniform float uTotal;
uniform float uProgress;
uniform float uIntensity;
uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vDist;
varying float vSide;
varying float vElev;
varying float vT;

void main() {
  float reveal = uTotal * uProgress;
  if (vDist > reveal + 1.5) discard;

  // route gradient: origin → destination
  vec3 base = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vT));

  // feathered lateral edge
  float edge = 1.0 - smoothstep(0.62, 1.0, abs(vSide));

  // rails along both edges
  float rail = smoothstep(0.74, 0.9, abs(vSide)) * (1.0 - smoothstep(0.92, 1.0, abs(vSide)));

  // travelling chevrons pointing toward the destination
  float spacing = 7.5;
  float phase = fract(vDist / spacing - uTime * 1.55);
  float chevron = smoothstep(0.0, 0.14, phase) * (1.0 - smoothstep(0.16, 0.42, phase));

  // leading edge flare
  float head = 1.0 - smoothstep(0.0, 7.0, abs(vDist - reveal));

  // slow energy pulse along the whole ribbon
  float pulse = 0.6 + 0.4 * sin(vDist * 0.045 - uTime * 3.4);

  float alpha = edge * (0.16 + chevron * 0.55 * pulse + rail * 0.7);
  alpha += head * 0.4;
  alpha *= uIntensity;

  vec3 color = base * (0.85 + chevron * 0.55 * pulse);
  color += rail * base * 1.35;
  color += head * 1.6;
  color += vec3(0.15, 0.35, 0.4) * edge * 0.18;

  // atmospheric height tint — higher ribbon sections fade slightly cooler
  color = mix(color, vec3(0.35, 0.85, 1.0), clamp(vElev * 0.02, 0.0, 0.22));

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
