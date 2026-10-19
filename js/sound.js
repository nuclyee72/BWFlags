// sound.js — 효과음(WebAudio)과 소리 크기. 끔 · 작게 · 크게를 돌아가며 고른다
window.BW = window.BW || {};
(function (BW) {
  let level = BW.store.soundLevel();
  let ctx = null;
  const listeners = [];

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const vol = () => (level === 1 ? 0.45 : 1);

  function tone(freq, dur, { type = 'sine', gain = 0.15, slide = 0, delay = 0 } = {}) {
    if (!level) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * vol(), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, { gain = 0.08, freq = 2000, q = 0.8, delay = 0 } = {}) {
    if (!level) return;
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * vol(), t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  let pourAt = 0;
  BW.sound = {
    get level() { return level; },
    label() { return ['끔', '작게', '크게'][level]; },
    cycle() {
      level = (level + 1) % 3;
      BW.store.setSoundLevel(level);
      listeners.forEach((fn) => fn(level));
      if (level) tone(880, 0.08, { gain: 0.1 });
    },
    onChange(fn) { listeners.push(fn); },
    // TTS 음량 — 소리를 끄면 읽어 주지 않고 자막만 나온다
    ttsVolume() { return [0, 0.55, 1][level]; },
    unlock() { ac(); },

    flag() { noise(0.12, { gain: 0.05, freq: 1800, q: 1.2 }); },
    toggle() { tone(1500, 0.03, { type: 'square', gain: 0.04 }); tone(900, 0.05, { type: 'square', gain: 0.035, delay: 0.03 }); },
    hum(on) { tone(on ? 320 : 420, 0.18, { type: 'triangle', gain: 0.07, slide: on ? 160 : -180 }); },
    ok() { tone(880, 0.12, { gain: 0.11 }); tone(1320, 0.2, { gain: 0.11, delay: 0.08 }); },
    bad() { tone(196, 0.34, { type: 'sawtooth', gain: 0.07, slide: -70 }); tone(147, 0.34, { type: 'sawtooth', gain: 0.05, delay: 0.05, slide: -50 }); },
    bonus() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, { gain: 0.09, delay: i * 0.07 })); },
    levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.1, delay: i * 0.09 })); },
    cooked() { [1319, 1760, 2349].forEach((f, i) => tone(f, 0.18, { gain: 0.07, delay: i * 0.05 })); },
    shuffle() { [440, 554, 659, 554, 440].forEach((f, i) => tone(f, 0.09, { type: 'triangle', gain: 0.06, delay: i * 0.06 })); },
    sizzle() { noise(0.6, { gain: 0.07, freq: 4200, q: 0.6 }); },
    flip() { noise(0.1, { gain: 0.06, freq: 900, q: 1 }); noise(0.35, { gain: 0.05, freq: 4200, q: 0.6, delay: 0.08 }); },
    pour() {
      const now = performance.now();
      if (now - pourAt < 110) return;
      pourAt = now;
      tone(500 + Math.random() * 300, 0.07, { gain: 0.05, slide: 200 });
    },
    gulp() { tone(240, 0.11, { gain: 0.12, slide: -90 }); tone(210, 0.13, { gain: 0.12, slide: -90, delay: 0.16 }); },
    nope() { tone(330, 0.07, { type: 'square', gain: 0.04 }); tone(260, 0.09, { type: 'square', gain: 0.04, delay: 0.08 }); },
  };
})(window.BW);
