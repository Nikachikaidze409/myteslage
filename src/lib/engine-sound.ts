// Lazy-loaded engine sound driven by GPS movement. Loaded only when the user
// enables it, so it never affects map load time.
//
// Sound: a pre-rendered V8 combustion loop (uneven cross-plane firing pulses,
// exhaust body, intake noise) played back at a rate tied to "RPM". Speed is
// derived from consecutive positions because Tesla's browser often reports
// coords.speed as null.
export type EngineSound = {
  update: (fix: { lat: number; lng: number; speed?: number | null; timestamp?: number }) => void;
  stop: () => void;
};

const BASE_RPM = 1000; // rpm the loop is rendered at
const IDLE_RPM = 800;
const MAX_RPM = 5500;

function renderLoop(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const cycles = 8; // 8 engine cycles (2 rev each) at BASE_RPM
  const cycleSec = (2 * 60) / BASE_RPM;
  const len = Math.round(sr * cycleSec * cycles);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  // Cross-plane V8: firing intervals uneven per bank -> characteristic burble.
  const offsets = [0, 0.11, 0.25, 0.36, 0.5, 0.62, 0.75, 0.87];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let c = 0; c < cycles; c++) {
    offsets.forEach((o, i) => {
      const start = Math.round((c + o) * cycleSec * sr);
      const amp = 0.75 + (i % 2 ? 0.25 : 0) + rnd() * 0.12;
      const f = 70 + rnd() * 6;
      const pulseLen = Math.round(sr * 0.045);
      for (let k = 0; k < pulseLen; k++) {
        const t = k / sr;
        const env = Math.exp(-t * 75) * (1 - Math.exp(-t * 900));
        const v = amp * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 2.03 * t) + 0.35 * rnd());
        d[(start + k) % len] += v;
      }
    });
  }
  // Smooth (exhaust pipe) + light intake hiss, then normalize.
  let lp = 0, max = 0;
  for (let i = 0; i < len; i++) {
    lp += (d[i] - lp) * 0.18;
    d[i] = lp + rnd() * 0.015;
    max = Math.max(max, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] = (d[i] / max) * 0.9;
  return buf;
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function createEngineSound(ctx: AudioContext): EngineSound {
  const src = ctx.createBufferSource();
  src.buffer = renderLoop(ctx);
  src.loop = true;
  src.playbackRate.value = IDLE_RPM / BASE_RPM;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 900;
  const bass = ctx.createBiquadFilter();
  bass.type = "lowshelf";
  bass.frequency.value = 120;
  bass.gain.value = 6;
  const master = ctx.createGain();
  master.gain.value = 0.15;
  src.connect(bass).connect(tone).connect(master).connect(ctx.destination);
  src.start();
  void ctx.resume();

  let last: { lat: number; lng: number; t: number } | null = null;
  let speed = 0; // m/s, smoothed
  let accel = 0; // m/s², smoothed

  return {
    update(fix) {
      const t = fix.timestamp ?? Date.now();
      let v: number | null = null;
      if (last && t > last.t) {
        const dt = (t - last.t) / 1000;
        if (dt < 0.15) return;
        const derived = dt < 6 ? metres(last, fix) / dt : 0;
        v = fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : derived;
        v = Math.min(v, 70);
        const prev = speed;
        speed = speed * 0.4 + v * 0.6;
        if (dt < 6) accel = accel * 0.4 + ((speed - prev) / dt) * 0.6;
      }
      last = { lat: fix.lat, lng: fix.lng, t };
      if (v == null) return;

      const throttle = Math.max(0, Math.min(accel / 2.5, 1)); // 0..1
      const braking = accel < -0.4;
      // Simple gearbox feel: RPM climbs with speed within each 12 m/s "gear".
      const gearPos = (speed % 12) / 12;
      const rpm = speed < 0.7
        ? IDLE_RPM
        : Math.min(MAX_RPM, 1300 + gearPos * 2200 + throttle * 1800 - (braking ? 500 : 0));
      const vol = speed < 0.7 ? 0.15 : braking ? 0.08 : 0.25 + throttle * 0.6;
      const now = ctx.currentTime;
      const ramp = throttle > 0.2 ? 0.35 : 0.8;
      for (const p of [src.playbackRate, master.gain, tone.frequency]) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
      }
      src.playbackRate.linearRampToValueAtTime(rpm / BASE_RPM, now + ramp);
      master.gain.linearRampToValueAtTime(vol, now + ramp);
      tone.frequency.linearRampToValueAtTime(braking ? 600 : 900 + throttle * 2500, now + ramp);
    },
    stop() {
      try { src.stop(); } catch {}
      void ctx.close();
    },
  };
}
