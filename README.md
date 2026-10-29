# Wattson

Interval demand data, visualized.

Wattson is a mobile-friendly web app that turns 15-minute (or any interval) electricity usage data into the demand plots used in energy assessments. It is a JavaScript port of the Python tool in [`python/`](python/), with interactive charts, smarter file import, and PNG, ZIP and PDF exports.

There is no backend and no account. Files are read and plotted in the browser and never uploaded, so hosting is free. The app is a static site, and Vercel's free tier works well.

## What it makes

The same eight visualizations as the Python tool, in the same order:

1. Histogram of demand magnitude
2. Annual demand pattern (with peak, average, lowest nonzero and zero-demand markers)
3. Average daily demand pattern for each day of the week (7 plots)
4. Average daily demand pattern for weekdays (Mon–Fri)
5. Average daily demand pattern for weekends (Sat–Sun)
6. Average daily demand pattern for the hottest months (July, August)
7. Average daily demand pattern for the coolest months (December, January)
8. Box and whisker plot of demand by month

Plus:

- **Custom daily profile builder:** pick any days of the week and months and add an average daily demand plot (the Python tool's `daily_demand_anaylsis()` without editing code).
- **Summary stats:** peak demand and when it happened, average, lowest nonzero, load factor, total kWh, zero-demand intervals.
- **Exports:** each plot as a PNG, all plots as a ZIP (with `summary.csv`), or a PDF report (summary page plus one plot per page). On phones, **Share** sends any of them through the share sheet (Save to Files, email, Messages, and so on).
- **kW or kVA:** kVA divides each meter's kW by its power factor.
- **Multiple meters:** add several files, or a file with several meters, and their demand is summed.

Charts are interactive in the app (tap or hover for values; zoom the annual chart with its slider, or Ctrl + scroll on a computer). Downloads are fixed-size PNGs ready for reports.

## Data files

Wattson reads `.csv`, `.xlsx` and `.xls` files. It checks for these layouts, in order:

1. **Smart Meter Texas interval CSV** (the format of the [sample file](sample-data/SmartMeterTexas_IntervalData_sample.csv)). This is the 15-minute interval report you can download from [Smart Meter Texas](https://www.smartmetertexas.com) for Texas ERCOT meters: `ESIID, USAGE_DATE, REVISION_DATE, USAGE_START_TIME, USAGE_END_TIME, USAGE_KWH, ESTIMATED_ACTUAL, CONSUMPTION_SURPLUSGENERATION`. Each ESIID becomes its own meter, surplus generation rows are excluded, and estimated readings are counted.
2. **The Python tool's Excel template:** `Date | Time (0–1 day fraction) | kWh`. Extra numeric columns are treated as more meters.
3. **Anything else:** Wattson guesses the date, time and usage columns. Tap the sliders icon on a file to check or change them (date, time, kWh or kW, meter ID column, header row, interval).

Unlike the Python tool, no manual Excel cleanup is needed:

- The interval is detected automatically.
- Daylight saving days are handled. Blank readings in the hour skipped in spring are dropped, and the repeated hour in fall is kept.
- Meters with different start and end dates are lined up by timestamp.

The sample file is real 15-minute data from one facility (7/1/2025 – 7/8/2026). Its ESIID has been replaced with the placeholder `00000000000000000`.

## Setup

### 1. Run locally

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. Other scripts: `npm run build` (production build to `dist/`), `npm run preview` (serve the build), `npm test` (importer and analysis tests).

### 2. Deploy to Vercel

In [Vercel](https://vercel.com/new), **Import** this GitHub repository and deploy. Vercel detects Vite, and `vercel.json` sets the build, the `dist` output folder, and the SPA rewrites. No environment variables are needed.

### Install on a phone

Open the deployed site, then:

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** (or **Install app**).

It opens full screen like an app.

## The Python tool

[`python/15MinData_Visualizations_2026.py`](python/15MinData_Visualizations_2026.py) is the original tool, unchanged, with its [Word guide](python/15MinData_Visualizations_Instructions_2026.docx). It needs `pandas`, `numpy`, `matplotlib` and `openpyxl`. Follow the instructions at the top of the script.

### Checking the port

The JavaScript port ([`src/lib/demandAnalysis.js`](src/lib/demandAnalysis.js)) was checked against the Python tool run unmodified on the sample data. Peak, average and lowest nonzero demand, all 30 histogram bin counts, the monthly medians, and the average, peak and lowest lines of all 11 daily plots match to floating-point precision. To repeat the check, [`tests/python_capture.py`](tests/python_capture.py) runs the Python tool and saves what it plots, and [`tests/compare-python.mjs`](tests/compare-python.mjs) compares that with the port.

Small differences from the Python tool:

- Meters are lined up by timestamp, so their files don't need identical rows. Timestamps missing from any meter are left out, and the count is shown.
- Individual days are grouped by calendar date instead of by the day's last time step.
- Per-day plots label the y axis with the chosen unit (the script always said kW).
- The box plot is in calendar order with month names.

## Project structure

```
python/                       The original Python tool and its Word guide (unchanged)
sample-data/                  Smart Meter Texas sample file (ESIID replaced with a placeholder)
src/
  lib/demandAnalysis.js       JavaScript port of the Python tool's calculations
  lib/smartImport.js          File reading and format detection (CSV/Excel, Smart Meter Texas, template, custom)
  lib/charts.js               ECharts options for the interactive charts and the PNG exports
  lib/exports.js              PNG, ZIP and PDF exports
  components/                 UI pieces (data files, column chooser, plot cards, builder)
  pages/Home.jsx              The app screen
tests/                        Node tests for the importer and analysis
```

Built with React, Vite, Tailwind CSS, Apache ECharts, jsPDF and SheetJS.

## License

Released under the [MIT License](LICENSE).
