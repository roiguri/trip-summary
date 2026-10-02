// Prints the *shape* of your real data sources, for checking the data design (docs/DATA-DESIGN.md)
// before anything is built. It prints table and column names, counts, and field names only: no
// names, notes, coordinates, place IDs or exact dates, so the output is safe to share.
//
//   node scripts/probe-sources.mjs --jarvis /path/to/jarvis.db --timeline /path/to/Timeline.json
//
// Either option can be given alone. Runs locally; reads the files and changes nothing.
// Needs Node 22.5+ (on Node before 22.13, add --experimental-sqlite after `node`).
import { readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const out = (s = '') => console.log(s);

function probeJarvis(file) {
  out(`== Jarvis database (${Math.round(statSync(file).size / 1024)} KB)`);
  const db = new DatabaseSync(file, { readOnly: true });
  // The tables and columns this app expects, from its own schema.
  const schema = readFileSync(new URL('../lib/schema.ts', import.meta.url), 'utf8');
  const core = schema.match(/CORE_SCHEMA = `([\s\S]*?)`/)[1];
  const ref = new DatabaseSync(':memory:');
  ref.exec(core);
  const columns = (d, t) =>
    d
      .prepare(`PRAGMA table_info("${t}")`)
      .all()
      .map((c) => c.name);
  const tables = (d) =>
    d
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
  const expected = tables(ref);
  const actual = tables(db);
  for (const t of [...new Set([...expected, ...actual])]) {
    if (!actual.includes(t)) {
      out(`  ${t}: MISSING (expected by the app)`);
      continue;
    }
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    if (!expected.includes(t)) {
      out(`  ${t}: extra table, ${n} rows, columns: ${columns(db, t).join(', ')}`);
      continue;
    }
    const have = columns(db, t),
      want = columns(ref, t);
    const missing = want.filter((c) => !have.includes(c));
    const extra = have.filter((c) => !want.includes(c));
    out(
      `  ${t}: ${n} rows${missing.length ? `; MISSING columns: ${missing.join(', ')}` : ''}${extra.length ? `; extra columns: ${extra.join(', ')}` : ''}`,
    );
  }
  const filled = (t, c, where = '1') => {
    try {
      const r = db
        .prepare(
          `SELECT COUNT(*) AS d, SUM(CASE WHEN "${c}" IS NOT NULL AND "${c}" != '' THEN 1 ELSE 0 END) AS f FROM "${t}" WHERE ${where}`,
        )
        .get();
      return `${pct(r.f, r.d)} of ${r.d}`;
    } catch {
      return 'n/a';
    }
  };
  out('  Filled in:');
  out(`    places.google_place_id ${filled('places', 'google_place_id')}`);
  out(`    places.lat/lng ${filled('places', 'lat')}`);
  out(`    places.category ${filled('places', 'category')}`);
  out(`    itinerary.place_id ${filled('itinerary', 'place_id')}`);
  out(`    itinerary.start_time ${filled('itinerary', 'start_time')}`);
  out(`    itinerary.end_date ${filled('itinerary', 'end_date')}`);
  out(
    `    transit departure_timezone ${filled('itinerary', 'departure_timezone', "item_type='transit'")}`,
  );
  out(`    transit from_location ${filled('itinerary', 'from_location', "item_type='transit'")}`);
  out(`    lodging end_time ${filled('itinerary', 'end_time', "item_type='lodging'")}`);
  try {
    const types = db
      .prepare('SELECT item_type, COUNT(*) AS n FROM itinerary GROUP BY item_type ORDER BY n DESC')
      .all();
    out(`  Itinerary types: ${types.map((r) => `${r.item_type} ${r.n}`).join(', ')}`);
    const perTrip = db
      .prepare('SELECT COUNT(*) AS n FROM itinerary GROUP BY trip_id ORDER BY n DESC')
      .all()
      .map((r) => r.n);
    out(`  Entries per trip: ${perTrip.join(', ')}`);
    const times = db
      .prepare("SELECT start_time FROM itinerary WHERE start_time IS NOT NULL AND start_time != ''")
      .all()
      .map((r) => String(r.start_time).replace(/\d/g, '9'));
    const shapes = [...new Set(times)].slice(0, 5);
    out(`  Time formats seen: ${shapes.join(', ') || '-'}`);
  } catch (e) {
    out(`  (itinerary details unavailable: ${e.message})`);
  }
  out();
}

function probeTimeline(file) {
  out(`== Timeline export (${Math.round(statSync(file).size / 1024 / 1024)} MB)`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const top = Array.isArray(data) ? '(top level is an array)' : Object.keys(data).join(', ');
  out(`  Top-level keys: ${top}`);
  const segments = Array.isArray(data) ? data : data.semanticSegments || [];
  out(`  Segments: ${segments.length}`);
  // Every key path with the types seen, without any values.
  const paths = new Map();
  const walk = (v, path, depth) => {
    const type = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    paths.set(path, (paths.get(path) || new Set()).add(type));
    if (depth > 5) return;
    if (Array.isArray(v)) v.slice(0, 3).forEach((x) => walk(x, `${path}[]`, depth + 1));
    else if (type === 'object')
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`, depth + 1);
  };
  const kinds = {},
    activity = {},
    semantic = {},
    months = new Set();
  let withPlaceId = 0,
    visits = 0,
    withOffset = 0;
  for (const s of segments) {
    walk(s, 'segment', 0);
    const kind = ['visit', 'activity', 'timelinePath', 'timelineMemory'].find((k) => k in s) || '?';
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (s.startTime) months.add(String(s.startTime).slice(0, 7));
    if ('startTimeTimezoneUtcOffsetMinutes' in s) withOffset++;
    if (s.visit) {
      visits++;
      const c = s.visit.topCandidate || {};
      if (c.placeId || c.placeID) withPlaceId++;
      semantic[c.semanticType || '-'] = (semantic[c.semanticType || '-'] || 0) + 1;
    }
    if (s.activity) {
      const t = s.activity.topCandidate?.type || '-';
      activity[t] = (activity[t] || 0) + 1;
    }
  }
  const list = (o) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
  const sorted = [...months].sort();
  out(`  Kinds: ${list(kinds)}`);
  out(`  Months covered: ${sorted[0] || '-'} to ${sorted.at(-1) || '-'} (${sorted.length} months)`);
  out(`  Segments with a local UTC offset: ${pct(withOffset, segments.length)}`);
  out(`  Visits with a place ID: ${pct(withPlaceId, visits)}`);
  out(`  Visit types: ${list(semantic)}`);
  out(`  Activity modes: ${list(activity)}`);
  out('  Fields (path: types):');
  for (const [p, t] of [...paths].sort()) out(`    ${p}: ${[...t].join('|')}`);
  out();
}

const jarvis = arg('jarvis'),
  timeline = arg('timeline');
if (!jarvis && !timeline) {
  out('Usage: node scripts/probe-sources.mjs --jarvis jarvis.db --timeline Timeline.json');
  process.exit(1);
}
if (jarvis) probeJarvis(jarvis);
if (timeline) probeTimeline(timeline);
