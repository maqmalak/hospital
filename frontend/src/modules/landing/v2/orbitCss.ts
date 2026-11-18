/** Motion classes shared by website v2 and the v1 landing page (/hms/vvsdesk): the sun / orbit (DeptOrbit) and the hero photo's slow zoom.
 *  Reduced motion stops them all. */
export const ORBIT_CSS = `
  .s2-kenburns{animation:s2kb 22s ease-in-out infinite alternate;transform-origin:60% 40%}
  @keyframes s2kb{from{transform:scale(1.02)}to{transform:scale(1.12)}}
  .s2-spin{animation:s2spin 40s linear infinite}.s2-spin-rev{animation:s2spin 28s linear infinite reverse}@keyframes s2spin{to{transform:rotate(360deg)}}
  .s2-pulse-soft{animation:s2ps 3.2s ease-in-out infinite}@keyframes s2ps{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.08);opacity:.25}}
  .s2-corona{background:repeating-conic-gradient(from 0deg,rgba(255,236,170,.0) 0deg 9deg,rgba(255,236,170,.22) 12deg,rgba(255,236,170,0) 15deg 24deg);
    -webkit-mask:radial-gradient(circle,#000 30%,transparent 70%);mask:radial-gradient(circle,#000 30%,transparent 70%);filter:blur(1.5px);animation:s2spin 18s linear infinite}
  .s2-halo{box-shadow:0 0 40px 12px rgba(255,236,170,.45),0 0 90px 30px rgba(159,227,218,.35);animation:s2halo 3.6s ease-in-out infinite}
  @keyframes s2halo{0%,100%{box-shadow:0 0 36px 10px rgba(255,236,170,.40),0 0 80px 26px rgba(159,227,218,.30)}50%{box-shadow:0 0 60px 20px rgba(255,236,170,.65),0 0 130px 46px rgba(159,227,218,.45)}}
  .s2-logo-glow{animation:s2lg 3.6s ease-in-out infinite}@keyframes s2lg{0%,100%{filter:drop-shadow(0 0 4px rgba(255,107,102,.35))}50%{filter:drop-shadow(0 0 14px rgba(255,107,102,.7)) brightness(1.08)}}
  .s2-sweep{background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.75) 50%,transparent 80%);transform:skewX(-18deg);animation:s2sweep 3.8s ease-in-out infinite}
  @keyframes s2sweep{0%,40%{left:-60%}80%,100%{left:130%}}
  @media (prefers-reduced-motion: reduce){.s2-kenburns,.s2-spin,.s2-spin-rev,.s2-pulse-soft,.s2-corona,.s2-halo,.s2-logo-glow,.s2-sweep{animation:none}}
`;
