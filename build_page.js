// Builds the pages and the light history table from src/*.html and data/*.js.
//   node build_page.js
// Output:
//   dashboard.html                 full page that reads data/base.js, data/snapshot.js, data/history.js (always the latest capture)
//   kit/dashboard_example.html     the same page in ONE file with the data inside (to share or upload)
//   kit/workshop_prompts.html      the participants' handout
//   kit/city_history.csv           one row per capture: bikes, free docks, empty and full stations, traffic
//   kit/automation/                the capture script and the GitHub workflow, to show how the automation works
// If the shared Drive folder exists on this computer, the kit is copied there too.
const fs = require('fs'), path = require('path');
const D = __dirname, NL = String.fromCharCode(10), KIT = path.join(D, 'kit');
const DRIVE = 'G:/Mi unidad/cities forum/mentoring/Workshop_Valencia_Mobility_Dashboard';
fs.mkdirSync(path.join(KIT, 'automation'), { recursive: true });
function page(name) {
  const src = fs.readFileSync(path.join(D, 'src', name), 'utf8'), cut = src.indexOf('<!--body-->');
  if (cut < 0) throw new Error('marker <!--body--> not found in ' + name);
  const head = src.slice(0, cut), body = src.slice(cut + '<!--body-->'.length);
  return { body, doc: b => '<!doctype html>' + NL + '<html lang="en">' + NL + '<head>' + NL + '<meta charset="utf-8">' + NL + '<meta name="viewport" content="width=device-width, initial-scale=1">' + NL + head + '</head>' + NL + '<body>' + b + '</body>' + NL + '</html>' + NL };
}
const dash = page('dashboard_body.html');
fs.writeFileSync(path.join(D, 'dashboard.html'), dash.doc(dash.body));

// working copy that is being improved (src/dashboard_v2_body.html): local page only, kept out of the kit
try {
  if (fs.existsSync(path.join(D, 'src', 'dashboard_v2_body.html'))) {
    const v2 = page('dashboard_v2_body.html');
    fs.writeFileSync(path.join(D, 'dashboard_v2.html'), v2.doc(v2.body));
  }
} catch (e) { console.log('WARN dashboard_v2', e.message); }

// one-file version: the three data files go inside the page
let one = dash.body;
for (const f of ['base', 'snapshot', 'history']) {
  const tag = '<script src="data/' + f + '.js"></script>';
  if (!one.includes(tag)) throw new Error('tag not found: ' + tag);
  const js = fs.readFileSync(path.join(D, 'data', f + '.js'), 'utf8').split('</').join('<\\/');
  one = one.split(tag).join('<script>' + js + '</script>');
}
fs.writeFileSync(path.join(KIT, 'dashboard_example.html'), dash.doc(one));
const prompts = page('prompts_body.html');
fs.writeFileSync(path.join(KIT, 'workshop_prompts.html'), prompts.doc(prompts.body));

// light history table (deduplicated by capture time)
global.window = {}; require('./data/history.js');
const rows = [['captured_at', 'bikes_available', 'docks_free', 'stations_no_bikes', 'stations_no_free_docks', 'stations_out_of_service', 'traffic_reading_sum', 'traffic_sensors_reporting', 'segments_flowing', 'segments_dense', 'segments_congested', 'segments_closed']];
for (const h of window.HISTORY) {
  let bikes = 0, free = 0, empty = 0, full = 0, off = 0;
  for (const s of h.s) { bikes += s[1]; free += s[2]; if (s[1] + s[2] === 0) off++; else if (s[1] === 0) empty++; else if (s[2] === 0) full++; }
  rows.push([h.t, bikes, free, empty, full, off, h.tv, h.tn, ...(h.ts ? h.ts.slice(0, 4) : ['', '', '', ''])]);
}
fs.writeFileSync(path.join(KIT, 'city_history.csv'), rows.map(r => r.join(',')).join(NL) + NL);

// automation examples
fs.copyFileSync(path.join(D, 'capture.js'), path.join(KIT, 'automation', 'capture.js'));
fs.copyFileSync(path.join(D, '.github', 'workflows', 'capture.yml'), path.join(KIT, 'automation', 'github_workflow_capture.yml'));
fs.copyFileSync(path.join(D, 'README.md'), path.join(KIT, 'automation', 'README.md'));

// copy to the shared Drive folder (only files whose content changed)
let copied = 0, failed = 0;
if (fs.existsSync(DRIVE)) {
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(KIT, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) { fs.mkdirSync(path.join(DRIVE, r), { recursive: true }); walk(r); continue; }
      try {
        const a = fs.readFileSync(path.join(KIT, r)), to = path.join(DRIVE, r);
        if (fs.existsSync(to) && fs.statSync(to).size === a.length && fs.readFileSync(to).equals(a)) continue;
        fs.writeFileSync(to, a); copied++;
      } catch (e2) { failed++; }
    }
  };
  walk('');
}
const kb = f => (fs.statSync(path.join(D, f)).size / 1024).toFixed(0) + ' KB';
console.log('dashboard.html', kb('dashboard.html'), '| kit/dashboard_example.html', kb('kit/dashboard_example.html'), '| city_history.csv rows', rows.length - 1, 'from', rows[1][0], 'to', rows[rows.length - 1][0], '| drive copied', copied, 'failed', failed);
