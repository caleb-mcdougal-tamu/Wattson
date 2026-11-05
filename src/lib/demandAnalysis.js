// JavaScript port of python/15MinData_Visualizations_2026.py.
//
// The sections below follow the Python tool in order:
//   INPUTS VALIDATION             -> validateInputs()
//   FILE READING / import_sort_data -> combineMeters() (file parsing lives in smartImport.js)
//   HISTOGRAM OF DEMAND MAGNITUDE -> histogram()
//   ANNUAL DEMAND ANALYSIS        -> annualDemand()
//   DAILY DEMAND ANALYSIS         -> dailyDemandAnalysis()
//   MONTHLY DEMAND ANALYSIS       -> monthlyBoxPlot()
//   (the run of plots at the bottom of the script) -> standardPlots()
//
// loadDistribution(), weekHeatmap() and dayHeatmap() are additions with no Python counterpart.
//
// The functions return plain data; src/lib/charts.js turns it into charts.
// Timestamps are wall-clock times stored as UTC milliseconds (see smartImport.js).
//
// Differences from the Python version:
//   - Meters are lined up by timestamp, so their files don't need identical rows;
//     timestamps missing from any meter are dropped (and counted) instead.
//   - Individual days are grouped by calendar date instead of by the last time step
//     of the day, so a day with a missing final interval isn't merged into the next.
//   - Per-day plots label the y axis with the chosen unit (the script always said kW),
//     and the box plot is in calendar order with month names.

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;

export const dayOfWeek = (ts) => (new Date(ts).getUTCDay() + 6) % 7; // 0 = Monday, like pandas
export const monthOf = (ts) => new Date(ts).getUTCMonth() + 1; // 1 = January
export const minuteOfDay = (ts) => Math.round((((ts % MS_DAY) + MS_DAY) % MS_DAY) / MS_MIN);
export const dayNumber = (ts) => Math.floor(ts / MS_DAY);

const withHeader = (header, text) => [header, text].filter(Boolean).join(" ").trim();

// ------------------------------------------------------------ INPUTS VALIDATION

export function validateInputs({ meters, demandType, powerFactors }) {
  const errors = [];
  if (!meters.length) errors.push("Add at least one interval data file.");
  if (demandType !== "kW" && demandType !== "kVA") errors.push('Demand type must be either "kW" or "kVA".');
  if (demandType === "kVA") {
    meters.forEach((m, i) => {
      const pf = Number(powerFactors[m.id]);
      if (!(pf > 0 && pf <= 1)) {
        errors.push(`Enter a power factor between 0 and 1 for ${m.name || `meter ${i + 1}`}.`);
      }
    });
  }
  const intervals = new Set(meters.map((m) => m.intervalMin));
  if (intervals.size > 1) {
    errors.push(`The meters have different time intervals (${[...intervals].join(", ")} min). Analyze them separately.`);
  }
  meters.forEach((m) => {
    if (!(m.intervalMin > 0)) errors.push(`The time interval for ${m.name} must be a positive number of minutes.`);
  });
  return errors;
}

// ------------------------------------------------------------ import_sort_data

// Sums every meter into one demand series (kW, or kVA = kW / power factor).
export function combineMeters(meters, { demandType, powerFactors = {} }) {
  const intervalMin = meters[0].intervalMin;
  const toDemand = (m) => {
    const pf = demandType === "kVA" ? Number(powerFactors[m.id]) : 1;
    return (kwh) => ((60 / m.intervalMin) * kwh) / pf;
  };

  if (meters.length === 1) {
    const m = meters[0];
    const f = toDemand(m);
    return {
      ts: Float64Array.from(m.ts),
      kwh: Float64Array.from(m.kwh),
      power: Float64Array.from(m.kwh, f),
      intervalMin,
      demandType,
      dropped: 0,
    };
  }

  // Key each row by timestamp plus its occurrence number, so the repeated hour
  // when clocks fall back is matched to the same repeated hour in the other meters.
  const keyed = meters.map((m) => {
    const seen = new Map();
    const map = new Map();
    m.ts.forEach((t, i) => {
      const n = seen.get(t) || 0;
      seen.set(t, n + 1);
      map.set(`${t}#${n}`, i);
    });
    return map;
  });
  const shared = [...keyed[0].keys()].filter((k) => keyed.every((map) => map.has(k)));
  const funcs = meters.map(toDemand);
  const ts = new Float64Array(shared.length);
  const kwh = new Float64Array(shared.length);
  const power = new Float64Array(shared.length);
  shared.forEach((k, j) => {
    ts[j] = Number(k.slice(0, k.indexOf("#")));
    meters.forEach((m, mi) => {
      const i = keyed[mi].get(k);
      kwh[j] += m.kwh[i];
      power[j] += funcs[mi](m.kwh[i]);
    });
  });
  const total = Math.max(...meters.map((m) => m.ts.length));
  return { ts, kwh, power, intervalMin, demandType, dropped: total - shared.length };
}

