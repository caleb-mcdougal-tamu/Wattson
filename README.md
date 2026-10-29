# Wattson

Interval demand data, visualized.

Wattson is a mobile-friendly web app that turns 15-minute (or any interval) electricity usage data into the demand plots used in energy assessments. It is a JavaScript port of the Python tool in [`python/`](python/), with interactive charts, smarter file import, and saving to your device or Google Drive.

There is no backend. Files are read and plotted in the browser, so hosting is free. The app is a static site, and Vercel's free tier works well. Google Drive is optional: without it, everything works from the device.

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
- **Exports:** each plot as a PNG, all plots as a ZIP (with `summary.csv`), or a PDF report (summary page plus one plot per page).
- **kW or kVA:** kVA divides each meter's kW by its power factor.
- **Multiple meters:** add several files, or a file with several meters, and their demand is summed.

Charts are interactive in the app (tap or hover for values; zoom the annual chart with its slider, or Ctrl + scroll on a computer). Downloads are fixed-size PNGs ready for reports.

## Data files

Wattson reads `.csv`, `.xlsx` and `.xls` files, plus Google Sheets from Drive. It checks for these layouts, in order:

1. **Smart Meter Texas interval CSV** (the format of the [sample file](sample-data/SmartMeterTexas_IntervalData_sample.csv)). This is the 15-minute interval report you can download from [Smart Meter Texas](https://www.smartmetertexas.com) for Texas ERCOT meters: `ESIID, USAGE_DATE, REVISION_DATE, USAGE_START_TIME, USAGE_END_TIME, USAGE_KWH, ESTIMATED_ACTUAL, CONSUMPTION_SURPLUSGENERATION`. Each ESIID becomes its own meter, surplus generation rows are excluded, and estimated readings are counted.
2. **The Python tool's Excel template:** `Date | Time (0–1 day fraction) | kWh`. Extra numeric columns are treated as more meters.
3. **Anything else:** Wattson guesses the date, time and usage columns. Tap the sliders icon on a file to check or change them (date, time, kWh or kW, meter ID column, header row, interval).

Unlike the Python tool, no manual Excel cleanup is needed:

- The interval is detected automatically.
- Daylight saving days are handled. Blank readings in the hour skipped in spring are dropped, and the repeated hour in fall is kept.
- Meters with different start and end dates are lined up by timestamp.

The sample file is real 15-minute data from one facility (7/1/2025 – 7/8/2026). Its ESIID has been replaced with the placeholder `00000000000000000`.

## Storage

- **Device:** pick files from the phone or computer, and download PNGs, ZIPs and PDFs. Nothing is uploaded.
- **Google Drive (optional):** sign in to open data files from Drive (My Drive, Shared with me, shared drives) and save to it:

```
My Drive/
└─ Wattson/
   └─ <Site>/                         ← the "Site" setting (defaults to the title header or file name)
      ├─ Data/                        ← data files you save from the app
      └─ Plots/
         ├─ <Title> 2026-10-29_1430/  ← "Save all to Drive": every PNG, the PDF report and summary.csv
         └─ 05_..._on_Thursday.png    ← single plots saved from a plot card
```

## Setup

### 1. Create the Google OAuth client (only for Google Drive)

Skip this step to run Wattson without Drive. The Drive buttons are hidden until a client ID is set.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (for example "Wattson").
2. **Enable the Drive API:** *APIs & Services → Library →* search "Google Drive API" → **Enable**.
3. **Configure the OAuth consent screen** (*Google Auth Platform → Branding / Audience*):
   - **App name:** Wattson. Add a support email.
   - **Audience:**
     - **Internal** works if everyone who will use the app belongs to the same Google Workspace organization (for example a company or university domain) and your project is in that organization.
     - **External** otherwise. While the app is in **Testing** status, add each user's Google account under **Test users** (up to 100). Testers see a "Google hasn't verified this app" screen the first time and click **Continue**.
   - **Data access → Add scope:** `https://www.googleapis.com/auth/drive`.
4. **Create the client ID:** *Clients → Create client → Application type: Web application.*
   - **Authorized JavaScript origins:** `http://localhost:5173` for local development, and your Vercel URL (for example `https://wattson.vercel.app`) once you have it.
   - Leave **Authorized redirect URIs** empty. The app uses Google's popup token flow.
5. Copy the **Client ID**. It isn't a secret: it ships to the browser, and Google only accepts it from the origins you listed.

> **Why full Drive access?** It lets Wattson open data files that are already in your Drive or shared with you, not only files the app created. Google classifies this scope as *restricted*. That's fine for Internal apps and for External apps in Testing; making an External app public to any Google user requires Google's verification.

### 2. Run locally

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
cp .env.example .env.local   # optional: set VITE_GOOGLE_CLIENT_ID for Google Drive
npm run dev
```

Open http://localhost:5173. Other scripts: `npm run build` (production build to `dist/`), `npm run preview` (serve the build), `npm test` (importer and analysis tests).

### 3. Deploy to Vercel

1. In [Vercel](https://vercel.com/new), **Import** this GitHub repository. Vercel detects Vite, and `vercel.json` sets the build, the `dist` output folder, and the SPA rewrites.
2. Under **Environment Variables**, add `VITE_GOOGLE_CLIENT_ID` with your client ID (optional), then deploy.
3. Back in Google Cloud Console, add the deployed URL to the OAuth client's **Authorized JavaScript origins**. It can take a few minutes to take effect.

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
  lib/google/                 Google sign-in, Drive REST client, Wattson folder layout
  components/                 UI pieces (data files, column chooser, Drive picker, plot cards, builder)
  pages/Home.jsx              The app screen
tests/                        Node tests for the importer and analysis
```

Built with React, Vite, Tailwind CSS, Apache ECharts, jsPDF and SheetJS.

## License

Released under the [MIT License](LICENSE).
