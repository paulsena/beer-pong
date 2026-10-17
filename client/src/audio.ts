// Sound effects + ambience. (Track E)
//
// WebAudio only. A few CC0 Kenney samples (client/public/assets/audio, see CREDITS.md) are used for
// the impact/UI sounds; every SoundName also has a procedural synth version, which is used for the
// rest and as a fallback while samples load or if decoding fails (e.g. no Ogg support). Ambience
// loops are synthesized once into an AudioBuffer per table.
import type { TableId } from '@bp/shared';

export type SoundName = 'throw' | 'table_bounce' | 'cup_hit' | 'splash' | 'swat' | 'cheer' | 'groan' | 'win' | 'lose' | 'ui_click';

export interface AudioSystem {
  /** Must be called from a user gesture before sounds play. */
  unlock(): Promise<void>;
  play(name: SoundName, opts?: { volume?: number }): void;
  setAmbience(table: TableId | null): void;
  setMuted(muted: boolean): void;
  /** Optional extra: current mute state (persisted in localStorage). */
  isMuted?(): boolean;
}

const SAMPLE_FILES: Partial<Record<SoundName, string[]>> = {
  table_bounce: ['table_bounce_1.ogg', 'table_bounce_2.ogg', 'table_bounce_3.ogg'],
  cup_hit: ['cup_hit_1.ogg', 'cup_hit_2.ogg'],
  swat: ['swat_1.ogg'],
  ui_click: ['ui_click_1.ogg'],
};

/** Per-sound base gain so everything sits at a similar loudness. */
const BASE_GAIN: Record<SoundName, number> = {
  throw: 0.35,
  table_bounce: 0.8,
  cup_hit: 0.9,
  splash: 0.6,
  swat: 0.8,
  cheer: 0.45,
  groan: 0.4,
  win: 0.45,
  lose: 0.4,
  ui_click: 0.35,
};

const AMBIENCE_GAIN = 0.16;
const MUTE_KEY = 'bp.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

interface Env {
  a: number; // attack, s
  h?: number; // hold, s
  r: number; // release, s
  peak: number;
}

