// Lazy-loaded engine sound driven by GPS speed changes. Loaded only when the
// user enables it, so it never affects map load time.
export type EngineSound = { update: (speedMps: number | null, t: number) => void; stop: () => void };

export function createEngineSound(): EngineSound {
  const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = "sawtooth";
  o2.type = "square";
  o1.frequency.value = 45;
  o2.frequency.value = 22.5;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  o1.connect(filter);
  o2.connect(g2).connect(filter);
  filter.connect(master).connect(ctx.destination);
  o1.start();
  o2.start();
  void ctx.resume();

  let lastV: number | null = null;
  let lastT = 0;
  let accel = 0;

  return {
    update(v, t) {
      if (v == null || !Number.isFinite(v)) return;
      if (lastV != null && t > lastT) {
        const dt = (t - lastT) / 1000;
        if (dt > 0.2 && dt < 5) accel = accel * 0.5 + ((v - lastV) / dt) * 0.5;
      }
      lastV = v;
      lastT = t;
      const now = ctx.currentTime;
      const a = Math.max(0, Math.min(accel / 3, 1)); // 0..1 at ~3 m/s²
      const vol = v < 0.5 ? 0.03 : accel < -0.3 ? 0.04 : 0.08 + a * 0.4;
      const freq = 40 + Math.min(v, 40) * 2 + a * 60;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(vol, now + 0.6);
      o1.frequency.linearRampToValueAtTime(freq, now + 0.6);
      o2.frequency.linearRampToValueAtTime(freq / 2, now + 0.6);
      filter.frequency.linearRampToValueAtTime(400 + a * 1600, now + 0.6);
    },
    stop() {
      try {
        o1.stop();
        o2.stop();
      } catch {}
      void ctx.close();
    },
  };
}