// ------------------------------------------------------------ summary statistics

export function summaryStats(data) {
  const { ts, kwh, power, intervalMin } = data;
  let peak = -Infinity;
  let peakAt = null;
  let minNz = Infinity;
  let minNzAt = null;
  let sum = 0;
  let zeros = 0;
  let totalKwh = 0;
  for (let i = 0; i < power.length; i++) {
    const p = power[i];
    sum += p;
    totalKwh += kwh[i];
    if (p > peak) [peak, peakAt] = [p, ts[i]];
    if (p === 0) zeros++;
    else if (p < minNz) [minNz, minNzAt] = [p, ts[i]];
  }
  const avg = power.length ? sum / power.length : NaN;
  const start = ts[0];
  const end = ts[ts.length - 1];
  return {
    peak,
    peakAt,
    avg,
    minNonzero: minNzAt === null ? null : minNz,
    minNonzeroAt: minNzAt,
    zeros,
    totalKwh,
    loadFactor: peak > 0 ? avg / peak : null,
    start,
    end,
    days: dayNumber(end) - dayNumber(start) + 1,
    intervals: power.length,
    intervalMin,
  };
}

// ------------------------------------------------------------ HISTOGRAM OF DEMAND MAGNITUDE

// Same bins as numpy/matplotlib: `bins` equal-width bins from min to max, last bin closed.
export function histogram(data, header = "", bins = 30) {
  const { power, demandType } = data;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of power) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  if (lo === hi) [lo, hi] = [lo - 0.5, hi + 0.5];
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const p of power) counts[Math.min(bins - 1, Math.floor((p - lo) / width))]++;
  return {
    id: "histogram",
    kind: "histogram",
    title: withHeader(header, `Demand Histogram with ${bins} bins`),
    xLabel: `Demand (${demandType})`,
    yLabel: "Count",
    unit: demandType,
    bins: counts.map((count, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count })),
  };
}

// ------------------------------------------------------------ CUMULATIVE LOAD DISTRIBUTION (not in the Python tool)

const percentText = (share) => {
  if (share >= 1) return "100%";
  return share * 100 < 0.1 ? "less than 0.1%" : `${(share * 100).toFixed(1)}%`;
};

// The plain-English reading of one point on the curve.
export const describeExceedance = (load, share, unit) =>
  `Load was ${load.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ${unit} or higher ${percentText(share)} of the time.`;

// Every reading, sorted from highest to lowest and spaced evenly by rank. Each point
// is [rank / n, load, share of readings at or above that load]. The share differs
// from rank / n only when readings repeat, and it keeps the wording "or higher" true.
export function loadDistribution(data, header = "") {
  const { power, intervalMin, demandType } = data;
  const sorted = Float64Array.from(power).filter((p) => !isNaN(p)).sort();
  const n = sorted.length;
  const points = new Array(n);
  let firstOfRun = 0; // where the run of readings equal to the current one starts
  for (let i = 0; i < n; i++) {
    if (sorted[i] !== sorted[firstOfRun]) firstOfRun = i;
    points[n - 1 - i] = [(n - i) / n, sorted[i], (n - firstOfRun) / n];
  }
  const example = points.find((p) => p[2] >= 0.5);
  return {
    id: "load-distribution",
    kind: "distribution",
    title: withHeader(header, "Cumulative Load Distribution"),
    xLabel: "Likelihood of Exceedance",
    yLabel: `Load (${demandType})`,
    legend: "Load Distribution",
    unit: demandType,
    points,
    totalHours: (n * intervalMin) / 60,
    help:
      "How to read this chart: every reading is sorted from highest load to lowest. Likelihood of Exceedance is the share of " +
      "time the load was at or above a given level, so 0.2 means 20% of the time." +
      (example ? ` For example: ${describeExceedance(example[1], example[2], demandType)}` : "") +
      " Rare peaks are at the far left and the lowest loads are at the far right. A flat stretch means the load stays near that level for a lot of the time.",
  };
}