export function createAudio(): AudioSystem {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let ambBus: GainNode | null = null;
  let muted = readMuted();
  let noiseBuf: AudioBuffer | null = null;
  const samples = new Map<SoundName, AudioBuffer[]>();
  let samplesRequested = false;
  const ambBuffers = new Map<TableId, AudioBuffer>();
  let ambTable: TableId | null = null;
  let ambSource: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  function ensureCtx(): AudioContext | null {
    if (ctx) return ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    // Gentle limiter so stacked sounds never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = AMBIENCE_GAIN;
    ambBus.connect(master);
    return ctx;
  }

  function noise(c: AudioContext): AudioBuffer {
    if (noiseBuf) return noiseBuf;
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function loadSamples(c: AudioContext) {
    if (samplesRequested) return;
    samplesRequested = true;
    const base = `${import.meta.env.BASE_URL}assets/audio/`;
    for (const [name, files] of Object.entries(SAMPLE_FILES) as [SoundName, string[]][]) {
      for (const f of files) {
        fetch(base + f)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
          .then((ab) => c.decodeAudioData(ab))
          .then((buf) => {
            const list = samples.get(name) ?? [];
            list.push(buf);
            samples.set(name, list);
          })
          .catch(() => {
            /* the synth fallback stays in use */
          });
      }
    }
  }

  // ---------- synth building blocks ----------

  function envGain(c: AudioContext, t: number, e: Env, out: AudioNode): GainNode {
    const g = c.createGain();
    const peak = Math.max(e.peak, 0.0002);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + e.a);
    const hEnd = t + e.a + (e.h ?? 0);
    g.gain.setValueAtTime(peak, hEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, hEnd + e.r);
    g.connect(out);
    return g;
  }

  function noiseSrc(c: AudioContext, t: number, dur: number): AudioBufferSourceNode {
    const s = c.createBufferSource();
    s.buffer = noise(c);
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  function filter(c: AudioContext, type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  function osc(c: AudioContext, type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** Vibrato/tremolo helper: sine LFO of `rate` Hz and `depth` added to `param`. */
  function lfo(c: AudioContext, param: AudioParam, rate: number, depth: number, t: number, dur: number) {
    const o = osc(c, 'sine', rate, t, dur);
    const amt = c.createGain();
    amt.gain.value = depth;
    o.connect(amt).connect(param);
  }

  const rand = (a: number, b: number) => a + Math.random() * (b - a);

  // ---------- procedural sounds ----------

  const synth: Record<SoundName, (c: AudioContext, t: number, out: AudioNode) => void> = {
    throw(c, t, out) {
      // Whoosh: band-passed noise sweeping up then down.
      const bp = filter(c, 'bandpass', 400, 1.2);
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(1800, t + 0.14);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.32);
      noiseSrc(c, t, 0.4).connect(bp).connect(envGain(c, t, { a: 0.08, r: 0.26, peak: 0.9 }, out));
    },
    table_bounce(c, t, out) {
      // Ping-pong "tok": short high sine + click.
      const f = rand(1900, 2400);
      const o = osc(c, 'sine', f, t, 0.08);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.06);
      o.connect(envGain(c, t, { a: 0.001, r: 0.06, peak: 0.6 }, out));
      noiseSrc(c, t, 0.03).connect(filter(c, 'highpass', 3000)).connect(envGain(c, t, { a: 0.001, r: 0.015, peak: 0.5 }, out));
    },
    cup_hit(c, t, out) {
      // Hollow plastic thock.
      const f = rand(520, 680);
      const o = osc(c, 'triangle', f, t, 0.12);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.1);
      o.connect(envGain(c, t, { a: 0.002, r: 0.1, peak: 0.7 }, out));
      noiseSrc(c, t, 0.06).connect(filter(c, 'bandpass', 1300, 2)).connect(envGain(c, t, { a: 0.001, r: 0.05, peak: 0.6 }, out));
    },
    splash(c, t, out) {
      // Noise burst with a closing low-pass, plus a few bubbles.
      const lp = filter(c, 'lowpass', 4000, 0.7);
      lp.frequency.setValueAtTime(4500, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.45);
      noiseSrc(c, t, 0.55).connect(lp).connect(envGain(c, t, { a: 0.005, h: 0.03, r: 0.45, peak: 0.9 }, out));
      for (let i = 0; i < 6; i++) {
        const bt = t + 0.05 + Math.random() * 0.35;
        const f = rand(500, 1300);
        const o = osc(c, 'sine', f, bt, 0.06);
        o.frequency.exponentialRampToValueAtTime(f * 1.8, bt + 0.05);
        o.connect(envGain(c, bt, { a: 0.003, r: 0.05, peak: 0.25 }, out));
      }
    },
    swat(c, t, out) {
      const o = osc(c, 'sine', 160, t, 0.15);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      o.connect(envGain(c, t, { a: 0.002, r: 0.12, peak: 0.9 }, out));
      noiseSrc(c, t, 0.1).connect(filter(c, 'bandpass', 1100, 0.8)).connect(envGain(c, t, { a: 0.001, r: 0.08, peak: 0.8 }, out));
    },
    cheer(c, t, out) {
      // Crowd roar: formant-filtered noise layers with flutter + a handful of rising "woo" voices.
      const dur = 1.8;
      for (const [f, q, p] of [[550, 1.5, 0.7], [1200, 2, 0.5], [2600, 3, 0.3]] as const) {
        const trem = c.createGain();
        trem.gain.value = 0.75;
        lfo(c, trem.gain, rand(5, 9), 0.25, t, dur);
        noiseSrc(c, t, dur)
          .connect(filter(c, 'bandpass', f, q))
          .connect(trem)
          .connect(envGain(c, t, { a: 0.18, h: 0.6, r: 1.0, peak: p }, out));
      }
      for (let i = 0; i < 6; i++) {
        const vt = t + Math.random() * 0.3;
        const base = rand(260, 520);
        const o = osc(c, 'sawtooth', base, vt, 1.2);
        o.frequency.linearRampToValueAtTime(base * rand(1.4, 1.9), vt + 0.35);
        o.frequency.linearRampToValueAtTime(base * rand(1.1, 1.3), vt + 1.1);
        lfo(c, o.frequency, rand(5, 7), base * 0.03, vt, 1.2);
        o.connect(filter(c, 'bandpass', rand(800, 1400), 3)).connect(envGain(c, vt, { a: 0.12, h: 0.4, r: 0.6, peak: 0.12 }, out));
      }
    },
    groan(c, t, out) {
      // "Awww": low voices gliding down.
      for (let i = 0; i < 7; i++) {
        const vt = t + Math.random() * 0.15;
        const base = rand(170, 300);
        const o = osc(c, 'sawtooth', base, vt, 1.4);
        o.frequency.linearRampToValueAtTime(base * 0.85, vt + 0.3);
        o.frequency.exponentialRampToValueAtTime(base * 0.55, vt + 1.3);
        lfo(c, o.frequency, rand(4, 6), base * 0.025, vt, 1.4);
        o.connect(filter(c, 'lowpass', 900, 1)).connect(envGain(c, vt, { a: 0.15, h: 0.4, r: 0.8, peak: 0.13 }, out));
      }
      noiseSrc(c, t, 1.4).connect(filter(c, 'bandpass', 500, 1.5)).connect(envGain(c, t, { a: 0.2, h: 0.4, r: 0.7, peak: 0.25 }, out));
    },
    win(c, t, out) {
      // Major arpeggio fanfare.
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const nt = t + i * 0.12;
        const last = i === notes.length - 1;
        for (const [type, p] of [['square', 0.12], ['triangle', 0.35]] as const) {
          osc(c, type, f, nt, last ? 0.9 : 0.2).connect(envGain(c, nt, { a: 0.01, h: last ? 0.35 : 0.06, r: last ? 0.5 : 0.12, peak: p }, out));
        }
      });
    },
    lose(c, t, out) {
      // Sad trombone: wah wah wah waaah.
      const notes = [311.13, 293.66, 277.18, 261.63];
      notes.forEach((f, i) => {
        const nt = t + i * 0.42;
        const last = i === notes.length - 1;
        const dur = last ? 1.0 : 0.38;
        const o = osc(c, 'sawtooth', f, nt, dur);
        if (last) lfo(c, o.frequency, 6, 6, nt, dur);
        const lp = filter(c, 'lowpass', 600, 2);
        lp.frequency.setValueAtTime(400, nt);
        lp.frequency.linearRampToValueAtTime(1300, nt + 0.12);
        lp.frequency.linearRampToValueAtTime(700, nt + dur);
        o.connect(lp).connect(envGain(c, nt, { a: 0.03, h: dur - 0.2, r: 0.17, peak: 0.45 }, out));
      });
    },
    ui_click(c, t, out) {
      osc(c, 'sine', 1500, t, 0.05).connect(envGain(c, t, { a: 0.001, r: 0.04, peak: 0.5 }, out));
    },
  };

  // ---------- ambience (pre-rendered loops) ----------

  function renderAmbience(c: AudioContext, table: TableId): AudioBuffer {
    const sr = c.sampleRate;
    const seconds = 8; // loop length; every periodic component divides it evenly
    const fade = Math.floor(sr * 0.5);
    const len = sr * seconds;
    const total = len + fade;
    const buf = c.createBuffer(2, len, sr);
    const L = new Float32Array(total);
    const R = new Float32Array(total);
    const TAU = Math.PI * 2;

    // Brown-ish noise generator (leaky integrated white noise).
    const brown = () => {
      let last = 0;
      return () => {
        last = (last + 0.02 * (Math.random() * 2 - 1)) * 0.995;
        return last * 3.5;
      };
    };

    if (table === 'basement') {
      // Party murmur (two decorrelated band-limited noise beds with slow swells) + a muffled
      // four-on-the-floor beat and bassline coming through the ceiling.
      const nL = brown();
      const nR = brown();
      let slowL = 0;
      let slowR = 0;
      const beat = 60 / 120; // 16 beats in 8 s
      const bassNotes = [55, 55, 65.41, 49];
      let muffled = 0;
      for (let i = 0; i < total; i++) {
        const tl = (i / sr) % seconds;
        const a = nL();
        const b = nR();
        slowL += (a - slowL) * 0.02;
        slowR += (b - slowR) * 0.02;
        const swell = 0.7 + 0.3 * Math.sin((TAU * tl) / 4) * Math.sin((TAU * tl) / 8 + 1);
        const bt = tl % beat;
        const beatIdx = Math.floor(tl / beat);
        const kickF = 50 + 70 * Math.exp(-bt * 30);
        const kick = Math.sin(TAU * kickF * bt) * Math.exp(-bt * 9);
        const bassF = bassNotes[Math.floor(beatIdx / 4) % 4]!;
        const off = (bt + beat / 2) % beat;
        const bass = Math.sin(TAU * bassF * tl) * 0.35 * Math.exp(-off * 5);
        muffled += ((kick * 0.9 + bass) * 0.6 - muffled) * 0.08;
        L[i] = (a - slowL) * 0.5 * swell + muffled;
        R[i] = (b - slowR) * 0.5 * (1.4 - swell * 0.6) + muffled;
      }
    } else {
      // Crickets (a few chirping at different rates and pans) + a slow breeze.
      const crickets = [
        { f: 4400, rate: 2, pulses: 3, panL: 0.8, panR: 0.3, phase: 0 },
        { f: 4900, rate: 1.5, pulses: 4, panL: 0.3, panR: 0.9, phase: 0.31 },
        { f: 4100, rate: 1, pulses: 3, panL: 0.6, panR: 0.6, phase: 0.62 },
        { f: 5200, rate: 2.5, pulses: 2, panL: 0.9, panR: 0.2, phase: 0.17 },
      ];
      const pulseLen = 0.035;
      const nL = brown();
      const nR = brown();
      for (let i = 0; i < total; i++) {
        const tl = (i / sr) % seconds;
        let l = 0;
        let r = 0;
        for (const k of crickets) {
          const local = (((tl * k.rate + k.phase) % 1) / k.rate); // seconds into this chirp group
          let env = 0;
          if (local < k.pulses * pulseLen) env = Math.sin((Math.PI * (local % pulseLen)) / pulseLen) ** 2;
          // Occasional rests so it doesn't sound mechanical (periodic within the loop).
          const rest = Math.sin((TAU * tl) / 8 + k.phase * 10) > -0.4 ? 1 : 0;
          const s = Math.sin(TAU * k.f * tl) * env * rest * 0.12;
          l += s * k.panL;
          r += s * k.panR;
        }
        const gust = 0.5 + 0.5 * Math.sin((TAU * tl) / 8 - 1.2);
        L[i] = l + nL() * 0.35 * (0.3 + gust);
        R[i] = r + nR() * 0.35 * (0.3 + gust * 0.8);
      }
    }

    // Crossfade the tail into the head for a seamless loop, then normalize.
    const outL = buf.getChannelData(0);
    const outR = buf.getChannelData(1);
    let peak = 0;
    for (let i = 0; i < len; i++) {
      let l = L[i]!;
      let r = R[i]!;
      if (i < fade) {
        const w = i / fade;
        l = l * w + L[len + i]! * (1 - w);
        r = r * w + R[len + i]! * (1 - w);
      }
      outL[i] = l;
      outR[i] = r;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) {
      outL[i] = outL[i]! * norm;
      outR[i] = outR[i]! * norm;
    }
    return buf;
  }

  function startAmbience() {
    const c = ctx;
    if (!c || !ambBus || ambTable === null || c.state !== 'running' || ambSource) return;
    let buf = ambBuffers.get(ambTable);
    if (!buf) {
      buf = renderAmbience(c, ambTable);
      ambBuffers.set(ambTable, buf);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(1, t + 2);
    src.connect(gain).connect(ambBus);
    src.start(t);
    ambSource = { src, gain };
  }

  function stopAmbience() {
    if (!ambSource || !ctx) return;
    const { src, gain } = ambSource;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    src.stop(t + 0.9);
    ambSource = null;
  }

  return {
    async unlock() {
      const c = ensureCtx();
      if (!c) return;
      if (c.state !== 'running') {
        try {
          await c.resume();
        } catch {
          /* ignore */
        }
      }
      loadSamples(c);
      startAmbience();
    },

    play(name, opts) {
      const c = ensureCtx();
      if (!c || !sfxBus || c.state !== 'running') return;
      const t = c.currentTime + 0.005;
      const out = c.createGain();
      out.gain.value = BASE_GAIN[name] * (opts?.volume ?? 1);
      out.connect(sfxBus);
      const list = samples.get(name);
      if (list && list.length > 0) {
        const src = c.createBufferSource();
        src.buffer = list[Math.floor(Math.random() * list.length)]!;
        src.playbackRate.value = rand(0.94, 1.06);
        src.connect(out);
        src.start(t);
        src.onended = () => out.disconnect();
      } else {
        synth[name](c, t, out);
        setTimeout(() => out.disconnect(), 4000);
      }
    },

    setAmbience(table) {
      if (table === ambTable) return;
      stopAmbience();
      ambTable = table;
      startAmbience();
    },

    setMuted(m) {
      muted = m;
      try {
        localStorage.setItem(MUTE_KEY, m ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (ctx && master) {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(m ? 0 : 1, t, 0.05);
      }
    },

    isMuted: () => muted,
  };
}
