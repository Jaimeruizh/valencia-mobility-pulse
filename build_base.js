// Builds the static layers of the dashboard and the light CSV files of the workshop kit.
//   node build_base.js            -> uses data/raw/*.geojson (downloads the ones that are missing)
//   node build_base.js --refresh  -> downloads everything again (run monthly: these layers rarely change)
// Output: data/base.js (neighbourhood outlines + indicators, traffic segments) and kit/*.csv
const fs = require('fs'), path = require('path');
const RAW = path.join(__dirname, 'data', 'raw'), KIT = path.join(__dirname, 'kit');
const GEO = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/';
const Q = '/query?where=1=1&outFields=*&f=geojson';
const SRC = {
  barrios: GEO + 'UrbanismoEInfraestructuras/MapServer/224' + Q,
  vuln: 'https://opendata.vlci.valencia.es/dataset/ca18278b-d040-4274-b9c7-c1a9daae54b9/resource/fd2ca0dc-5344-4aad-8934-2077a0bb120d/download/vulnerabilidad-por-barrios.geojson',
  emt: GEO + 'Trafico/MapServer/226' + Q, traffic: GEO + 'Trafico/MapServer/188' + Q, cycle: GEO + 'Trafico/MapServer/189' + Q,
};
const DISTRICTS = { 1: 'Ciutat Vella', 2: "L'Eixample", 3: 'Extramurs', 4: 'Campanar', 5: 'La Saïdia', 6: 'El Pla del Real', 7: "L'Olivereta", 8: 'Patraix', 9: 'Jesús', 10: 'Quatre Carreres', 11: 'Poblats Marítims', 12: 'Camins al Grau', 13: 'Algirós', 14: 'Benimaclet', 15: 'Rascanya', 16: 'Benicalap', 17: 'Pobles del Nord', 18: "Pobles de l'Oest", 19: 'Pobles del Sud' };
async function load(k) {
  const f = path.join(RAW, k + '.geojson');
  if (!fs.existsSync(f) || process.argv.includes('--refresh')) { const r = await fetch(SRC[k], { signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error(k + ' HTTP ' + r.status); fs.writeFileSync(f, await r.text()); }
  return JSON.parse(fs.readFileSync(f, 'utf8')).features;
}
// --- geometry helpers
const r5 = v => +v.toFixed(5);
function simplify(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let dm = 0, im = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b]; const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [x, y] = pts[i]; let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(x - x1 - t * dx, y - y1 - t * dy); if (d > dm) { dm = d; im = i; } }
    if (dm > tol && im > 0) { keep[im] = 1; st.push([a, im], [im, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const rings = g => g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.coordinates;
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// area of a lon/lat ring in km2 (the portal's own area field is not in square metres, so it is computed here)
function areaKm2(r) { const ky = 111.32, kx = 111.32 * Math.cos(39.47 * Math.PI / 180); let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky); return Math.abs(a) / 2; }
const NEEDS_QUOTES =new RegExp('[",' + String.fromCharCode(10) + ']');
const csv = rows => rows.map(r => r.map(v => v == null ? '' : NEEDS_QUOTES.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join(String.fromCharCode(10)) + String.fromCharCode(10);
const title = s => String(s || '').toLowerCase().replace(/(^|[\s'.-])\S/g, c => c.toUpperCase())
  .replace(/(?<=\S )(De|Del|Dels|La|Les|El|Els|Los|Las|I|Y|En|Al)(?= )/g, m => m.toLowerCase()).replace(/\b[IVX][ivx]+\b/g, m => m.toUpperCase());
const LEVEL = { Baja: 'Low', Media: 'Medium', Alta: 'High' };

(async () => {
  const [barrios, vuln, emt, traffic, cycle] = await Promise.all(['barrios', 'vuln', 'emt', 'traffic', 'cycle'].map(load));
  global.window = {}; require('./data/snapshot.js'); const snap = window.SNAPSHOT;
  const vul = {}; for (const f of vuln) vul[String(f.properties.codbar).padStart(3, '0')] = f.properties;
  const B = barrios.map(f => {
    const p = f.properties, v = vul[p.coddistbar]; const lvl = v ? String(v.vul_global).replace('Vulnerabilidad ', '') : null;
    return { code: p.coddistbar, name: title(p.nombre), district: DISTRICTS[+p.coddistrit] || '', km2: +rings(f.geometry).reduce((a, r) => a + areaKm2(r), 0).toFixed(3), raw: rings(f.geometry), stations: 0, docks: 0, bikes: 0, stops: 0, lineSet: new Set(), cycleKm: 0, vul: v ? v.ind_global : null, vulLabel: lvl ? (LEVEL[lvl] || lvl) : null, vulName: v ? v.nombre : null };
  });
  const find = (x, y) => B.find(b => b.raw.some(r => inRing(x, y, r)));
  const stationBarrio = {};
  for (const s of snap.stations) { const b = find(s.lon, s.lat); if (b) { b.stations++; b.docks += s.total; b.bikes += s.available; stationBarrio[s.n] = b; } }
  let emtOut = 0;
  for (const f of emt) { const [x, y] = f.geometry.coordinates; const b = find(x, y); if (!b) { emtOut++; continue; } b.stops++; String(f.properties.lineas || '').split(/[,;\s]+/).filter(Boolean).forEach(l => b.lineSet.add(l)); }
  for (const f of cycle) { if (!f.geometry) continue; const ls = lines(f.geometry); for (const l of ls) { const m = l[l.length >> 1]; const b = find(m[0], m[1]); if (b) b.cycleKm += (f.properties['st_length(shape)'] || 0) / 1000 / ls.length; } }
  const T = traffic.filter(f => f.geometry).map(f => { const p = f.properties; const pts = simplify(lines(f.geometry)[0], 0.00004).map(c => [r5(c[0]), r5(c[1])]); return { id: p.idtramo, name: title(p.des_tramo), imv: +p.imv || null, pts }; });
  const base = {
    builtAt: new Date().toISOString(),
    barrios: B.map(b => ({ code: b.code, name: b.name, district: b.district, km2: b.km2, stations: b.stations, docks: b.docks, stops: b.stops, lines: b.lineSet.size, cycleKm: +b.cycleKm.toFixed(2), vul: b.vul, vulLabel: b.vulLabel, rings: b.raw.map(r => simplify(r, 0.00008).map(c => [r5(c[0]), r5(c[1])])) })),
    traffic: T, stationBarrio: Object.fromEntries(Object.entries(stationBarrio).map(([n, b]) => [n, b.code])),
  };
  fs.writeFileSync(path.join(__dirname, 'data', 'base.js'), 'window.BASE=' + JSON.stringify(base) + ';');
  // --- workshop kit: light tables any AI assistant can read in one go
  fs.writeFileSync(path.join(KIT, 'valenbisi_stations.csv'), csv([['station', 'address', 'neighbourhood', 'district', 'lon', 'lat', 'bikes_available', 'docks_free', 'docks_total'], ...snap.stations.map(s => { const b = stationBarrio[s.n]; return [s.n, s.address, b ? b.name : '', b ? b.district : '', s.lon, s.lat, s.available, s.free, s.total]; })]));
  fs.writeFileSync(path.join(KIT, 'neighbourhoods.csv'), csv([['code', 'neighbourhood', 'district', 'area_km2', 'valenbisi_stations', 'valenbisi_docks', 'bikes_available_now', 'bus_stops', 'bus_lines', 'cycle_route_km', 'vulnerability_index_2021', 'vulnerability_level_2021'], ...B.map(b => [b.code, b.name, b.district, b.km2, b.stations, b.docks, b.bikes, b.stops, b.lineSet.size, +b.cycleKm.toFixed(2), b.vul, b.vulLabel])]));
  const mid = t => t.pts[t.pts.length >> 1];
  fs.writeFileSync(path.join(KIT, 'traffic_segments.csv'), csv([['segment', 'street', 'latest_reading', 'average_daily_intensity', 'lon', 'lat'], ...T.map(t => [t.id, t.name, snap.traffic[t.id] >= 0 ? snap.traffic[t.id] : '', t.imv, mid(t)[0], mid(t)[1]])]));
  fs.writeFileSync(path.join(KIT, 'neighbourhood_outlines.geojson'), JSON.stringify({ type: 'FeatureCollection', features: base.barrios.map(b => ({ type: 'Feature', properties: { code: b.code, neighbourhood: b.name, district: b.district }, geometry: { type: 'MultiPolygon', coordinates: b.rings.map(r => [r]) } })) }));
  const sz = f => fs.statSync(f).isDirectory() ? 'dir' : (fs.statSync(f).size / 1024).toFixed(0) + ' KB';
  console.log('base.js', sz(path.join(__dirname, 'data', 'base.js')), '| barrios', B.length, 'with vuln', B.filter(b => b.vul != null).length, '| stations placed', Object.keys(stationBarrio).length, '/', snap.stations.length, '| emt outside', emtOut, '| cycle km placed', B.reduce((a, b) => a + b.cycleKm, 0).toFixed(1));
  console.log('vuln name check:', B.filter(b => b.vulName && b.vulName.toLowerCase() !== b.name.toLowerCase()).map(b => b.name + '<>' + b.vulName).slice(0, 8).join(' | ') || 'all match');
  console.log('snapshot time', snap.capturedAt, '| kit', fs.readdirSync(KIT).map(f => f + ' ' + sz(path.join(KIT, f))).join(', '));
  console.log('top docks', [...B].sort((a, b) => b.docks - a.docks).slice(0, 4).map(b => b.name + ' ' + b.docks + ' (' + b.district + ')').join(' | '));
  for (const l of ['Low', 'Medium', 'High']) { const v = B.filter(b => b.vulLabel === l).map(b => b.vul); console.log('vul', l, v.length, Math.min(...v), Math.max(...v)); }
  console.log('city km2', B.reduce((a, b) => a + b.km2, 0).toFixed(1), '| traffic segments', T.length);
  console.log('emt lineas sample', emt.slice(0, 5).map(f => f.properties.lineas).join(' ; '));
})().catch(e => { console.error('ERR', e.stack); process.exit(1); });
