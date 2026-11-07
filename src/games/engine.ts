import { useEffect, useRef } from "react";

// Game palette (canvas can't read Tailwind classes; kept in one place).
export const PAL = {
  bg: "#0b1220",
  grid: "#16233a",
  primary: "#38bdf8",
  accent: "#f472b6",
  good: "#4ade80",
  warn: "#facc15",
  bad: "#f87171",
  text: "#e2e8f0",
  dim: "#64748b",
};

export type Ctx = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dt: number;
};

export type Handlers = {
  step: (c: Ctx) => void;
  down?: (x: number, y: number) => void;
  move?: (x: number, y: number) => void;
  up?: (x: number, y: number) => void;
  swipe?: (dir: "up" | "down" | "left" | "right") => void;
  key?: (k: string) => void;
};

/** Runs a canvas game loop sized to its parent, with pointer + swipe + keyboard input. */
export function useCanvasGame(make: () => Handlers) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const h = make();
    let w = 0, hh = 0, raf = 0, last = performance.now();
    const resize = () => {
      const r = cv.parentElement!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; hh = r.height;
      cv.width = w * dpr; cv.height = hh * dpr;
      cv.style.width = w + "px"; cv.style.height = hh + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      h.step({ ctx, w, h: hh, dt });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let sx = 0, sy = 0;
    const pos = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const pd = (e: PointerEvent) => {
      e.preventDefault();
      const [x, y] = pos(e); sx = x; sy = y;
      h.down?.(x, y);
    };
    const pm = (e: PointerEvent) => { const [x, y] = pos(e); h.move?.(x, y); };
    const pu = (e: PointerEvent) => {
      const [x, y] = pos(e);
      const dx = x - sx, dy = y - sy;
      if (h.swipe && Math.hypot(dx, dy) > 25) {
        h.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
      }
      h.up?.(x, y);
    };
    const kd = (e: KeyboardEvent) => {
      const map: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      };
      if (map[e.key] && h.swipe) { e.preventDefault(); h.swipe(map[e.key]!); }
      h.key?.(e.key);
    };
    cv.addEventListener("pointerdown", pd);
    cv.addEventListener("pointermove", pm);
    cv.addEventListener("pointerup", pu);
    window.addEventListener("keydown", kd);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", pd);
      cv.removeEventListener("pointermove", pm);
      cv.removeEventListener("pointerup", pu);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

export function hud(ctx: CanvasRenderingContext2D, w: number, left: string, right = "") {
  ctx.fillStyle = PAL.text;
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(left, 20, 36);
  ctx.textAlign = "right";
  ctx.fillText(right, w - 20, 36);
}

export function overlay(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, sub: string) {
  ctx.fillStyle = "rgba(2,6,23,0.7)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PAL.text;
  ctx.textAlign = "center";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText(title, w / 2, h / 2 - 10);
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillStyle = PAL.primary;
  ctx.fillText(sub, w / 2, h / 2 + 30);
}

export function best(id: string, score: number): number {
  try {
    const k = "tmg:best:" + id;
    const b = Math.max(score, Number(localStorage.getItem(k) || 0));
    localStorage.setItem(k, String(b));
    return b;
  } catch {
    return score;
  }
}
