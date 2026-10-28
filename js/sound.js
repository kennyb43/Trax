/*
 * Synthesised sound effects (no audio files needed).
 * The AudioContext is created lazily on the first sound, which always follows a user action.
 */
const TraxSound = (() => {
  let ctx = null;
  let enabled = true;
  let noiseBuf = null;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A hard plastic tile being set down on a table: a bright click plus a short low knock.
  function place() {
    if (!enabled) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;

    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.4;
    const g1 = a.createGain();
    g1.gain.setValueAtTime(0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(bp).connect(g1).connect(a.destination);
    src.start(t);

    const osc = a.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    const g2 = a.createGain();
    g2.gain.setValueAtTime(0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(g2).connect(a.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  function tones(freqs, step, type = 'triangle', vol = 0.18) {
    if (!enabled) return;
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + 0.05;
    freqs.forEach((f, i) => {
      const t = t0 + i * step;
      const o = a.createOscillator();
      o.type = type; o.frequency.value = f;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 2.2);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + step * 2.4);
    });
  }

  return {
    place,
    win: () => tones([523.25, 659.25, 783.99, 1046.5], 0.12),
    lose: () => tones([392, 329.63, 261.63], 0.18, 'sine', 0.16),
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
  };
})();
