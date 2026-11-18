declare module '*.vert' {
  const source: string;
  export default source;
}
declare module '*.frag' {
  const source: string;
  export default source;
}
declare module '*.glsl' {
  const source: string;
  export default source;
}

declare module '*.geojson' {
  const value: unknown;
  export default value;
}
declare module '*.json' {
  const value: unknown;
  export default value;
}

declare module '*.glb' {
  const url: string;
  export default url;
}