// ------------------------------------------------------------ ANNUAL DEMAND ANALYSIS

export function annualDemand(data, header = "") {
  const { ts, power, demandType } = data;
  const s = summaryStats(data);
  const points = new Array(ts.length);
  const zeros = [];
  for (let i = 0; i < ts.length; i++) {
    points[i] = [ts[i], power[i]];
    if (power[i] === 0) zeros.push([ts[i], 0]);
  }
  return {
    id: "annual",
    kind: "annual",
    title: withHeader(header, "Annual Demand Pattern"),
    xLabel: "Time and Date",
    yLabel: `Demand (${demandType})`,
    unit: demandType,
    points,
    zeros,
    peak: s.peak,
    avg: s.avg,
    minNonzero: s.minNonzero,
  };
}

// ------------------------------------------------------------ DAILY DEMAND ANALYSIS

function dailyProfile(data, keep) {
  const { ts, power } = data;
  const days = new Map(); // day number -> [[hour, demand], ...]
  const byMinute = new Map(); // minute of day -> { sum, n, max, min }
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const p = power[i];
    if (!keep(t) || isNaN(p)) continue;
    const minute = minuteOfDay(t);
    const d = dayNumber(t);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push([minute / 60, p]);
    // Averages, peaks and lows use nonzero demand only, as in the Python tool.
    if (p === 0) continue;
    const b = byMinute.get(minute);
    if (b) {
      b.sum += p;
      b.n++;
      if (p > b.max) b.max = p;
      if (p < b.min) b.min = p;
    } else byMinute.set(minute, { sum: p, n: 1, max: p, min: p });
  }
  const minutes = [...byMinute.keys()].sort((a, b) => a - b);
  return {
    days: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([d, pts]) => ({ date: d * MS_DAY, points: pts })),
    avg: minutes.map((m) => [m / 60, byMinute.get(m).sum / byMinute.get(m).n]),
    max: minutes.map((m) => [m / 60, byMinute.get(m).max]),
    min: minutes.map((m) => [m / 60, byMinute.get(m).min]),
  };
}

// daysToPlot: 0 = Monday ... 6 = Sunday. monthsToPlot: 1 = January ... 12 = December.
// averageDays: true -> one plot averaging all listed days; false -> one plot per day.
export function dailyDemandAnalysis(data, { daysToPlot, averageDays, monthsToPlot, titleTail = "", header = "", id = "daily" }) {
  const months = new Set(monthsToPlot);
  const groups = averageDays ? [daysToPlot] : daysToPlot.map((d) => [d]);
  return groups.map((group) => {
    const days = new Set(group);
    const profile = dailyProfile(data, (t) => months.has(monthOf(t)) && days.has(dayOfWeek(t)));
    const title = averageDays
      ? withHeader(header, `Average Daily Demand Pattern ${titleTail}`)
      : withHeader(header, `Average Daily Demand Pattern on ${DAY_NAMES[group[0]]}${titleTail ? ` ${titleTail}` : ""}`);
    return {
      id: averageDays ? id : `${id}-${DAY_SHORT[group[0]].toLowerCase()}`,
      kind: "daily",
      title,
      xLabel: "Time of Day (hours)",
      yLabel: `Demand (${data.demandType})`,
      unit: data.demandType,
      ...profile,
    };
  });
}

// ------------------------------------------------------------ MONTHLY DEMAND ANALYSIS

