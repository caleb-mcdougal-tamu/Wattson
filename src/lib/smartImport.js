// Smart import for interval data files (.csv, .xlsx, .xls).
//
// Replaces the "FILE READING AND FORMATTING VALIDATION" section of the Python
// tool, which required a hand-edited 3-column Excel file. Formats are tried in
// this order:
//   1. Smart Meter Texas interval CSV (ESIID, USAGE_DATE, USAGE_START_TIME, USAGE_KWH, ...)
//   2. The Python tool's template (Date, Time as a 0-1 day fraction, kWh)
//   3. Anything else: date/time/value columns are guessed and can be changed in the UI
//
// Timestamps are "wall clock" times stored as UTC milliseconds (Date.UTC), so
// the browser's own time zone and daylight saving rules never shift them.

const MS_MIN = 60 * 1000;
const MS_DAY = 24 * 60 * MS_MIN;
const SAMPLE_ROWS = 300;

export const FORMAT_LABELS = {
  smt: "Smart Meter Texas",
  template: "Python tool template",
  custom: "Custom columns",
};

// ---------------------------------------------------------------- reading files

export async function readTable(file) {
  const name = file.name || "data";
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
      if (rows.some((r) => r.some((c) => c !== null && c !== ""))) return { name, sheet: sheetName, rows };
    }
    throw new Error(`${name} has no data in any sheet.`);
  }
  return { name, rows: parseCSV(await file.text()) };
}

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const delim = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best
  , ",");

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------- cell parsing

const clean = (v) => (typeof v === "string" ? v.trim().replace(/^'/, "").trim() : v);
const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function parseNumber(v) {
  v = clean(v);
  if (typeof v === "number") return v;
  if (isBlank(v)) return NaN;
  const s = String(v).replace(/,/g, "");
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ? Number(s) : NaN;
}

// Excel serial date (days since 1899-12-30), rounded to the minute.
const fromExcelSerial = (n) => Math.round(((n - 25569) * MS_DAY) / MS_MIN) * MS_MIN;

const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp][Mm])?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const US_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp][Mm])?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp][Mm])?$/;

function hour12(h, ampm) {
  if (!ampm) return h;
  const pm = /p/i.test(ampm);
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

// Returns { ms, hasTime } or null. dayFirst switches 1/2/2025 to 1 Feb.
export function parseDateCell(v, dayFirst = false) {
  v = clean(v);
  if (isBlank(v)) return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    const ms = Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes());
    return { ms, hasTime: v.getHours() !== 0 || v.getMinutes() !== 0 };
  }
  if (typeof v === "number") {
    if (v < 1 || v > 100000) return null;
    const ms = fromExcelSerial(v);
    return { ms, hasTime: ms % MS_DAY !== 0 };
  }
  const s = String(v);
  let m = s.match(ISO_RE);
  let y, mo, d;
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = s.match(US_RE))) {
    [mo, d, y] = dayFirst ? [+m[2], +m[1], +m[3]] : [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
  } else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const hasTime = m[4] !== undefined;
  const h = hasTime ? hour12(+m[4], m[7]) : 0;
  const mi = hasTime ? +m[5] : 0;
  return { ms: Date.UTC(y, mo - 1, d, h, mi), hasTime };
}

// Minutes after midnight, or NaN. Accepts "0:15", "12:15 AM", Excel's 0-1 day fraction.
export function parseTimeCell(v) {
  v = clean(v);
  if (isBlank(v)) return NaN;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === "number") return v >= 0 && v <= 1 ? Math.round(v * 1440) : NaN;
  const s = String(v);
  const m = s.match(TIME_RE);
  if (m) {
    const h = hour12(+m[1], m[4]);
    const min = +m[2];
    return h <= 24 && min < 60 ? h * 60 + min : NaN;
  }
  const n = parseNumber(s);
  return n >= 0 && n <= 1 ? Math.round(n * 1440) : NaN;
}

// ---------------------------------------------------------------- layout detection

