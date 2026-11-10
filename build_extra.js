// Builds data/extra.js for the v2 dashboard: the cycle network lines and the EMT bus stops,
// lightened from the raw downloads in data/raw (run by hand; the raw files are not in the repo).
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'data'), E = 1e5;
const rd = f => JSON.parse(fs.readFileSync(path.join(D, 'raw', f), 'utf8'));

// keep a point only when it is about 12 m or more from the last kept one
function thin(c) {
  const o = [c[0]];
  for (let i = 1; i < c.length - 1; i++) { const l = o[o.length - 1]; if (Math.hypot((c[i][0] - l[0]) * 0.77, c[i][1] - l[1]) > 0.00012) o.push(c[i]); }
  if (c.length > 1) o.push(c[c.length - 1]);
  return o;
}
// first point absolute, the rest as differences, all in 1e-5 degrees
function pack(c) {
  const o = []; let px = 0, py = 0;
  c.forEach((p, i) => { const x = Math.round(p[0] * E), y = Math.round(p[1] * E); o.push(i ? x - px : x, i ? y - py : y); px = x; py = y; });
  return o;
}

let metres = 0, before = 0, after = 0;
const cycle = rd('cycle.geojson').features.filter(f => f.geometry && f.geometry.type === 'LineString' && f.geometry.coordinates.length > 1).map(f => {
  metres += f.properties['st_length(shape)'] || 0; before += f.geometry.coordinates.length;
  const t = thin(f.geometry.coordinates); after += t.length; return pack(t);
});
const stops = [];
rd('emt.geojson').features.forEach(f => { if (f.geometry && !f.properties.suprimida) stops.push(Math.round(f.geometry.coordinates[0] * E), Math.round(f.geometry.coordinates[1] * E)); });

const out = { builtAt: new Date().toISOString(), cycleKm: Math.round(metres / 100) / 10, cycle, stops };
fs.writeFileSync(path.join(D, 'extra.js'), 'window.EXTRA = ' + JSON.stringify(out) + ';\n');
console.log('lines', cycle.length, 'points', before, '->', after, 'km', out.cycleKm, 'stops', stops.length / 2, 'bytes', fs.statSync(path.join(D, 'extra.js')).size);
console.log('sample', JSON.stringify(cycle[0]).slice(0, 120), stops.slice(0, 4));