// numpy.percentile's default (linear interpolation).
function percentile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Box and whiskers as matplotlib draws them: whiskers reach the furthest point
// within 1.5 × IQR of the box; anything beyond is an outlier.
export function monthlyBoxPlot(data, header = "") {
  const { ts, power, demandType } = data;
  const byMonth = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < ts.length; i++) if (!isNaN(power[i])) byMonth[monthOf(ts[i]) - 1].push(power[i]);
  const boxes = [];
  byMonth.forEach((vals, m) => {
    if (!vals.length) return;
    const s = Float64Array.from(vals).sort();
    const q1 = percentile(s, 0.25);
    const med = percentile(s, 0.5);
    const q3 = percentile(s, 0.75);
    const iqr = q3 - q1;
    const loFence = q1 - 1.5 * iqr;
    const hiFence = q3 + 1.5 * iqr;
    let low = q1;
    let high = q3;
    const outliers = [];
    for (const v of s) {
      if (v < loFence || v > hiFence) outliers.push(v);
      else {
        if (v < low) low = v;
        if (v > high) high = v;
      }
    }
    boxes.push({ month: m + 1, label: MONTH_SHORT[m], low, q1, median: med, q3, high, outliers, n: s.length });
  });
  return {
    id: "monthly",
    kind: "box",
    title: withHeader(header, "Box and Whisker Plots for Demand vs Month"),
    xLabel: "Month",
    yLabel: `Demand (${demandType})`,
    unit: demandType,
    boxes,
  };
}

// ------------------------------------------------------------ HEAT MAPS (not in the Python tool)

// Year and week number as ISO 8601 counts them: weeks start on Monday and belong
// to the year holding their Thursday, so a week is never split across two years.
function weekLabel(monday) {
  const thursday = monday + 3 * MS_DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * MS_DAY)) + 1;
  return `${year}-${String(week).padStart(2, "0")}`;
}

// The values a day-of-week heat map cell can show; the user picks one in the app.
const WEEK_METRICS = {
  avg: { title: "Daily Average Demand", name: "Average" },
  peak: { title: "Daily Peak Demand", name: "Peak" },
  total: { title: "Daily Total Energy", name: "Total" },
};
export const weekMetricOptions = (demandType) => [
  { value: "avg", label: `Average ${demandType}` },
  { value: "peak", label: `Peak ${demandType}` },
  { value: "total", label: "Total kWh" },
];

export function selectWeekMetric(plot, metric) {
  return {
    ...plot,
    metric,
    metricName: WEEK_METRICS[metric].name,
    metricUnit: metric === "total" ? "kWh" : plot.unit,
    title: withHeader(plot.header, `${WEEK_METRICS[metric].title} by Week and Day of Week`),
  };
}

// One column per calendar week, one row per day of the week. Every week between
// the first and last day gets a column, so gaps in the data show as blank cells.
export function weekHeatmap(data, header = "", metric = "avg") {
  const { ts, kwh, power, demandType } = data;
  const byDay = new Map(); // day number -> { sum, n, peak, total }
  for (let i = 0; i < ts.length; i++) {
    const p = power[i];
    if (isNaN(p)) continue;
    const d = dayNumber(ts[i]);
    const b = byDay.get(d);
    if (b) {
      b.sum += p;
      b.n++;
      b.total += kwh[i];
      if (p > b.peak) b.peak = p;
    } else byDay.set(d, { sum: p, n: 1, peak: p, total: kwh[i] });
  }
  const dayNums = [...byDay.keys()].sort((a, b) => a - b);
  const firstMonday = dayNums.length ? dayNums[0] - dayOfWeek(dayNums[0] * MS_DAY) : 0;
  const weekCount = dayNums.length ? Math.floor((dayNums[dayNums.length - 1] - firstMonday) / 7) + 1 : 0;
  return selectWeekMetric(
    {
      id: "week-heatmap",
      kind: "weekHeatmap",
      header,
      xLabel: "Week",
      yLabel: "Day of Week",
      unit: demandType,
      weeks: Array.from({ length: weekCount }, (_, w) => weekLabel((firstMonday + w * 7) * MS_DAY)),
      cells: dayNums.map((d) => {
        const b = byDay.get(d);
        return {
          date: d * MS_DAY,
          week: Math.floor((d - firstMonday) / 7),
          day: (d - firstMonday) % 7,
          avg: b.sum / b.n,
          peak: b.peak,
          total: b.total,
        };
      }),
    },
    metric
  );
}

