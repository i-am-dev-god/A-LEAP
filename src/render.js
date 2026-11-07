/* ============================================================================
   L E A P — render
   ----------------------------------------------------------------------------
   A minimal WebGL2/WebGL1 fragment-shader cockpit. No sprite sheets, no
   textures, no meshes: one full-screen triangle and a string of GLSL that was
   generated, at this instant, from the machine's seed.
   ==========================================================================*/

export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    const opts = { antialias: false, alpha: false, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.time = 0;
    this.boot = 0;
    this.pointer = [0, 0];
    this.target = [0, 0];
    this.rb = { wave: [0, 0, 0], beat: 0 };
    this.paused = false;
    this._build();
  }

  _compile(fragSource) {
    const gl = this.gl;
    const vs = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`shader: ${log}`);
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fragSource));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  _build() {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // one oversized triangle: cheaper than a quad, no seam down the diagonal
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.buf = buf;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  /** Recompile for a new machine. The old shader is discarded, never stored. */
  setMachine(source) {
    const gl = this.gl;
    const prog = this._compile(source);
    if (this.prog) gl.deleteProgram(this.prog);
    this.prog = prog;
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      beat: gl.getUniformLocation(prog, 'uBeat'),
      pointer: gl.getUniformLocation(prog, 'uPointer'),
      wave: gl.getUniformLocation(prog, 'uWave'),
      boot: gl.getUniformLocation(prog, 'uBoot'),
    };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  frame(dt, audio) {
    const gl = this.gl;
    if (!this.prog) return;
    if (!this.paused) this.time += dt;
    this.boot = Math.min(1, this.boot + dt / 2.4);
    // pointer eases toward its target; a field that snaps looks like software
    this.pointer[0] += (this.target[0] - this.pointer[0]) * Math.min(1, dt * 2.4);
    this.pointer[1] += (this.target[1] - this.pointer[1]) * Math.min(1, dt * 2.4);

    const { wave, beat } = audio || this.rb;
    gl.uniform2f(this.u.res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.time, this.time);
    gl.uniform1f(this.u.beat, beat);
    gl.uniform2f(this.u.pointer, this.pointer[0], this.pointer[1]);
    gl.uniform3f(this.u.wave, wave[0], wave[1], wave[2]);
    gl.uniform1f(this.u.boot, this.boot);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
