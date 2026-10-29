// Run with `npm test`. Checks the importer and the analysis against the sample file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCSV, detectLayout, buildMeters, parseDateCell, parseTimeCell } from "../src/lib/smartImport.js";
import { combineMeters, summaryStats, standardPlots, validateInputs } from "../src/lib/demandAnalysis.js";

const SAMPLE = new URL("../sample-data/SmartMeterTexas_IntervalData_sample.csv", import.meta.url);

function loadSample() {
  const table = { name: "sample.csv", rows: parseCSV(readFileSync(SAMPLE, "utf8")) };
  const layout = detectLayout(table);
  return { table, layout, ...buildMeters(table, layout) };
}

test("detects the Smart Meter Texas format", () => {
  const { layout, meters, warnings } = loadSample();
  assert.equal(layout.format, "smt");
  assert.equal(meters.length, 1);
  assert.equal(meters[0].intervalMin, 15);
  assert.equal(meters[0].count, 35808); // 373 cleaned days × 96 intervals
  assert.equal(meters[0].estimated, 24);
  assert.equal(meters[0].duplicates, 0);
  assert.equal(meters[0].missing, 0);
  assert.deepEqual(warnings, []);
});

test("the downloadable template is read as Smart Meter Texas data once filled in", () => {
  const rows = parseCSV(readFileSync(new URL("../public/Wattson_Template.csv", import.meta.url), "utf8"));
  rows.slice(1).forEach((r, i) => (r[5] = String(i % 7)));
  const table = { name: "Wattson_Template.csv", rows };
  const layout = detectLayout(table);
  assert.equal(layout.format, "smt");
  const { meters } = buildMeters(table, layout);
  assert.equal(meters[0].count, 96);
  assert.equal(meters[0].intervalMin, 15);
  assert.equal(meters[0].missing, 0);
});

test("parses the cell formats the importer accepts", () => {
  assert.equal(parseDateCell("7/1/2025").ms, Date.UTC(2025, 6, 1));
  assert.equal(parseDateCell("2025-07-01 13:45").ms, Date.UTC(2025, 6, 1, 13, 45));
  assert.equal(parseDateCell(45839).ms, Date.UTC(2025, 6, 1)); // Excel serial
  assert.equal(parseTimeCell("23:45"), 1425);
  assert.equal(parseTimeCell("12:15 AM"), 15);
  assert.equal(parseTimeCell(0.989583333), 1425); // Excel day fraction
});

test("reads the Python tool's 3-column template", () => {
  const rows = [["Date", "Time", "Usage (kWh)"]];
  for (let d = 0; d < 3; d++) for (let i = 0; i < 96; i++) rows.push([45839 + d, i / 96, 10 + (i % 4)]);
  const table = { name: "template.xlsx", rows };
  const layout = detectLayout(table);
  assert.equal(layout.format, "template");
  const { meters } = buildMeters(table, layout);
  assert.equal(meters[0].count, 288);
  assert.equal(meters[0].missing, 0);
});

test("computes demand and the eight standard visualizations", () => {
  const { meters } = loadSample();
  assert.deepEqual(validateInputs({ meters, demandType: "kW", powerFactors: {} }), []);
  const data = combineMeters(meters, { demandType: "kW" });
  const s = summaryStats(data);
  const maxKwh = Math.max(...meters[0].kwh);
  assert.ok(Math.abs(s.peak - maxKwh * 4) < 1e-9);
  const plots = standardPlots(data);
  assert.equal(plots.length, 14); // histogram, annual, 7 weekdays, 4 averages, box plot
  assert.equal(plots[0].bins.reduce((a, b) => a + b.count, 0), data.power.length);
  const box = plots.at(-1);
  assert.equal(box.boxes.reduce((a, b) => a + b.n, 0), data.power.length);
});

test("kVA divides by the power factor and meters are summed by timestamp", () => {
  const { meters } = loadSample();
  const m2 = { ...meters[0], id: "copy", ts: meters[0].ts.slice(10) , kwh: meters[0].kwh.slice(10) };
  const pf = { [meters[0].id]: 0.8, copy: 0.8 };
  const data = combineMeters([meters[0], m2], { demandType: "kVA", powerFactors: pf });
  assert.equal(data.dropped, 10);
  assert.ok(Math.abs(data.power[0] - (2 * meters[0].kwh[10] * 4) / 0.8) < 1e-9);
});
