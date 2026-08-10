// Generates the section banners used as headings in README.md.
// One template, seven outputs — the headings stay identical in geometry no
// matter how the copy changes, which is the whole point of generating them.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
mkdirSync(OUT, { recursive: true });

const C = {
  bg0: '#141618',
  bg1: '#0e0f11',
  amber: '#ffb454',
  sand: '#ffd9a0',
  rust: '#ff7a5c',
  green: '#a9c46c',
  text: '#eef1f4',
  dim: '#9099a1',
};

const SECTIONS = [
  { n: '01', title: 'about',      sub: 'writing software that earns its place', accent: C.amber },
  { n: '02', title: 'stack',      sub: 'the daily tooling',                     accent: C.sand  },
  { n: '03', title: 'telemetry',  sub: 'code and activity',                     accent: C.green },
  { n: '04', title: 'topology',   sub: 'how the pieces fit together',           accent: C.amber },
  { n: '05', title: 'work',       sub: 'selected projects, shipped',            accent: C.rust  },
  { n: '06', title: 'principles', sub: 'how I work',                            accent: C.sand  },
  { n: '07', title: 'contact',    sub: "let's build something",                 accent: C.green },
];

const W = 1000;
const H = 92;

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');

function banner({ n, title, sub, accent }, i) {
  const uid = `s${n}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(n)} ${esc(title)} — ${esc(sub)}">
  <defs>
    <linearGradient id="${uid}bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${C.bg0}"/><stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
    <linearGradient id="${uid}rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity=".8"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${uid}f"><rect width="${W}" height="${H}" rx="12"/></clipPath>
    <clipPath id="${uid}type"><rect x="0" y="0" height="${H}" width="0">
      <animate attributeName="width" from="0" to="${W}" begin="${0.3 + i * 0.12}s" dur="0.9s" fill="freeze"/>
    </rect></clipPath>
  </defs>

  <g clip-path="url(#${uid}f)" font-family="'Cascadia Code',Consolas,'SF Mono',monospace">
    <rect width="${W}" height="${H}" fill="url(#${uid}bg)"/>

    <!-- numeral block -->
    <rect x="0" y="0" width="3" height="${H}" fill="${accent}" opacity=".85"/>
    <text x="30" y="${H / 2 + 13}" font-size="34" font-weight="700" fill="${accent}" fill-opacity=".22">${esc(n)}</text>

    <g clip-path="url(#${uid}type)">
      <text x="98" y="${H / 2 - 2}" font-size="23" font-weight="600" fill="${C.text}" letter-spacing="1.5"
            font-family="'Segoe UI Semibold','Helvetica Neue',Arial,sans-serif">${esc(title)}</text>
      <text x="98" y="${H / 2 + 24}" font-size="13" fill="${C.dim}" letter-spacing="1.2">${esc(sub)}</text>
    </g>

    <!-- caret parked at the end of the type reveal -->
    <rect x="98" y="${H / 2 - 20}" width="2" height="22" fill="${accent}">
      <animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/>
      <animate attributeName="x" from="98" to="${98 + title.length * 13.5}" begin="${0.3 + i * 0.12}s" dur="0.9s" fill="freeze"/>
    </rect>

    <!-- travelling underline -->
    <rect x="98" y="${H - 16}" width="0" height="1.5" fill="url(#${uid}rule)">
      <animate attributeName="width" from="0" to="${W - 160}" begin="${1.1 + i * 0.12}s" dur="1.1s" fill="freeze"/>
    </rect>

    <!-- right-edge tick marks, a quiet ruler -->
    <g stroke="${accent}" stroke-opacity=".35">
      ${Array.from({ length: 6 }, (_, k) => `<line x1="${W - 24 - k * 12}" y1="${H - 30}" x2="${W - 24 - k * 12}" y2="${H - 22 + k}" stroke-width="1"><animate attributeName="stroke-opacity" values=".05;.5;.05" dur="3s" begin="${k * 0.18}s" repeatCount="indefinite"/></line>`).join('\n      ')}
    </g>

    <rect width="${W}" height="${H}" rx="12" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
  </g>
</svg>
`;
}

for (const [i, s] of SECTIONS.entries()) {
  writeFileSync(join(OUT, `sec-${s.n}.svg`), banner(s, i));
}
console.log(`wrote ${SECTIONS.length} section banners`);
