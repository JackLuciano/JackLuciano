// Generates the profile stat cards as static SVGs from the GitHub GraphQL API.
// Run by .github/workflows/cards.yml. No third-party image services involved.
//
// Local run:  GITHUB_TOKEN=<pat> GH_LOGIN=JackLuciano node scripts/build-cards.mjs
//
// PRIVATE ACTIVITY: the token must be a classic PAT owned by the profile user
// with `repo` + `read:user` scope. Only then does GitHub return private repos
// and unredacted private contribution counts. A bot token (the workflow default
// GITHUB_TOKEN) sees public activity only and would report near-zero.

import { writeFileSync, mkdirSync } from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'JackLuciano';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is required');

const C = {
  bg0: '#0d1220',
  bg1: '#070a11',
  gold: '#f5c66b',
  goldLite: '#ffe6ad',
  cyan: '#7ad7ff',
  green: '#5ee6a0',
  red: '#ff5f57',
  text: '#e6edf6',
  dim: '#8fa3bf',
  faint: '#3f4c60',
};

const MONO = "'Cascadia Code',Consolas,'SF Mono',Menlo,monospace";

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

const compact = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  : String(n);

// ── fetch ────────────────────────────────────────────────────────────────────

const QUERY = `
query($login:String!){
  user(login:$login){
    login
    followers{ totalCount }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:STARGAZERS,direction:DESC}){
      totalCount
      nodes{
        isPrivate
        stargazerCount
        languages(first:12, orderBy:{field:SIZE,direction:DESC}){
          edges{ size node{ name color } }
        }
      }
    }
    contributionsCollection{
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount weekday } }
      }
    }
  }
}`;

async function fetchUser() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-card-builder',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });

  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));

  return json.data.user;
}

// ── derive ───────────────────────────────────────────────────────────────────

function languageTotals(repos) {
  const bytes = new Map();

  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      const prev = bytes.get(node.name);
      bytes.set(node.name, { size: (prev?.size ?? 0) + size, color: node.color || C.dim });
    }
  }

  const all = [...bytes.entries()].map(([name, v]) => ({ name, ...v }));
  all.sort((a, b) => b.size - a.size);

  const total = all.reduce((s, l) => s + l.size, 0) || 1;
  const top = all.slice(0, 6);
  const rest = all.slice(6).reduce((s, l) => s + l.size, 0);

  if (rest > 0) top.push({ name: 'Other', size: rest, color: C.faint });

  return top.map((l) => ({ ...l, pct: (l.size / total) * 100 }));
}

function calendarDays(calendar) {
  const today = new Date().toISOString().slice(0, 10);

  return calendar.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => d.date <= today);
}

function streaks(days) {
  let longest = 0;
  let run = 0;

  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  // Current streak: walk backwards, tolerating an empty today (day not over yet).
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) current++;
    else if (i === days.length - 1) continue;
    else break;
  }

  return { current, longest };
}

// ── card: stats ──────────────────────────────────────────────────────────────