// One column per date, one row per interval of the day, with no averaging across
// intervals. The only cells that combine readings are those of the repeated hour
// when clocks fall back; the skipped hour in spring is left blank.
export function dayHeatmap(data, header = "") {
  const { ts, power, intervalMin, demandType } = data;
  let firstDay = Infinity;
  let lastDay = -Infinity;
  for (let i = 0; i < ts.length; i++) {
    const d = dayNumber(ts[i]);
    if (d < firstDay) firstDay = d;
    if (d > lastDay) lastDay = d;
  }
  const dayCount = ts.length ? lastDay - firstDay + 1 : 0;
  const rows = Math.ceil(1440 / intervalMin);
  const sum = new Float64Array(dayCount * rows);
  const count = new Uint16Array(dayCount * rows);
  for (let i = 0; i < ts.length; i++) {
    if (isNaN(power[i])) continue;
    const row = Math.min(rows - 1, Math.floor(minuteOfDay(ts[i]) / intervalMin));
    const at = (dayNumber(ts[i]) - firstDay) * rows + row;
    sum[at] += power[i];
    count[at]++;
  }
  const cells = [];
  let min = Infinity;
  let max = -Infinity;
  for (let at = 0; at < sum.length; at++) {
    if (!count[at]) continue;
    const v = sum[at] / count[at];
    if (v < min) min = v;
    if (v > max) max = v;
    cells.push([Math.floor(at / rows), at % rows, v]);
  }
  return {
    id: "day-heatmap",
    kind: "dayHeatmap",
    title: withHeader(header, "Demand by Time of Day and Date"),
    xLabel: "Date",
    yLabel: "Hour of Day",
    unit: demandType,
    dates: Array.from({ length: dayCount }, (_, i) => (firstDay + i) * MS_DAY),
    minutes: Array.from({ length: rows }, (_, r) => r * intervalMin),
    cells,
    min,
    max,
  };
}

// ------------------------------------------------------------ the standard set of plots

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const STANDARD_DAILY = [
  { id: "weekdays", daysToPlot: [0, 1, 2, 3, 4], monthsToPlot: ALL_MONTHS, titleTail: "for Mon-Fri throughout the Year" },
  { id: "weekends", daysToPlot: [5, 6], monthsToPlot: ALL_MONTHS, titleTail: "for Sat-Sun throughout the Year" },
  { id: "jul-aug", daysToPlot: ALL_DAYS, monthsToPlot: [7, 8], titleTail: "for days in July and August" },
  { id: "dec-jan", daysToPlot: ALL_DAYS, monthsToPlot: [12, 1], titleTail: "for days in December and January" },
];

// The eight visualizations the Python tool produces, in the same order, with the
// load distribution added after the histogram and the two heat maps after the annual plot.
export function standardPlots(data, { header = "", bins = 30 } = {}) {
  return [
    histogram(data, header, bins),
    loadDistribution(data, header),
    annualDemand(data, header),
    weekHeatmap(data, header),
    dayHeatmap(data, header),
    ...dailyDemandAnalysis(data, { daysToPlot: ALL_DAYS, averageDays: false, monthsToPlot: ALL_MONTHS, header, id: "day" }),
    ...STANDARD_DAILY.flatMap((d) => dailyDemandAnalysis(data, { ...d, averageDays: true, header })),
    monthlyBoxPlot(data, header),
  ];
}

// Title for a custom daily plot built in the UI (mirrors the Python title_tail wording).
export function describeSelection(daysToPlot, monthsToPlot) {
  const sortDays = [...daysToPlot].sort((a, b) => a - b);
  const contiguous = (arr) => arr.every((v, i) => i === 0 || v === arr[i - 1] + 1);
  const dayText =
    sortDays.length === 7
      ? "all days"
      : sortDays.length > 2 && contiguous(sortDays)
        ? `${DAY_SHORT[sortDays[0]]}-${DAY_SHORT[sortDays[sortDays.length - 1]]}`
        : sortDays.map((d) => DAY_SHORT[d]).join(", ");
  const monthText =
    monthsToPlot.length === 12
      ? "throughout the Year"
      : `in ${monthsToPlot.map((m) => MONTH_NAMES[m - 1]).join(", ").replace(/, ([^,]*)$/, " and $1")}`;
  return `for ${dayText} ${monthText}`;
}
