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

// ------------------------------------------------------------ the standard set of plots

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const STANDARD_DAILY = [
  { id: "weekdays", daysToPlot: [0, 1, 2, 3, 4], monthsToPlot: ALL_MONTHS, titleTail: "for Mon-Fri throughout the Year" },
  { id: "weekends", daysToPlot: [5, 6], monthsToPlot: ALL_MONTHS, titleTail: "for Sat-Sun throughout the Year" },
  { id: "jul-aug", daysToPlot: ALL_DAYS, monthsToPlot: [7, 8], titleTail: "for days in July and August" },
  { id: "dec-jan", daysToPlot: ALL_DAYS, monthsToPlot: [12, 1], titleTail: "for days in December and January" },
];

// The eight visualizations the Python tool produces, in the same order.
export function standardPlots(data, { header = "", bins = 30 } = {}) {
  return [
    histogram(data, header, bins),
    annualDemand(data, header),
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
