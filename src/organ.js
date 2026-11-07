/* ============================================================================
   L E A P — organ
   ----------------------------------------------------------------------------
   No audio files exist in this repository. The machine's voice is three
   oscillators tuned to a scale derived from its seed, a filtered noise floor
   for air, and a sub pulse on the beat. All of it is synthesised at boot.
   The analyser output is fed straight back into the shader, so what you hear
   is literally what you see — the field has ridges when the machine speaks.
   ==========================================================================*/

export class Organ {
  constructor(genome) {
    this.g = genome;
    this.ctx = null;
    this.ready = false;
    this.beat = 0;          // 0..1 envelope for the shader
    this.wave = [0, 0, 0];  // three-band summary for the shader
    this.enabled = true;
  }

  /** Must be called from a user gesture. */
  async boot() {
    if (this.ready) { await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const g = this.g;

    // master chain: -> soft clip -> compressor -> analyser -> out
    const master = ctx.createGain();
    master.gain.value = 0.0;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 4200; shelf.gain.value = -6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26; comp.ratio.value = 3.2; comp.attack.value = 0.01;
    comp.release.value = 0.4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    master.connect(shelf); shelf.connect(comp); comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.master = master;

    // ---- scale: seed picks a root and a mode, so each machine has a key ----
    const roots = [110.0, 116.54, 123.47, 130.81, 138.59, 146.83, 155.56, 164.81];
    const root = roots[g.entropy % roots.length];
    const modes = [
      [0, 3, 7, 10, 12],   // minor 7
      [0, 4, 7, 11, 14],   // major 7
      [0, 5, 7, 10, 12],   // sus
      [0, 2, 7, 9, 12],    // quartal
    ];
    const degrees = modes[Math.floor(g.entropy / 7) % modes.length];
    this.scale = degrees.map((d) => root * Math.pow(2, d / 12));

    // ---- pad: three detuned voices per note, slowly drifting ----
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padGain.connect(master);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + g.glow * 900;
    filter.Q.value = 0.6;
    filter.connect(this.padGain);
    this.filter = filter;

    this.voices = [];
    this.scale.slice(0, 3).forEach((freq, i) => {
      for (const detune of [-6, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = freq * (i === 2 ? 0.5 : 1);
        o.detune.value = detune;
        const vg = ctx.createGain();
        vg.gain.value = 0.0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + (i * 0.017) + g.hueA * 0.05;
        const lg = ctx.createGain();
        lg.gain.value = 0.10;
        lfo.connect(lg); lg.connect(vg.gain);
        o.connect(vg); vg.connect(filter);
        o.start(); lfo.start();
        this.voices.push({ o, vg, base: 0.10 / (i + 1.1) });
      }
    });

    // ---- air: filtered noise, never silent, never present ----
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    let s = g.entropy >>> 0;
    for (let i = 0; i < nd.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      nd[i] = (s / 2147483648 - 1) * 0.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf; noise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.5;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.018;
    noise.connect(nf); nf.connect(this.noiseGain); this.noiseGain.connect(master);
    noise.start();

    this.ready = true;
    this.fade(0.55, 3.0);
    this.loop();
  }

  fade(to, seconds = 1.2) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.enabled ? to : 0, t + seconds);
  }

  /** A bell for compose: never a sample, always a stack of partials. */
  bell(degree = 2, velocity = 0.5) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = this.scale[degree % this.scale.length] * 2;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.16 * velocity, t + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    out.connect(this.master);
    [1, 2.01, 2.98, 4.2].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * h;
      const hg = ctx.createGain();
      hg.gain.value = 0.5 / (i + 1.6);
      o.connect(hg); hg.connect(out);
      o.start(t); o.stop(t + 3.5);
    });
  }

  /** Impulse for the sub pulse, driven by the itinerary's beat. */
  pulse() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.22);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
    o.connect(g2); g2.connect(this.master);
    o.start(t); o.stop(t + 0.32);
  }

  /** Called each animation frame. Pure measurement, no state kept. */
  loop() {
    if (!this.ready) return;
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    const band = (lo, hi) => {
      let sum = 0;
      for (let i = Math.floor(n * lo); i < Math.floor(n * hi); i++) sum += this.freq[i];
      return (sum / (Math.floor(n * hi) - Math.floor(n * lo)) / 255 - 0.5) * 2;
    };
    this.wave[0] = band(0.0, 0.08);
    this.wave[1] = band(0.08, 0.22);
    this.wave[2] = band(0.22, 0.5);
    let tot = 0;
    for (let i = 0; i < n; i++) tot += this.freq[i];
    this.beat = Math.min(1, (tot / n / 255) * 2.4);
    requestAnimationFrame(() => this.loop());
  }

  toggle() {
    this.enabled = !this.enabled;
    this.fade(this.enabled ? 0.55 : 0.0, 1.0);
    return this.enabled;
  }
}
