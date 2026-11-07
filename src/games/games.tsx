import { PAL, best, hud, overlay, useCanvasGame } from "./engine";

const TAP = "შეეხე დასაწყებად • Tap to start";

/* ---------------- Drift Boss ---------------- */
export function DriftGame() {
  const ref = useCanvasGame(() => {
    let state: "idle" | "run" | "over" = "idle";
    let segs: { x: number; y: number }[] = [];
    let car = { x: 0, y: 0, dir: 1 };
    let score = 0, hi = best("drift", 0), cam = 0;
    const SEG = 90, ROAD = 46;
    const reset = () => {
      segs = [{ x: 0, y: 0 }];
      let d = 1;
      for (let i = 0; i < 60; i++) addSeg(d = Math.random() < 0.35 ? -d : d);
      car = { x: 0, y: 0, dir: 1 }; score = 0; cam = 0;
    };
    const addSeg = (d: number) => {
      const p = segs[segs.length - 1]!;
      segs.push({ x: p.x + d * SEG * 0.7, y: p.y - SEG * 0.7 });
    };
    const onRoad = () => {
      for (let i = 0; i < segs.length - 1; i++) {
        const a = segs[i]!, b = segs[i + 1]!;
        const vx = b.x - a.x, vy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((car.x - a.x) * vx + (car.y - a.y) * vy) / (vx * vx + vy * vy)));
        if (Math.hypot(car.x - (a.x + vx * t), car.y - (a.y + vy * t)) < ROAD / 2) return true;
      }
      return false;
    };
    reset();
    return {
      down: () => {
        if (state !== "run") { reset(); state = "run"; return; }
        car.dir *= -1;
      },
      key: (k) => { if (k === " ") { if (state !== "run") { reset(); state = "run"; } else car.dir *= -1; } },
      step: ({ ctx, w, h, dt }) => {
        if (state === "run") {
          const sp = 170 + score * 1.5;
          car.x += car.dir * sp * 0.7 * dt; car.y -= sp * 0.7 * dt;
          score = Math.floor(-car.y / 20);
          while (segs[segs.length - 1]!.y > car.y - 1500) addSeg(Math.random() < 0.35 ? -1 : 1);
          if (!onRoad()) { state = "over"; hi = best("drift", score); }
        }
        cam += (car.y - cam) * 0.15;
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        ctx.save(); ctx.translate(w / 2 - car.x, h * 0.7 - cam);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = PAL.grid; ctx.lineWidth = ROAD + 10;
        ctx.beginPath(); segs.forEach((s, i) => (i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y))); ctx.stroke();
        ctx.strokeStyle = "#334155"; ctx.lineWidth = ROAD; ctx.stroke();
        ctx.translate(car.x, car.y); ctx.rotate(car.dir > 0 ? Math.PI / 4 : -Math.PI / 4);
        ctx.fillStyle = PAL.accent; ctx.fillRect(-9, -15, 18, 30);
        ctx.fillStyle = PAL.primary; ctx.fillRect(-7, -12, 14, 7);
        ctx.restore();
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "idle") overlay(ctx, w, h, "DRIFT", TAP);
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- 2048 ---------------- */
export function Game2048() {
  const ref = useCanvasGame(() => {
    let g: number[][] = [], score = 0, hi = best("2048", 0), over = false;
    const empty = () => g.flatMap((r, y) => r.map((v, x) => (v ? null : [x, y]))).filter(Boolean) as number[][];
    const add = () => { const e = empty(); if (e.length) { const [x, y] = e[Math.floor(Math.random() * e.length)]!; g[y]![x] = Math.random() < 0.9 ? 2 : 4; } };
    const reset = () => { g = Array.from({ length: 4 }, () => [0, 0, 0, 0]); score = 0; over = false; add(); add(); };
    const slide = (row: number[]) => {
      const r = row.filter(Boolean);
      for (let i = 0; i < r.length - 1; i++) if (r[i] === r[i + 1]) { r[i]! *= 2; score += r[i]!; r.splice(i + 1, 1); }
      while (r.length < 4) r.push(0);
      return r;
    };
    const moveDir = (d: string) => {
      const before = JSON.stringify(g);
      for (let i = 0; i < 4; i++) {
        let line = d === "left" || d === "right" ? [...g[i]!] : g.map((r) => r[i]!);
        if (d === "right" || d === "down") line.reverse();
        line = slide(line);
        if (d === "right" || d === "down") line.reverse();
        line.forEach((v, j) => { if (d === "left" || d === "right") g[i]![j] = v; else g[j]![i] = v; });
      }
      if (JSON.stringify(g) !== before) add();
      hi = best("2048", score);
      if (!empty().length && !["left", "right", "up", "down"].some((dd) => { const s = JSON.stringify(g); const sc = score; const cp = g.map((r) => [...r]); moveTest(dd); const ch = JSON.stringify(g) !== s; g = cp; score = sc; return ch; })) over = true;
    };
    const moveTest = (d: string) => {
      for (let i = 0; i < 4; i++) {
        let line = d === "left" || d === "right" ? [...g[i]!] : g.map((r) => r[i]!);
        if (d === "right" || d === "down") line.reverse();
        line = slide(line);
        if (d === "right" || d === "down") line.reverse();
        line.forEach((v, j) => { if (d === "left" || d === "right") g[i]![j] = v; else g[j]![i] = v; });
      }
    };
    const colors: Record<number, string> = { 2: "#1e3a5f", 4: "#1e4f7a", 8: "#0e7490", 16: "#0891b2", 32: "#7c3aed", 64: "#a21caf", 128: "#db2777", 256: "#e11d48", 512: "#ea580c", 1024: "#d97706", 2048: "#facc15" };
    reset();
    return {
      swipe: (d) => (over ? reset() : moveDir(d)),
      down: () => { if (over) reset(); },
      step: ({ ctx, w, h }) => {
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        const size = Math.min(w, h - 80) * 0.85, cell = size / 4, ox = (w - size) / 2, oy = 70 + (h - 70 - size) / 2;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const v = g[y]![x]!;
          ctx.fillStyle = v ? colors[v] ?? "#facc15" : PAL.grid;
          ctx.beginPath(); ctx.roundRect(ox + x * cell + 6, oy + y * cell + 6, cell - 12, cell - 12, 14); ctx.fill();
          if (v) { ctx.fillStyle = PAL.text; ctx.textAlign = "center"; ctx.font = `bold ${cell * (v > 999 ? 0.28 : 0.38)}px system-ui`; ctx.fillText(String(v), ox + x * cell + cell / 2, oy + y * cell + cell / 2 + cell * 0.13); }
        }
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (over) overlay(ctx, w, h, "Game over", TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- Space shooter ---------------- */
export function SpaceGame() {
  const ref = useCanvasGame(() => {
    let state: "idle" | "run" | "over" = "idle";
    let ship = { x: 0, y: 0 }, tx = 0, bullets: { x: number; y: number }[] = [], foes: { x: number; y: number; v: number }[] = [];
    let stars: { x: number; y: number; s: number }[] = [], cd = 0, spawn = 0, score = 0, hi = best("space", 0), W = 0, H = 0;
    const reset = () => { ship = { x: W / 2, y: H - 80 }; tx = W / 2; bullets = []; foes = []; score = 0; };
    return {
      down: (x) => { if (state !== "run") { reset(); state = "run"; } tx = x; },
      move: (x) => { tx = x; },
      step: ({ ctx, w, h, dt }) => {
        W = w; H = h;
        if (!stars.length) stars = Array.from({ length: 80 }, () => ({ x: Math.random() * w, y: Math.random() * h, s: Math.random() * 2 + 0.5 }));
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = PAL.dim;
        stars.forEach((s) => { s.y = (s.y + s.s * 60 * dt) % h; ctx.fillRect(s.x, s.y, s.s, s.s); });
        if (state === "run") {
          ship.y = h - 80; ship.x += (tx - ship.x) * Math.min(1, dt * 12);
          if ((cd -= dt) <= 0) { bullets.push({ x: ship.x, y: ship.y - 20 }); cd = 0.18; }
          if ((spawn -= dt) <= 0) { foes.push({ x: 30 + Math.random() * (w - 60), y: -20, v: 90 + Math.random() * 80 + score * 2 }); spawn = Math.max(0.25, 0.9 - score * 0.01); }
          bullets.forEach((b) => (b.y -= 600 * dt)); bullets = bullets.filter((b) => b.y > -10);
          foes.forEach((f) => (f.y += f.v * dt));
          foes = foes.filter((f) => {
            const hit = bullets.findIndex((b) => Math.hypot(b.x - f.x, b.y - f.y) < 22);
            if (hit >= 0) { bullets.splice(hit, 1); score++; return false; }
            if (Math.hypot(ship.x - f.x, ship.y - f.y) < 30 || f.y > h + 20) { state = "over"; hi = best("space", score); }
            return true;
          });
        }
        ctx.fillStyle = PAL.warn; bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y - 8, 4, 14));
        ctx.fillStyle = PAL.bad;
        foes.forEach((f) => { ctx.beginPath(); ctx.moveTo(f.x, f.y + 16); ctx.lineTo(f.x - 18, f.y - 12); ctx.lineTo(f.x + 18, f.y - 12); ctx.fill(); });
        if (state !== "idle") { ctx.fillStyle = PAL.primary; ctx.beginPath(); ctx.moveTo(ship.x, ship.y - 24); ctx.lineTo(ship.x - 20, ship.y + 18); ctx.lineTo(ship.x + 20, ship.y + 18); ctx.fill(); }
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "idle") overlay(ctx, w, h, "GALAXY DEFENDER", TAP);
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- Snake ---------------- */
export function SnakeGame() {
  const ref = useCanvasGame(() => {
    const N = 20;
    let state: "idle" | "run" | "over" = "idle";
    let snake = [{ x: 10, y: 10 }], dir = { x: 1, y: 0 }, nextDir = dir, food = { x: 15, y: 10 }, acc = 0, score = 0, hi = best("snake", 0);
    const place = () => { do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (snake.some((s) => s.x === food.x && s.y === food.y)); };
    const reset = () => { snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; dir = nextDir = { x: 1, y: 0 }; score = 0; place(); };
    reset();
    return {
      swipe: (d) => {
        if (state !== "run") { reset(); state = "run"; }
        const v = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[d];
        if (v.x !== -dir.x || v.y !== -dir.y) nextDir = v;
      },
      down: () => { if (state !== "run") { reset(); state = "run"; } },
      step: ({ ctx, w, h, dt }) => {
        if (state === "run" && (acc += dt) > Math.max(0.06, 0.14 - score * 0.002)) {
          acc = 0; dir = nextDir;
          const head = { x: (snake[0]!.x + dir.x + N) % N, y: (snake[0]!.y + dir.y + N) % N };
          if (snake.some((s) => s.x === head.x && s.y === head.y)) { state = "over"; hi = best("snake", score); }
          else { snake.unshift(head); if (head.x === food.x && head.y === food.y) { score++; place(); } else snake.pop(); }
        }
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        const size = Math.min(w, h - 70) * 0.92, c = size / N, ox = (w - size) / 2, oy = 60 + (h - 60 - size) / 2;
        ctx.fillStyle = PAL.grid; ctx.fillRect(ox, oy, size, size);
        ctx.fillStyle = PAL.accent; ctx.beginPath(); ctx.arc(ox + food.x * c + c / 2, oy + food.y * c + c / 2, c * 0.4, 0, 7); ctx.fill();
        snake.forEach((s, i) => { ctx.fillStyle = i ? PAL.good : PAL.primary; ctx.beginPath(); ctx.roundRect(ox + s.x * c + 1, oy + s.y * c + 1, c - 2, c - 2, 4); ctx.fill(); });
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "idle") overlay(ctx, w, h, "CYBER SNAKE", "გაუსვი თითი • Swipe to start");
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- Flappy ---------------- */
export function FlappyGame() {
  const ref = useCanvasGame(() => {
    let state: "idle" | "run" | "over" = "idle";
    let y = 0, vy = 0, pipes: { x: number; gap: number; passed: boolean }[] = [], score = 0, hi = best("flappy", 0), H = 0, W = 0, t = 0;
    const GAP = 190, PW = 70;
    const reset = () => { y = H / 2; vy = 0; pipes = []; score = 0; t = 0; };
    const flap = () => { if (state !== "run") { reset(); state = "run"; } vy = -420; };
    return {
      down: flap,
      key: (k) => { if (k === " " || k === "ArrowUp") flap(); },
      step: ({ ctx, w, h, dt }) => {
        W = w; H = h; const bx = w * 0.3;
        if (state === "run") {
          vy += 1300 * dt; y += vy * dt; t += dt;
          if (!pipes.length || pipes[pipes.length - 1]!.x < w - 300) pipes.push({ x: w + PW, gap: 120 + Math.random() * (h - 240 - GAP) + GAP / 2, passed: false });
          pipes.forEach((p) => { p.x -= 220 * dt; if (!p.passed && p.x + PW < bx) { p.passed = true; score++; } });
          pipes = pipes.filter((p) => p.x > -PW);
          const hit = y < 0 || y > h || pipes.some((p) => bx + 16 > p.x && bx - 16 < p.x + PW && (y - 16 < p.gap - GAP / 2 || y + 16 > p.gap + GAP / 2));
          if (hit) { state = "over"; hi = best("flappy", score); }
        } else if (state === "idle") y = h / 2 + Math.sin(performance.now() / 300) * 10;
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = PAL.good;
        pipes.forEach((p) => { ctx.fillRect(p.x, 0, PW, p.gap - GAP / 2); ctx.fillRect(p.x, p.gap + GAP / 2, PW, h); });
        ctx.save(); ctx.translate(bx, y); ctx.rotate(Math.max(-0.5, Math.min(1, vy / 600)));
        ctx.fillStyle = PAL.warn; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, 7); ctx.fill();
        ctx.fillStyle = PAL.bg; ctx.beginPath(); ctx.arc(8, -4, 3, 0, 7); ctx.fill();
        ctx.restore();
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "idle") overlay(ctx, w, h, "CYBER BIRD", TAP);
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- Pac-Man ---------------- */
const MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.### # ###.####",
  "   #.#   G   #.#   ",
  "####.# ## ## #.####",
  "    .  #   #  .    ",
  "####.# ##### #.####",
  "   #.#       #.#   ",
  "####.# ##### #.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
];
export function PacGame() {
  const ref = useCanvasGame(() => {
    const R = MAZE.length, C = MAZE[0]!.length;
    let grid: string[][] = [], pac = { x: 0, y: 0 }, dir = { x: 0, y: 0 }, want = { x: 0, y: 0 };
    let ghosts: { x: number; y: number; d: { x: number; y: number }; c: string }[] = [];
    let state: "idle" | "run" | "over" | "win" = "idle", acc = 0, gacc = 0, score = 0, hi = best("pac", 0), power = 0, mouth = 0;
    const wall = (x: number, y: number) => grid[(y + R) % R]![(x + C) % C] === "#";
    const reset = () => {
      grid = MAZE.map((r) => r.split(""));
      ghosts = [];
      const cols = [PAL.bad, PAL.accent, PAL.primary, "#fb923c"];
      grid.forEach((r, y) => r.forEach((ch, x) => {
        if (ch === "P") { pac = { x, y }; r[x] = " "; }
        if (ch === "G") { cols.forEach((c, i) => ghosts.push({ x: x - 1 + (i % 3), y, d: { x: 0, y: -1 }, c })); r[x] = " "; }
      }));
      dir = want = { x: 0, y: 0 }; score = 0; power = 0;
    };
    reset();
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    return {
      swipe: (d) => {
        if (state !== "run") { reset(); state = "run"; }
        want = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[d];
      },
      down: () => { if (state === "over" || state === "win") { reset(); state = "idle"; } },
      step: ({ ctx, w, h, dt }) => {
        if (state === "run") {
          power = Math.max(0, power - dt); mouth += dt * 10;
          if ((acc += dt) > 0.15) {
            acc = 0;
            if (!wall(pac.x + want.x, pac.y + want.y)) dir = want;
            if (!wall(pac.x + dir.x, pac.y + dir.y)) { pac.x = (pac.x + dir.x + C) % C; pac.y = (pac.y + dir.y + R) % R; }
            const ch = grid[pac.y]![pac.x];
            if (ch === ".") { score += 10; grid[pac.y]![pac.x] = " "; }
            if (ch === "o") { score += 50; power = 7; grid[pac.y]![pac.x] = " "; }
            if (!grid.some((r) => r.includes(".") || r.includes("o"))) { state = "win"; hi = best("pac", score); }
          }
          if ((gacc += dt) > (power ? 0.28 : 0.19)) {
            gacc = 0;
            ghosts.forEach((g) => {
              const opts = dirs.filter((d) => !wall(g.x + d.x, g.y + d.y) && !(d.x === -g.d.x && d.y === -g.d.y));
              const choices = opts.length ? opts : dirs.filter((d) => !wall(g.x + d.x, g.y + d.y));
              choices.sort((a, b) => {
                const da = Math.hypot(g.x + a.x - pac.x, g.y + a.y - pac.y), db = Math.hypot(g.x + b.x - pac.x, g.y + b.y - pac.y);
                return power ? db - da : da - db;
              });
              g.d = Math.random() < 0.65 ? choices[0]! : choices[Math.floor(Math.random() * choices.length)]!;
              g.x = (g.x + g.d.x + C) % C; g.y = (g.y + g.d.y + R) % R;
            });
          }
          ghosts.forEach((g) => {
            if (g.x === pac.x && g.y === pac.y) {
              if (power) { score += 200; g.x = 9; g.y = 7; }
              else { state = "over"; hi = best("pac", score); }
            }
          });
        }
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        const c = Math.min(w / C, (h - 60) / R), ox = (w - c * C) / 2, oy = 55 + (h - 55 - c * R) / 2;
        grid.forEach((r, y) => r.forEach((ch, x) => {
          if (ch === "#") { ctx.fillStyle = "#1d4ed8"; ctx.fillRect(ox + x * c + 1, oy + y * c + 1, c - 2, c - 2); }
          if (ch === "." || ch === "o") { ctx.fillStyle = PAL.text; ctx.beginPath(); ctx.arc(ox + x * c + c / 2, oy + y * c + c / 2, ch === "o" ? c * 0.3 : c * 0.1, 0, 7); ctx.fill(); }
        }));
        const m = Math.abs(Math.sin(mouth)) * 0.7, ang = Math.atan2(dir.y, dir.x);
        ctx.fillStyle = PAL.warn; ctx.beginPath(); ctx.moveTo(ox + pac.x * c + c / 2, oy + pac.y * c + c / 2);
        ctx.arc(ox + pac.x * c + c / 2, oy + pac.y * c + c / 2, c * 0.45, ang + m / 2, ang + Math.PI * 2 - m / 2); ctx.fill();
        ghosts.forEach((g) => {
          ctx.fillStyle = power ? "#3b82f6" : g.c;
          const gx = ox + g.x * c, gy = oy + g.y * c;
          ctx.beginPath(); ctx.arc(gx + c / 2, gy + c / 2, c * 0.42, Math.PI, 0); ctx.lineTo(gx + c * 0.92, gy + c * 0.92); ctx.lineTo(gx + c * 0.08, gy + c * 0.92); ctx.fill();
        });
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "idle") overlay(ctx, w, h, "PAC-MAN", "გაუსვი თითი • Swipe to start");
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
        if (state === "win") overlay(ctx, w, h, "🏆 " + score, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

/* ---------------- Bubble shooter ---------------- */
export function BubbleGame() {
  const ref = useCanvasGame(() => {
    const COLS = 11, COLORS = [PAL.bad, PAL.good, PAL.primary, PAL.warn, PAL.accent];
    let grid: (number | null)[][] = [], shot: { x: number; y: number; vx: number; vy: number; c: number } | null = null;
    let next = 0, aim = { x: 0, y: 0 }, score = 0, hi = best("bubble", 0), shots = 0, state: "run" | "over" = "run";
    let r = 20, ox = 0, W = 0, H = 0;
    const rand = () => Math.floor(Math.random() * COLORS.length);
    const reset = () => { grid = Array.from({ length: 6 }, () => Array.from({ length: COLS }, rand)); next = rand(); score = 0; shots = 0; state = "run"; };
    const cx = (row: number, col: number) => ox + r + col * r * 2 + (row % 2 ? r : 0);
    const cy = (row: number) => 60 + r + row * r * 1.73;
    const nbrs = (row: number, col: number) => {
      const odd = row % 2;
      return [[0, -1], [0, 1], [-1, odd ? 0 : -1], [-1, odd ? 1 : 0], [1, odd ? 0 : -1], [1, odd ? 1 : 0]]
        .map(([dr, dc]) => [row + dr!, col + dc!]).filter(([a, b]) => a! >= 0 && b! >= 0 && b! < COLS && a! < grid.length);
    };
    const snap = (x: number, y: number) => {
      let bestD = 1e9, br = 0, bc = 0;
      for (let row = 0; row < grid.length + 1; row++) for (let col = 0; col < COLS; col++) {
        if (row % 2 && col === COLS - 1) continue;
        if (grid[row]?.[col] != null) continue;
        const d = Math.hypot(cx(row, col) - x, cy(row) - y);
        if (d < bestD) { bestD = d; br = row; bc = col; }
      }
      while (grid.length <= br) grid.push(Array(COLS).fill(null));
      return [br, bc] as const;
    };
    const land = (row: number, col: number, c: number) => {
      grid[row]![col] = c;
      const seen = new Set<string>(), stack = [[row, col]], group: number[][] = [];
      while (stack.length) {
        const [a, b] = stack.pop()!; const k = a + "," + b;
        if (seen.has(k) || grid[a!]?.[b!] !== c) continue;
        seen.add(k); group.push([a!, b!]); nbrs(a!, b!).forEach((n) => stack.push(n));
      }
      if (group.length >= 3) {
        group.forEach(([a, b]) => (grid[a!]![b!] = null)); score += group.length * 10;
        // drop floating
        const keep = new Set<string>(), st = grid[0]!.map((v, i) => (v != null ? [0, i] : null)).filter(Boolean) as number[][];
        while (st.length) { const [a, b] = st.pop()!; const k = a + "," + b; if (keep.has(k) || grid[a!]?.[b!] == null) continue; keep.add(k); nbrs(a!, b!).forEach((n) => st.push(n)); }
        grid.forEach((rw, a) => rw.forEach((v, b) => { if (v != null && !keep.has(a + "," + b)) { rw[b] = null; score += 20; } }));
      }
      while (grid.length && grid[grid.length - 1]!.every((v) => v == null)) grid.pop();
      if (++shots % 6 === 0) grid.unshift(Array.from({ length: COLS }, rand));
      if (cy(grid.length - 1) > H - 120) { state = "over"; hi = best("bubble", score); }
      if (!grid.length) grid = Array.from({ length: 5 }, () => Array.from({ length: COLS }, rand));
      hi = best("bubble", score);
    };
    reset();
    return {
      move: (x, y) => { aim = { x, y }; },
      down: (x, y) => { aim = { x, y }; if (state === "over") reset(); },
      up: (x, y) => {
        if (shot || state !== "run") return;
        const sx = W / 2, sy = H - 60, a = Math.atan2(y - sy, x - sx);
        if (a > -0.15 || a < -Math.PI + 0.15) return;
        shot = { x: sx, y: sy, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, c: next }; next = rand();
      },
      step: ({ ctx, w, h, dt }) => {
        W = w; H = h; r = Math.min(26, w / (COLS * 2 + 1)); ox = (w - (COLS * 2 + 1) * r) / 2;
        if (shot) {
          shot.x += shot.vx * dt; shot.y += shot.vy * dt;
          if (shot.x < ox + r || shot.x > ox + (COLS * 2 + 1) * r - r) shot.vx *= -1;
          let hit = shot.y < 60 + r;
          grid.forEach((rw, a) => rw.forEach((v, b) => { if (v != null && Math.hypot(cx(a, b) - shot!.x, cy(a) - shot!.y) < r * 1.8) hit = true; }));
          if (hit) { const [a, b] = snap(shot.x, shot.y); land(a, b, shot.c); shot = null; }
        }
        ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, w, h);
        const ball = (x: number, y: number, c: number) => { ctx.fillStyle = COLORS[c]!; ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, 7); ctx.fill(); };
        grid.forEach((rw, a) => rw.forEach((v, b) => v != null && ball(cx(a, b), cy(a), v)));
        const sx = w / 2, sy = h - 60;
        ctx.strokeStyle = PAL.dim; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(aim.x || sx, aim.y || sy - 100); ctx.stroke(); ctx.setLineDash([]);
        if (shot) ball(shot.x, shot.y, shot.c); else ball(sx, sy, next);
        hud(ctx, w, `${score}`, `BEST ${hi}`);
        if (state === "over") overlay(ctx, w, h, `${score}`, TAP);
      },
    };
  });
  return <canvas ref={ref} className="touch-none" />;
}

function embed(slug: string, title: string) {
  return function EmbedGame() {
    return (
    <iframe
      src={`https://games.crazygames.com/en_US/${slug}/index.html`}
      title={title}
      className="absolute inset-0 h-full w-full border-0"
      allow="autoplay; fullscreen; gamepad"
      allowFullScreen
    />
    );
  };
}
const PenaltyGame = embed("penalty-shooters-2", "Penalty Shooters 2");
const SubwayGame = embed("subway-surfers", "Subway Surfers");
const HillGame = embed("hill-climb-racing", "Hill Climb Racing");
const RacerGame = embed("mr-racer---car-racing", "Mr Racer");
const KarateGame = embed("karate-fighter-real-battles", "Karate Fighter");

export const GAMES = [
  { id: "penalty", name: "Penalty Shooters 2", emoji: "⚽", hint: "შეეხე და დაარტყი", C: PenaltyGame, tone: "from-green-500/40 to-sky-500/20", web: true },
  { id: "subway", name: "Subway Surfers", emoji: "🛹", hint: "გაუსვი თითი", C: SubwayGame, tone: "from-orange-500/40 to-sky-500/20", web: true },
  { id: "hill", name: "Hill Climb Racing", emoji: "🚙", hint: "გაზი და მუხრუჭი", C: HillGame, tone: "from-lime-500/40 to-amber-500/20", web: true },
  { id: "racer", name: "Mr Racer", emoji: "🏁", hint: "რბოლა", C: RacerGame, tone: "from-red-500/40 to-zinc-500/20", web: true },
  { id: "karate", name: "Karate Fighter", emoji: "🥋", hint: "ბრძოლა", C: KarateGame, tone: "from-rose-500/40 to-orange-500/20", web: true },
  { id: "space", name: "Galaxy Defender", emoji: "🚀", hint: "გაატარე თითი", C: SpaceGame, tone: "from-sky-500/40 to-indigo-500/20" },
  { id: "pac", name: "Pac-Man", emoji: "🟡", hint: "გაუსვი თითი", C: PacGame, tone: "from-yellow-500/40 to-blue-600/20" },
  { id: "snake", name: "Cyber Snake", emoji: "🐍", hint: "გაუსვი თითი", C: SnakeGame, tone: "from-emerald-500/40 to-teal-500/20" },
  { id: "flappy", name: "Cyber Bird", emoji: "🐦", hint: "შეეხე ასაფრენად", C: FlappyGame, tone: "from-amber-500/40 to-lime-500/20" },
] as const;
