/** Nursery illustrations (D-95): soft cream / powder-blue / blush panels used until real Nursery / NICU photos are supplied. */

/** Soft illustrated panel for each unit (no photos of babies on public pages) — cream / powder blue / blush, theme-aware. */
export function UnitArt({ kind, className = "h-40" }: { kind: string; className?: string }) {
  const tone = { nursery: ["#F6EEE3", "#DCEBF6"], rooming: ["#F8E7EA", "#F6EEE3"], nicu: ["#DCEBF6", "#D7EFEC"], scbu: ["#E9F1F8", "#F6EEE3"], kmc: ["#F8E7EA", "#DCEBF6"], feed: ["#F6EEE3", "#F8E7EA"] }[kind] ?? ["#F6EEE3", "#DCEBF6"];
  return (
    <div aria-hidden className={`nz-art relative overflow-hidden ${className}`} style={{ ["--a" as string]: tone[0], ["--b" as string]: tone[1] }}>
      <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <circle cx="270" cy="30" r="46" fill="#fff" opacity=".35" /><circle cx="40" cy="150" r="60" fill="#fff" opacity=".25" />
        {kind === "nicu" ? <g transform="translate(90 46)"><rect x="0" y="34" width="140" height="58" rx="14" fill="#fff" opacity=".85" /><path d="M8 34 Q70 -12 132 34" fill="#fff" opacity=".55" stroke="#9CC7E6" strokeWidth="2" />
          <rect x="22" y="96" width="8" height="16" fill="#9CC7E6" /><rect x="110" y="96" width="8" height="16" fill="#9CC7E6" /><path className="nz-ecg" d="M150 30 h20 l6 -12 l8 24 l6 -12 h20" stroke="#E5483F" strokeWidth="2.5" fill="none" /></g>
          : kind === "feed" || kind === "kmc" ? <g transform="translate(110 30)"><circle cx="50" cy="38" r="22" fill="#fff" opacity=".9" /><path d="M8 118 Q50 60 92 118 Z" fill="#fff" opacity=".85" /><circle cx="70" cy="78" r="14" fill="#F3DCC8" /><path d="M46 96 Q70 70 96 98" stroke="#E5A5AE" strokeWidth="3" fill="none" /></g>
          : <g transform="translate(96 40)"><rect x="6" y="40" width="116" height="44" rx="10" fill="#fff" opacity=".9" />{[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={14 + i * 18} y="14" width="6" height="30" rx="3" fill="#fff" opacity=".8" />)}
            <rect x="6" y="10" width="116" height="6" rx="3" fill="#9CC7E6" /><circle cx="64" cy="60" r="12" fill="#F3DCC8" /><path d="M40 70 h48" stroke="#9CC7E6" strokeWidth="6" strokeLinecap="round" /><path d="M14 84 v22 M114 84 v22" stroke="#9CC7E6" strokeWidth="5" /></g>}
        <g className="nz-twinkle" fill="#fff"><circle cx="58" cy="34" r="3" /><circle cx="250" cy="120" r="2.5" /><circle cx="214" cy="22" r="2" /></g>
      </svg>
    </div>
  );
}


export const NZ_ART_CSS = `.nz-art{background:linear-gradient(135deg,var(--a),var(--b))}
.s2-dark .nz-art{filter:saturate(.7) brightness(.55)}
.nz-twinkle circle{animation:nztw 4.5s ease-in-out infinite}.nz-twinkle circle:nth-child(2n){animation-delay:-2s}
@keyframes nztw{0%,100%{opacity:.25}50%{opacity:.95}}
.nz-ecg{stroke-dasharray:320;stroke-dashoffset:320;animation:nzecg 4s linear infinite}@keyframes nzecg{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion: reduce){.nz-twinkle circle,.nz-ecg{animation:none}.nz-ecg{stroke-dashoffset:0}}`;
