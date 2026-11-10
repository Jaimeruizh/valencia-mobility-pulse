# València Mobility Pulse

A dashboard of public bike share, traffic and neighbourhood coverage in València, built on the open data portal of the Ajuntament de València. Workshop example of the CITIES FORUM International Mentoring Programme.

The city portal only publishes the present moment. This project saves a copy every few minutes and builds the history from it.

## What is here

| File | What it does |
| --- | --- |
| `capture.js` | One capture of the live feeds: bike availability, traffic readings, traffic state. Appends to `data/history/` and rewrites `data/snapshot.js` and `data/history.js`. |
| `build_base.js` | Builds the layers that rarely change (neighbourhood outlines and indicators, traffic segments) into `data/base.js`, and the light tables in `kit/`. Run with `--refresh` about once a month. |
| `build_page.js` | Builds `dashboard.html`, the one-file `kit/dashboard_example.html`, `kit/workshop_prompts.html` and `kit/city_history.csv`. |
| `src/` | The page sources. |
| `kit/` | What workshop participants receive. |
| `.github/workflows/capture.yml` | Runs the capture every hour on GitHub, with no computer switched on. |

Needs Node.js 20 or later. No packages to install.

## Run it

```
node capture.js        # capture now and rebuild everything
```

Open `dashboard.html` in a browser. Opened this way it also reads the live feeds directly and refreshes every 5 minutes.

## Sources

Ajuntament de València open data portal, https://opendata.vlci.valencia.es/group/transporte : ValenBisi Disponibilidad, Intensidad tráfico tramos, Estado tráfico tiempo real, Barrios, EMT, Itinerarios ciclistas, Vulnerabilidad por barrios 2021.