function statsCard(u) {
  const cc = u.contributionsCollection;
  const repos = u.repositories.nodes;

  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
  const commits = cc.totalCommitContributions + cc.restrictedContributionsCount;

  const tiles = [
    { label: 'commits (1y)', value: compact(commits), color: C.gold },
    { label: 'stars earned', value: compact(stars), color: C.goldLite },
    { label: 'pull requests', value: compact(cc.totalPullRequestContributions), color: C.cyan },
    { label: 'reviews', value: compact(cc.totalPullRequestReviewContributions), color: C.cyan },
    { label: 'issues', value: compact(cc.totalIssueContributions), color: C.green },
    { label: 'repositories', value: compact(u.repositories.totalCount), color: C.text },
    { label: 'private repos', value: compact(repos.filter((r) => r.isPrivate).length), color: C.dim },
    { label: 'followers', value: compact(u.followers.totalCount), color: C.dim },
  ];

  const W = 500;
  const H = 320;
  const cols = 2;
  const cw = 220;
  const ch = 56;
  const x0 = 22;
  const y0 = 66;

  const cells = tiles.map((t, i) => {
    const cx = x0 + (i % cols) * (cw + 16);
    const cy = y0 + Math.floor(i / cols) * (ch + 6);
    const delay = (0.25 + i * 0.09).toFixed(2);

    return `
    <g transform="translate(${cx},${cy})" opacity="0">
      <animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur=".5s" fill="freeze"/>
      <animateTransform attributeName="transform" type="translate"
        from="${cx} ${cy + 10}" to="${cx} ${cy}" begin="${delay}s" dur=".5s" fill="freeze"/>
      <rect width="${cw}" height="${ch}" rx="8" fill="#ffffff" fill-opacity=".035"
            stroke="#ffffff" stroke-opacity=".07"/>
      <rect width="3" height="${ch}" rx="1.5" fill="${t.color}"/>
      <text x="16" y="24" font-size="20" font-weight="600" fill="${t.color}"
            font-family="${MONO}">${esc(t.value)}</text>
      <text x="16" y="42" font-size="10.5" letter-spacing="1.2" fill="${C.dim}"
            font-family="${MONO}">${esc(t.label)}</text>
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="GitHub statistics">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg0}"/><stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
    <clipPath id="cf"><rect width="${W}" height="${H}" rx="12"/></clipPath>
  </defs>
  <g clip-path="url(#cf)" font-family="${MONO}">
    <rect width="${W}" height="${H}" fill="url(#cbg)"/>
    <text x="22" y="34" fill="${C.text}" font-size="13" letter-spacing="2.4">TELEMETRY</text>
    <circle cx="${W - 30}" cy="29" r="4" fill="${C.green}">
      <animate attributeName="opacity" values="1;.25;1" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    <line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="#ffffff" stroke-opacity=".08"/>
    ${cells}
    <rect x="${-140}" y="0" width="140" height="${H}" fill="#ffffff" opacity=".035">
      <animate attributeName="x" from="-140" to="${W}" dur="7s" begin="2s" repeatCount="indefinite"/>
    </rect>
    <rect width="${W}" height="${H}" rx="12" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
  </g>
</svg>
`;
}

// ── card: languages ──────────────────────────────────────────────────────────

function langsCard(langs) {
  const W = 380;
  const H = 320;
  const barX = 22;
  const barW = W - 44;

  let cursor = 0;
  const segments = langs.map((l, i) => {
    const w = Math.max((l.pct / 100) * barW, 2);
    const x = barX + cursor;
    cursor += w;

    return `<rect x="${x.toFixed(1)}" y="66" width="0" height="10" fill="${l.color}">
      <animate attributeName="width" from="0" to="${w.toFixed(1)}"
               begin="${(0.2 + i * 0.1).toFixed(2)}s" dur=".7s" fill="freeze"/>
    </rect>`;
  }).join('');

  const legend = langs.map((l, i) => {
    const y = 112 + i * 28;
    const delay = (0.4 + i * 0.09).toFixed(2);

    return `
    <g opacity="0">
      <animate attributeName="opacity" from="0" to="1" begin="${delay}s" dur=".5s" fill="freeze"/>
      <circle cx="28" cy="${y - 4}" r="4.5" fill="${l.color}"/>
      <text x="44" y="${y}" font-size="12" fill="${C.text}">${esc(l.name)}</text>
      <text x="${W - 22}" y="${y}" font-size="12" text-anchor="end" fill="${C.dim}">${l.pct.toFixed(1)}%</text>
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Language breakdown">
  <defs>
    <linearGradient id="lbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg0}"/><stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
    <clipPath id="lf"><rect width="${W}" height="${H}" rx="12"/></clipPath>
    <clipPath id="barclip"><rect x="${barX}" y="66" width="${barW}" height="10" rx="5"/></clipPath>
  </defs>
  <g clip-path="url(#lf)" font-family="${MONO}">
    <rect width="${W}" height="${H}" fill="url(#lbg)"/>
    <text x="22" y="34" fill="${C.text}" font-size="13" letter-spacing="2.4">LANGUAGES</text>
    <line x1="22" y1="46" x2="${W - 22}" y2="46" stroke="#ffffff" stroke-opacity=".08"/>
    <rect x="${barX}" y="66" width="${barW}" height="10" rx="5" fill="#ffffff" fill-opacity=".06"/>
    <g clip-path="url(#barclip)">${segments}</g>
    ${legend}
    <rect width="${W}" height="${H}" rx="12" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
  </g>
</svg>
`;
}

// ── card: contribution heatmap ───────────────────────────────────────────────

function heatmapCard(u, days, st) {
  const weeks = u.contributionsCollection.contributionCalendar.weeks;
  const total = u.contributionsCollection.contributionCalendar.totalContributions;

  const peak = Math.max(1, ...days.map((d) => d.contributionCount));
  const shade = (n) => {
    if (n === 0) return '#ffffff';
    const t = Math.min(1, Math.log(1 + n) / Math.log(1 + peak));
    if (t < 0.3) return '#3d5a52';
    if (t < 0.55) return '#3f8f6c';
    if (t < 0.8) return C.green;
    return C.gold;
  };

  const cell = 11;
  const gap = 3;
  const gx = 24;
  const gy = 74;
  const W = gx * 2 + weeks.length * (cell + gap);
  const H = 220;

  const cells = weeks.map((w, wi) =>
    w.contributionDays.map((d) => {
      const x = gx + wi * (cell + gap);
      const y = gy + d.weekday * (cell + gap);
      const zero = d.contributionCount === 0;
      const delay = (0.15 + wi * 0.012 + d.weekday * 0.02).toFixed(3);

      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5"
        fill="${shade(d.contributionCount)}" fill-opacity="0">
        <animate attributeName="fill-opacity" from="0" to="${zero ? '.05' : '1'}"
                 begin="${delay}s" dur=".45s" fill="freeze"/>
      </rect>`;
    }).join('')
  ).join('');

  const monthLabels = (() => {
    const out = [];
    let last = -1;

    weeks.forEach((w, wi) => {
      const first = w.contributionDays[0];
      if (!first) return;

      const m = new Date(first.date).getUTCMonth();
      if (m !== last && wi < weeks.length - 1) {
        last = m;
        const name = new Date(first.date).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
        out.push(`<text x="${gx + wi * (cell + gap)}" y="${gy - 10}" font-size="10"
          fill="${C.faint}" letter-spacing="1">${name.toLowerCase()}</text>`);
      }
    });

    return out.join('');
  })();

  const footY = gy + 7 * (cell + gap) + 30;
  const stat = (x, value, label, color) => `
    <g opacity="0">
      <animate attributeName="opacity" from="0" to="1" begin="1.6s" dur=".6s" fill="freeze"/>
      <text x="${x}" y="${footY}" font-size="19" font-weight="600" fill="${color}">${esc(value)}</text>
      <text x="${x}" y="${footY + 17}" font-size="10.5" letter-spacing="1.2" fill="${C.dim}">${esc(label)}</text>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Contribution activity">
  <defs>
    <linearGradient id="hbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${C.bg0}"/><stop offset="100%" stop-color="${C.bg1}"/>
    </linearGradient>
    <clipPath id="hf"><rect width="${W}" height="${H}" rx="12"/></clipPath>
  </defs>
  <g clip-path="url(#hf)" font-family="${MONO}">
    <rect width="${W}" height="${H}" fill="url(#hbg)"/>
    <text x="24" y="34" fill="${C.text}" font-size="13" letter-spacing="2.4">ACTIVITY &#183; LAST 12 MONTHS</text>
    <line x1="24" y1="46" x2="${W - 24}" y2="46" stroke="#ffffff" stroke-opacity=".08"/>
    ${monthLabels}
    ${cells}
    ${stat(24, compact(total), 'contributions', C.gold)}
    ${stat(180, `${st.current}d`, 'current streak', C.green)}
    ${stat(340, `${st.longest}d`, 'longest streak', C.cyan)}
    ${stat(500, compact(peak), 'busiest day', C.goldLite)}
    <rect width="${W}" height="${H}" rx="12" fill="none" stroke="#ffffff" stroke-opacity=".08"/>
  </g>
</svg>
`;
}

// ── main ─────────────────────────────────────────────────────────────────────

const user = await fetchUser();
const days = calendarDays(user.contributionsCollection.contributionCalendar);
const st = streaks(days);

mkdirSync('assets', { recursive: true });
writeFileSync('assets/stats.svg', statsCard(user));
writeFileSync('assets/langs.svg', langsCard(languageTotals(user.repositories.nodes)));
writeFileSync('assets/heatmap.svg', heatmapCard(user, days, st));

const privateRepos = user.repositories.nodes.filter((r) => r.isPrivate).length;
const restricted = user.contributionsCollection.restrictedContributionsCount;

console.log(`built cards for ${user.login} — streak ${st.current}d / ${st.longest}d`);
console.log(`private repos visible: ${privateRepos}  ·  restricted contributions: ${restricted}`);

if (privateRepos === 0) {
  console.warn(
    '\n! No private repos visible. The token is not a classic PAT with `repo`\n' +
    '! scope owned by this account, so private work is excluded from the cards.\n'
  );
}

if (restricted > 0) {
  console.warn(
    `\n! ${restricted} contributions are still redacted. Enable\n` +
    '! Settings > Public profile > "Include private contributions on my profile".\n'
  );
}
