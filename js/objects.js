// objects.js — 벽에 걸린 물건 그림(SVG)과 크기. 단위는 무대 좌표(px, 화면에 맞춰 늘고 준다)
// 모든 물건은 깃발과 같은 한 칸(90×150)에 들어가 한 줄로 늘어선다
window.BW = window.BW || {};
(function (BW) {
  const FLAGS = {
    blue:  { name: '청기', fill: '#3b7fd9' },
    white: { name: '백기', fill: '#fbfaf6' },
    red:   { name: '적기', fill: '#d9483b' },
    black: { name: '흑기', fill: '#2b2622' },
  };
  const NAMES = { elec: '전기', humid: '습기', meat: '고기', drunk: '취기' };
  for (const k in FLAGS) NAMES[k] = FLAGS[k].name;

  const SLOT = { w: 90, h: 150 };
  // 깃발 막대가 도는 축 = 회색 받침대 가운데. 0°면 위(올림), 180°면 아래(내림)
  const PIVOT = { x: 45, y: 76 };

  // 고기 자리 (고기판 칸 기준): 위가 불판, 아래가 접시
  const MEAT = { grill: { x: 45, y: 43 }, plate: { x: 45, y: 117 }, w: 62, h: 42 };
  // 술상 칸 안의 자리. 술병은 기울이면 주둥이가 가운데에서 R만큼 떨어진 곳에 온다
  const DRINK = { bottleHome: { x: 66, y: 64 }, shotTop: { x: 66, y: 118 }, bottom: 146, bottleW: 30, bottleH: 86, R: 42 };

  const flag = (key, angle = 180) => `
<svg viewBox="0 0 90 150" class="o-svg" aria-hidden="true">
  <rect x="34" y="65" width="22" height="22" rx="5" class="holder-plate"/>
  <g class="pole" transform="rotate(${angle} ${PIVOT.x} ${PIVOT.y})">
    <line x1="45" y1="76" x2="45" y2="13" class="pole-line"/>
    <circle cx="45" cy="10" r="4.2" class="pole-tip"/>
    <path d="M47.5 15 L47.5 53 L86 34 Z" fill="${FLAGS[key].fill}" class="flag-cloth"/>
    <path d="M50 20 L50 32 L66 26 Z" class="flag-shine"/>
  </g>
  <rect x="37.5" y="68.5" width="15" height="15" rx="2.6" class="holder"/>
  <circle cx="45" cy="76" r="2.3" class="holder-pin"/>
</svg>`;

  const elec = () => `
<svg viewBox="0 0 90 150" class="o-svg" aria-hidden="true">
  <rect x="21" y="34" width="52" height="88" rx="10" class="o-drop"/>
  <rect x="19" y="30" width="52" height="88" rx="10" class="sw-plate"/>
  <circle cx="45" cy="37" r="2" class="sw-screw"/>
  <circle cx="45" cy="111" r="2" class="sw-screw"/>
  <circle cx="62" cy="38" r="3.2" class="sw-led"/>
  <rect x="33" y="46" width="24" height="56" rx="6" class="sw-slot"/>
  <g class="sw-lever">
    <rect x="35.5" y="48.5" width="19" height="25" rx="4.5" class="sw-knob"/>
    <rect x="39" y="52" width="12" height="3.4" rx="1.7" class="sw-shine"/>
  </g>
</svg>`;

  const humid = () => `
<svg viewBox="0 0 90 150" class="o-svg" aria-hidden="true">
  <ellipse cx="45" cy="134" rx="32" ry="4.5" class="o-shadow"/>
  <path d="M24 54 Q24 47 31 47 L59 47 Q66 47 66 54 L71 123 Q72 131 64 131 L26 131 Q18 131 19 123 Z" class="hm-body"/>
  <rect x="28" y="64" width="34" height="34" rx="7" class="hm-tank"/>
  <path d="M28 80 Q36.5 77 45 80 T62 80 V91 Q62 98 55 98 H35 Q28 98 28 91 Z" class="hm-water"/>
  <rect x="31" y="33" width="28" height="16" rx="6" class="hm-cap"/>
  <rect x="38" y="18" width="14" height="17" rx="4.5" class="hm-nozzle"/>
  <circle cx="45" cy="115" r="4" class="hm-led"/>
</svg>`;

  const bars = Array.from({ length: 8 }, (_, i) => `<line x1="${17 + i * 8}" y1="14" x2="${17 + i * 8}" y2="72" class="gr-bar"/>`).join('');
  const meatStation = () => `
<svg viewBox="0 0 90 150" class="o-svg" aria-hidden="true">
  <defs>
    <radialGradient id="bw-fire" cx="50%" cy="55%" r="62%">
      <stop offset="0%" stop-color="#ffa040"/>
      <stop offset="55%" stop-color="#d9482a"/>
      <stop offset="100%" stop-color="#4d2418"/>
    </radialGradient>
  </defs>
  <rect x="3" y="6" width="84" height="74" rx="11" class="gr-body"/>
  <rect x="10" y="13" width="70" height="60" rx="6" fill="url(#bw-fire)" class="gr-fire"/>
  ${bars}
  <rect x="10" y="13" width="70" height="60" rx="6" class="gr-rim"/>
  <ellipse cx="45" cy="123" rx="42" ry="24" class="o-shadow"/>
  <ellipse cx="45" cy="119" rx="42" ry="24" class="pl-rim"/>
  <ellipse cx="45" cy="117" rx="30" ry="15.5" class="pl-in"/>
</svg>`;

  const meat = () => `
<svg viewBox="0 0 76 52" class="o-svg" aria-hidden="true">
  <g class="meat-g">
    <path class="meat-body" d="M9 22 C7 9 22 4 36 6 C52 2 70 9 69 23 C71 39 57 48 39 47 C21 49 7 40 9 22 Z"/>
    <path class="meat-fat" d="M17 18 C27 25 33 14 44 21 C52 26 58 19 64 25"/>
    <path class="meat-fat thin" d="M20 35 C28 30 36 39 47 33"/>
    <g class="meat-marks"><line x1="20" y1="13" x2="32" y2="41"/><line x1="34" y1="9" x2="47" y2="42"/><line x1="49" y1="10" x2="60" y2="36"/></g>
  </g>
</svg>`;

  const drink = () => `
<svg viewBox="0 0 90 150" class="o-svg" aria-hidden="true">
  <defs>
    <clipPath id="bw-clip-water"><path d="M6 94 L38 94 L35.3 146 L8.7 146 Z"/></clipPath>
    <clipPath id="bw-clip-shot"><path d="M54 120 L78 120 L75.8 146 L56.2 146 Z"/></clipPath>
  </defs>
  <ellipse cx="45" cy="148" rx="43" ry="4" class="o-shadow"/>
  <g data-hit="water" class="hit hit-water">
    <rect x="0" y="78" width="45" height="72" fill="transparent"/>
    <rect class="water-liq" x="0" y="102" width="45" height="44" clip-path="url(#bw-clip-water)"/>
    <path d="M4 92 L40 92 L37 148 L7 148 Z" class="glass"/>
    <path d="M9 99 L11.5 140" class="glass-shine"/>
  </g>
  <g data-hit="shot" class="hit hit-shot">
    <rect x="46" y="110" width="44" height="40" fill="transparent"/>
    <rect class="shot-liq" x="50" y="146" width="32" height="0" clip-path="url(#bw-clip-shot)"/>
    <path d="M52 118 L80 118 L77.5 148 L54.5 148 Z" class="glass"/>
    <path d="M57 123 L58 142" class="glass-shine"/>
  </g>
</svg>`;

  const bottle = () => `
<svg viewBox="0 0 46 132" class="o-svg" aria-hidden="true">
  <path class="bt-body" d="M17 6 H29 V30 Q29 38 36 45 Q42 51 42 60 V120 Q42 130 32 130 H14 Q4 130 4 120 V60 Q4 51 10 45 Q17 38 17 30 Z"/>
  <rect x="15.5" y="1" width="15" height="9" rx="2" class="bt-cap"/>
  <rect x="8" y="70" width="30" height="34" rx="4" class="bt-label"/>
  <text x="23" y="93" class="bt-text">술</text>
  <path d="M10 62 V116" class="bt-shine"/>
</svg>`;

  BW.obj = { FLAGS, NAMES, SLOT, PIVOT, MEAT, DRINK, svg: { flag, elec, humid, meatStation, meat, drink, bottle } };
})(window.BW);
