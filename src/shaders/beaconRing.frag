// ─────────────────────────────────────────────────────────────
// OU SPATIAL ENGINE — holographic destination beacon
// Expanding range rings, scan sweep, reticle ticks and core glow
// ─────────────────────────────────────────────────────────────
precision highp float;

uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uFloorPulse;

varying vec2 vUv;

float ring(float r, float radius, float width) {
  return 1.0 - smoothstep(0.0, width, abs(r - radius));
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // three expanding pulses
  float pulses = 0.0;
  for (int i = 0; i < 3; i++) {
    float offset = float(i) * 0.3333;
    float phase = fract(uTime * 0.36 + offset);
    float radius = 0.22 + phase * 0.74;
    pulses += ring(r, radius, 0.018) * (1.0 - phase) * 0.9;
  }

  // solid inner reticle
  float base = ring(r, 0.44, 0.006) * 0.75;
  base += ring(r, 0.47, 0.003) * 0.4;

  // rotating scan sweep
  float angle = atan(p.y, p.x);
  float sweep = smoothstep(0.0, 0.25, fract((angle / 6.28318) + uTime * 0.14));
  sweep *= (1.0 - smoothstep(0.18, 0.65, r)) * 0.5;

  // cardinal ticks
  float ticks = 0.0;
  float tickAngle = abs(fract(angle / 1.5707963) - 0.5) * 2.0;
  ticks += step(0.86, r) * step(r, 0.99) * smoothstep(0.02, 0.0, tickAngle - 0.94);

  // core glow
  float core = exp(-r * 7.5) * 0.9;
  core += ring(r, 0.1, 0.05) * 0.4;

  float alpha = (pulses + base + sweep + ticks * 0.7 + core) * uOpacity * uFloorPulse;

  // flicker keeps the hologram alive
  alpha *= 0.92 + 0.08 * sin(uTime * 9.0 + r * 24.0);

  vec3 color = uColor * (1.0 + core * 0.8) + vec3(0.2, 0.55, 0.6) * pulses;
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
