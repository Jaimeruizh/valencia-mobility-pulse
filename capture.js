// València mobility capture: saves a snapshot of the live open-data feeds every time it runs.
// The city portal only publishes "now"; this script builds the history. Run by the scheduled task ValenciaMobilityCapture.
//   node capture.js            -> one capture (Valenbisi availability + traffic intensity)
// Output: data/history/valenbisi.csv, data/history/traffic.csv (append), data/snapshot.js, data/history.js (rewritten)
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, 'data'), HIST = path.join(DATA, 'history');
const BASE = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/';
const QUERY = '/query?where=1=1&outFields=*&f=geojson';
const KEEP_HOURS = 72; // hours of history embedded in the dashboard (the CSV keeps everything)
const log = s => fs.appendFileSync(path.join(__dirname, 'capture.log'), new Date().toISOString() + ' ' + s + '\n');
const writeAtomic = (f, txt) => { fs.writeFileSync(f + '.tmp', txt); fs.renameSync(f + '.tmp', f); };
async function layer(id) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(BASE + id + QUERY, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); if (!j.features || !j.features.length) throw new Error('no features');
      return j.features;
    } catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 6000)); }
  }
}
const pretty = s => String(s || '').replace(/^\d+_/, '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
// Traffic state (refreshed by the city every 3 minutes): how many street segments are flowing, dense, congested or closed.
// Codes: 0 flowing, 1 dense, 2 congested, 3 closed, 4 no data; 5 to 9 are the same states for underpasses.
function countStates(codes) { const o = { flowing: 0, dense: 0, congested: 0, closed: 0, nodata: 0 }; for (const c of codes) o[c == null ? 'nodata' : ['flowing', 'dense', 'congested', 'closed', 'nodata'][c % 5]]++; return o; }
async function trafficState() {
  try {
    const r = await fetch(BASE + '192/query?where=1=1&outFields=idtramo,estado&returnGeometry=false&f=json', { signal: AbortSignal.timeout(30000) });
    const j = await r.json(); if (!j.features || !j.features.length) throw new Error('no features');
    return countStates(j.features.map(f => f.attributes.estado));
  } catch (e) { log('WARN traffic state ' + e.message); return null; }
}
function snapshot(bikes, traffic, at) {
  const stations = bikes.map(f => { const p = f.properties, c = f.geometry.coordinates; return { n: p.number, name: pretty(p.name), address: p.address, lon: +c[0].toFixed(5), lat: +c[1].toFixed(5), available: p.available, free: p.free, total: p.total, open: p.open === 'T', updated: p.updated_at }; }).sort((a, b) => a.n - b.n);
  const readings = {}; for (const f of traffic) readings[f.properties.idtramo] = f.properties.lectura;
  return { capturedAt: at, stations, traffic: readings };
}
function appendHistory(snap) {
  const vb = path.join(HIST, 'valenbisi.csv'), tr = path.join(HIST, 'traffic.csv'), wide = path.join(HIST, 'snapshots.jsonl');
  if (fs.existsSync(wide)) { const prev = fs.readFileSync(wide, 'utf8').trim().split(String.fromCharCode(10)).pop(); if (prev && JSON.parse(prev).t === snap.capturedAt) return false; } // same minute already saved
  if (!fs.existsSync(vb)) fs.writeFileSync(vb, 'captured_at,station,bikes_available,docks_free,docks_total\n');
  if (!fs.existsSync(tr)) fs.writeFileSync(tr, 'captured_at,segment,reading\n');
  fs.appendFileSync(vb, snap.stations.map(s => [snap.capturedAt, s.n, s.available, s.free, s.total].join(',')).join('\n') + '\n');
  fs.appendFileSync(tr, Object.entries(snap.traffic).filter(([, v]) => v >= 0).map(([k, v]) => [snap.capturedAt, k, v].join(',')).join('\n') + '\n');
  const valid = Object.values(snap.traffic).filter(v => v >= 0);
  fs.appendFileSync(wide, JSON.stringify({ t: snap.capturedAt, s: snap.stations.map(s => [s.n, s.available, s.free]), tv: valid.reduce((a, b) => a + b, 0), tn: valid.length, ts: snap.trafficState ? [snap.trafficState.flowing, snap.trafficState.dense, snap.trafficState.congested, snap.trafficState.closed, snap.trafficState.nodata] : null }) + '\n');
}
function buildHistoryJs() {
  const lim = Date.now() - KEEP_HOURS * 3600e3;
  const lines = fs.readFileSync(path.join(HIST, 'snapshots.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter((x, i, all) => new Date(x.t).getTime() >= lim && (i === 0 || all[i - 1].t !== x.t));
  writeAtomic(path.join(DATA, 'history.js'), 'window.HISTORY=' + JSON.stringify(lines) + ';\n');
  return lines.length;
}
function localIso(d) { const p = n => String(n).padStart(2, '0'); const o = -d.getTimezoneOffset(); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${o >= 0 ? '+' : '-'}${p(Math.abs(o) / 60 | 0)}:${p(Math.abs(o) % 60)}`; }
module.exports = { snapshot, appendHistory, buildHistoryJs, writeAtomic, localIso, DATA };
if (require.main === module) (async () => {
  fs.mkdirSync(HIST, { recursive: true });
  const [bikes, traffic, state] = await Promise.all([layer(228), layer(188), trafficState()]);
  const snap = snapshot(bikes, traffic, localIso(new Date()));
  snap.trafficState = state;
  appendHistory(snap);
  writeAtomic(path.join(DATA, 'snapshot.js'), 'window.SNAPSHOT=' + JSON.stringify(snap) + ';\n');
  const n = buildHistoryJs();
  log(`ok ${snap.capturedAt} stations ${snap.stations.length} bikes ${snap.stations.reduce((a, s) => a + s.available, 0)} traffic ${Object.keys(snap.traffic).length} history ${n}`);
  console.log('ok', snap.capturedAt, 'history points', n);
  // refresh the tables and pages that depend on the capture (skipped with --no-build)
  if (!process.argv.includes('--no-build')) for (const f of ['build_base.js', 'build_page.js']) {
    try { require('child_process').execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); } catch (e) { log('WARN ' + f + ' ' + e.message.split('\n')[0]); }
  }
})().catch(e => { log('ERROR ' + e.message); console.error('ERR', e.message); process.exit(1); });
