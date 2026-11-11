/** Code-drawn, brand-neutral illustrations for the public landing page. */

export function TMapMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true" fill="none">
      <rect x="0.5" y="0.5" width="27" height="27" rx="8" fill="#0d1218" stroke="rgba(255,255,255,0.12)" />
      <path d="M7 21c3-1 3.5-5 7-6s5-3 5.5-6" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="7" cy="21" r="2" fill="#3b82f6" />
      <circle cx="19.5" cy="8.5" r="3" fill="#e9b149" />
      <circle cx="19.5" cy="8.5" r="1.1" fill="#0d1218" />
    </svg>
  );
}

const ROUTE = "M120 470 C 200 455, 230 400, 300 380 S 420 360, 470 300 S 560 210, 640 200 S 760 170, 820 120";

/** Generic landscape in-car screen with a stylised night map (no labels, no brand marks). */
export function HeroScreen({ label }: { label: string }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#0b0e11] p-2.5 shadow-[0_40px_120px_-40px_rgba(59,130,246,0.45)] sm:p-3.5">
      <style>{`
        @keyframes tm-draw { from { stroke-dashoffset: 1400 } to { stroke-dashoffset: 0 } }
        @keyframes tm-settle { from { opacity: 0; transform: translate(120px,470px) scale(.4) } to { opacity: 1; transform: translate(120px,470px) scale(1) } }
        .tm-route { stroke-dasharray: 1400; animation: tm-draw 1.6s cubic-bezier(.6,.1,.2,1) both .2s }
        .tm-car { animation: tm-settle .5s ease-out both 1.6s; transform: translate(120px,470px) }
        @media (prefers-reduced-motion: reduce) { .tm-route, .tm-car { animation: none } }
      `}</style>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-[#070a0e]">
        <svg viewBox="0 0 960 600" className="absolute inset-0 h-full w-full" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="tm-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="rgba(255,255,255,0.035)" />
            </pattern>
            <radialGradient id="tm-glow" cx="70%" cy="30%" r="60%">
              <stop offset="0" stopColor="#3b82f6" stopOpacity="0.12" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="960" height="600" fill="url(#tm-grid)" />
          <rect width="960" height="600" fill="url(#tm-glow)" />
          {/* river */}
          <path d="M-20 260 C 140 300, 220 200, 380 240 S 620 420, 760 380 S 920 300, 990 330" stroke="#0f2236" strokeWidth="34" fill="none" strokeLinecap="round" />
          {/* blocks */}
          {[[560,420,90,60],[680,440,70,80],[200,120,110,70],[340,90,80,90],[60,340,90,60],[760,250,90,60],[480,110,70,50]].map(([x,y,w,h],i)=>(
            <rect key={i} x={x} y={y} width={w} height={h} rx="6" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)" />
          ))}
          {/* road network */}
          <g stroke="rgba(255,255,255,0.09)" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M0 520 L960 430" /><path d="M0 160 L960 90" /><path d="M300 0 L340 600" />
            <path d="M650 0 L600 600" /><path d="M0 400 C 300 380, 500 300, 960 260" />
            <path d="M160 0 C 180 200, 120 400, 180 600" /><path d="M840 0 L880 600" />
          </g>
          <g stroke="rgba(255,255,255,0.045)" strokeWidth="1.5" fill="none">
            <path d="M0 220 L960 200" /><path d="M0 330 L960 350" /><path d="M460 0 L500 600" /><path d="M740 0 L720 600" />
          </g>
          {/* route */}
          <path d={ROUTE} stroke="#3b82f6" strokeOpacity="0.25" strokeWidth="18" fill="none" strokeLinecap="round" />
          <path className="tm-route" d={ROUTE} stroke="#3b82f6" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="120" cy="470" r="9" fill="#070a0e" stroke="#3b82f6" strokeWidth="4" />
          {/* destination pin */}
          <g transform="translate(820 120)">
            <circle r="22" fill="#e9b149" fillOpacity="0.15" />
            <path d="M0 6 C -12 -6, -12 -26, 0 -28 C 12 -26, 12 -6, 0 6 Z" fill="#e9b149" transform="translate(0 -4)" />
            <circle cy="-20" r="4.5" fill="#070a0e" />
          </g>
          {/* vehicle arrow */}
          <g className="tm-car">
            <g transform="rotate(-25) translate(28 0)">
              <circle r="16" fill="#ffffff" fillOpacity="0.1" />
              <path d="M12 0 L-9 -9 L-4 0 L-9 9 Z" fill="#ffffff" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

/** Phone ↔ car-screen pairing illustration (generic devices, no text). */
export function PairingArt({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 480 300" className="h-full w-full" role="img" aria-label={label}>
      {/* phone */}
      <rect x="40" y="40" width="120" height="220" rx="20" fill="#0b0e11" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
      <rect x="82" y="52" width="36" height="6" rx="3" fill="rgba(255,255,255,0.15)" />
      <circle cx="100" cy="130" r="30" fill="#3b82f6" fillOpacity="0.12" stroke="#3b82f6" strokeWidth="2" />
      <circle cx="100" cy="130" r="8" fill="#3b82f6" />
      <path d="M100 100 v-10 M100 170 v-10 M70 130 h-10 M140 130 h-10" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
      <g fill="rgba(255,255,255,0.7)">
        {[0,1,2,3,4].map((c)=>[0,1,2,3,4].map((r)=> (c*7+r*3)%4===0 ? <rect key={`${c}-${r}`} x={76+c*10} y={190+r*10} width="8" height="8" rx="1" /> : null))}
      </g>
      {/* link */}
      <path d="M170 150 C 205 120, 235 180, 270 150" stroke="#e9b149" strokeWidth="2.5" strokeDasharray="5 7" fill="none" strokeLinecap="round" />
      <circle cx="170" cy="150" r="4" fill="#e9b149" /><circle cx="270" cy="150" r="4" fill="#e9b149" />
      {/* car screen */}
      <rect x="280" y="70" width="170" height="160" rx="16" fill="#0b0e11" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
      <rect x="290" y="80" width="150" height="140" rx="9" fill="#070a0e" />
      <g stroke="rgba(255,255,255,0.08)" strokeWidth="2"><path d="M290 130 H440" /><path d="M290 180 H440" /><path d="M340 80 V220" /><path d="M395 80 V220" /></g>
      <path d="M305 205 C 330 190, 350 160, 370 150 S 410 110, 425 98" stroke="#3b82f6" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="425" cy="98" r="6" fill="#e9b149" />
      <path d="M314 200 l-10 -4 l3 -4 z" fill="#fff" transform="rotate(-30 308 198)" />
    </svg>
  );
}