const norm = (h) => String(h ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const colLetter = (i) => (i >= 26 ? colLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

function looksLikeHeader(row) {
  const cells = row.filter((c) => !isBlank(c));
  if (cells.length < 2) return false;
  const texty = cells.filter((c) => typeof c === "string" && isNaN(parseNumber(c)) && !parseDateCell(c) && isNaN(parseTimeCell(c)));
  return texty.length >= Math.ceil(cells.length / 2);
}

function classifyColumn(values, dayFirst) {
  const vals = values.filter((v) => !isBlank(v));
  if (!vals.length) return { type: "empty" };
  const share = (fn) => vals.filter(fn).length / vals.length;
  const dates = vals.map((v) => parseDateCell(v, dayFirst));
  const nums = vals.map(parseNumber);
  const isNumeric = share((_, i) => !isNaN(nums[i])) > 0.9;
  const timeStrings = share((v) => typeof v === "string" && TIME_RE.test(clean(v))) > 0.9;
  // Excel times are day fractions that land on whole minutes (0.0104 = 0:15).
  const fractions =
    isNumeric && nums.every((n) => isNaN(n) || (n >= 0 && n < 1 && Math.abs(n * 1440 - Math.round(n * 1440)) < 0.01));
  if (timeStrings || (fractions && new Set(nums).size > 1)) return { type: "time" };
  const allDates = dates.every(Boolean);
  // Excel date serials are numeric too; accept them only when they look like 1990-2100.
  if (allDates && (!isNumeric || nums.every((n) => n > 32874 && n < 73051))) {
    return { type: dates.some((d) => d.hasTime) ? "datetime" : "date" };
  }
  if (isNumeric) return { type: "number" };
  return { type: "text", unique: new Set(vals.map(clean)).size };
}

function guessDayFirst(rows, start) {
  for (let r = start; r < Math.min(rows.length, start + 2000); r++) {
    for (const c of rows[r]) {
      const m = typeof c === "string" && clean(c).match(US_RE);
      if (m && +m[1] > 12) return true;
      if (m && +m[2] > 12) return false;
    }
  }
  return false;
}

// Works out which columns hold what. Returns a mapping the UI can edit.
export function detectLayout(table) {
  const { rows } = table;
  let headerRow = rows.slice(0, 30).findIndex(looksLikeHeader);
  const dataStart = headerRow + 1;
  const width = Math.max(...rows.slice(0, dataStart + 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) =>
    headerRow >= 0 && !isBlank(rows[headerRow][i]) ? String(rows[headerRow][i]).trim() : `Column ${colLetter(i)}`
  );
  const dayFirst = guessDayFirst(rows, dataStart);
  const sample = rows.slice(dataStart, dataStart + SAMPLE_ROWS);
  const types = headers.map((_, i) => classifyColumn(sample.map((r) => r[i]), dayFirst));
  const H = headers.map(norm);
  const find = (...names) => H.findIndex((h) => names.includes(h));

  const base = { headerRow, headers, types, dayFirst, meterCol: -1, flowCol: -1, estCol: -1 };

  // 1. Smart Meter Texas
  const smtDate = find("USAGEDATE");
  const smtKwh = find("USAGEKWH");
  if (smtDate >= 0 && smtKwh >= 0) {
    const smtStart = find("USAGESTARTTIME");
    if (smtStart < 0) {
      throw new Error(
        "This looks like a Smart Meter Texas daily or monthly report. Download the 15-minute interval report instead."
      );
    }
    return {
      ...base,
      format: "smt",
      dateCol: smtDate,
      timeCol: smtStart,
      valueCols: [smtKwh],
      valueKind: "kwh",
      meterCol: find("ESIID"),
      flowCol: find("CONSUMPTIONSURPLUSGENERATION"),
      estCol: find("ESTIMATEDACTUAL"),
    };
  }

  // 2. The Python tool's template: Date | Time (0-1 fraction) | kWh [| more meters]
  if (
    width >= 3 &&
    (types[0].type === "date" || types[0].type === "datetime") &&
    types[1].type === "time" &&
    types[2].type === "number"
  ) {
    const extra = types.map((t, i) => (i >= 2 && t.type === "number" ? i : -1)).filter((i) => i >= 0);
    return { ...base, format: "template", dateCol: 0, timeCol: 1, valueCols: extra, valueKind: "kwh" };
  }

  // 3. Guess
  const idx = (pred) => types.findIndex((t, i) => pred(t, H[i]));
  let dateCol = idx((t) => t.type === "datetime");
  let timeCol = -1;
  if (dateCol < 0) {
    dateCol = idx((t) => t.type === "date");
    const times = types.map((t, i) => (t.type === "time" ? i : -1)).filter((i) => i >= 0);
    timeCol = times.find((i) => /START|BEGIN|FROM/.test(H[i])) ?? times[0] ?? -1;
  }
  const problem = dateCol < 0 ? `Couldn't find a date column in ${table.name}. Choose the columns.` : null;

  const numeric = types.map((t, i) => (t.type === "number" && i !== dateCol && i !== timeCol ? i : -1)).filter((i) => i >= 0);
  const kwhCols = numeric.filter((i) => /KWH|USAGE|CONSUMPTION|ENERGY/.test(H[i]));
  const kwCols = numeric.filter((i) => /KW|KVA|DEMAND|POWER|LOAD/.test(H[i]) && !kwhCols.includes(i));
  const valueCols = kwhCols.length ? kwhCols : kwCols.length ? kwCols : numeric.slice(0, 1);
  const valueKind = !kwhCols.length && kwCols.length ? "kw" : "kwh";
  const meterCol = idx((t, h) => t.type === "text" && t.unique > 1 && t.unique <= 50 && /METER|ESIID|ACCOUNT|PREMISE|SITE/.test(h));

  return { ...base, format: "custom", dateCol, timeCol, valueCols, valueKind, meterCol, problem };
}

// ---------------------------------------------------------------- building meters

export function median(arr) {
  if (!arr.length) return NaN;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectInterval(ts) {
  const diffs = [];
  for (let i = 1; i < ts.length && diffs.length < 5000; i++) {
    const d = (ts[i] - ts[i - 1]) / MS_MIN;
    if (d > 0) diffs.push(d);
  }
  return Math.round(median(diffs)) || 15;
}

// Applies a layout to a table and returns one meter per (meter id × value column).
export function buildMeters(table, layout, { intervalOverride } = {}) {
  const { rows } = table;
  const { dateCol, timeCol, valueCols, valueKind, meterCol, flowCol, estCol, dayFirst, headers } = layout;
  if (dateCol < 0 || !valueCols?.length) throw new Error("Choose a date column and at least one value column.");

  const groups = new Map();
  let badRows = 0;
  let blankValues = 0;
  let generationRows = 0;

  for (let r = layout.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(isBlank)) continue;
    if (flowCol >= 0 && /SURPLUS|GENERAT/i.test(String(row[flowCol] ?? ""))) {
      generationRows++;
      continue;
    }
    const d = parseDateCell(row[dateCol], dayFirst);
    let ms = d?.ms;
    if (d && timeCol >= 0 && timeCol !== dateCol) {
      const min = parseTimeCell(row[timeCol]);
      ms = isNaN(min) ? NaN : Math.floor(d.ms / MS_DAY) * MS_DAY + min * MS_MIN;
    }
    if (ms === undefined || isNaN(ms)) {
      badRows++;
      continue;
    }
    const meterId = meterCol >= 0 ? String(clean(row[meterCol]) ?? "") : "";
    const estimated = estCol >= 0 && /^E/i.test(String(clean(row[estCol]) ?? ""));
    for (const c of valueCols) {
      // Blank usage is a missing interval, e.g. the hour Smart Meter Texas leaves
      // empty when clocks spring forward.
      if (isBlank(row[c])) {
        blankValues++;
        continue;
      }
      const val = parseNumber(row[c]);
      if (isNaN(val)) {
        badRows++;
        continue;
      }
      const key = `${meterId}\u0000${c}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { meterId, col: c, ts: [], val: [], estimated: 0 }));
      g.ts.push(ms);
      g.val.push(val);
      if (estimated) g.estimated++;
    }
  }

  if (!groups.size) throw new Error(`No readable rows in ${table.name}. Check the column choices.`);

  const baseName = table.name.replace(/\.[^.]+$/, "");
  const meters = [...groups.values()].map((g) => {
    // Stable sort by time (keeps the two copies of the repeated hour when clocks fall back).
    const order = g.ts.map((_, i) => i).sort((a, b) => g.ts[a] - g.ts[b] || a - b);
    const ts = order.map((i) => g.ts[i]);
    const raw = order.map((i) => g.val[i]);
    const intervalMin = intervalOverride || detectInterval(ts);
    const kwh = valueKind === "kw" ? raw.map((v) => (v * intervalMin) / 60) : raw;
    const unique = new Set(ts).size;
    const expected = Math.round((ts[ts.length - 1] - ts[0]) / (intervalMin * MS_MIN)) + 1;

    let name;
    if (layout.format === "smt") name = g.meterId ? `ESIID ${g.meterId}` : baseName;
    else if (valueCols.length > 1) name = `${baseName} – ${headers[g.col]}`;
    else name = g.meterId ? `${baseName} – ${g.meterId}` : baseName;

    return {
      id: `${table.name}|${g.meterId}|${g.col}`,
      name,
      fileName: table.name,
      meterId: g.meterId,
      ts,
      kwh,
      intervalMin,
      start: ts[0],
      end: ts[ts.length - 1],
      count: ts.length,
      missing: Math.max(0, expected - unique),
      duplicates: ts.length - unique,
      estimated: g.estimated,
    };
  });

  const warnings = [];
  if (badRows) warnings.push(`${badRows.toLocaleString()} rows skipped (unreadable date, time or value).`);
  if (blankValues) warnings.push(`${blankValues.toLocaleString()} intervals with no reading skipped (for example the hour skipped when clocks spring forward).`);
  if (generationRows) warnings.push(`${generationRows.toLocaleString()} surplus generation rows excluded.`);
  return { meters, warnings };
}

// Reads a file and builds its meters in one step.
export async function importFile(file, layoutOverride) {
  const table = await readTable(file);
  const layout = layoutOverride || detectLayout(table);
  const { meters, warnings } = buildMeters(table, layout);
  return { table, layout, meters, warnings };
}
