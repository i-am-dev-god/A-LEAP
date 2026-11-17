// Vertical light column above the destination beacon
precision highp float;

uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;

varying vec2 vUv;

void main() {
  float fade = pow(1.0 - vUv.y, 1.8);
  float bands = smoothstep(0.55, 1.0, fract(vUv.y * 5.0 - uTime * 0.55));
  float edge = smoothstep(0.5, 0.18, abs(vUv.x - 0.5));
  float alpha = (fade * 0.42 + bands * fade * 0.5) * edge * uOpacity;
  vec3 color = mix(uColor, vec3(0.55, 1.0, 0.92), bands * 0.4);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
