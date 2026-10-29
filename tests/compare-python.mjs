// Compares the JavaScript port with numbers captured from the Python tool.
// Usage: node tests/compare-python.mjs <py_out.json>, where the JSON comes from tests/python_capture.py.
import { readFileSync } from "node:fs";
import { parseCSV, detectLayout, buildMeters } from "../src/lib/smartImport.js";
import { combineMeters, summaryStats, standardPlots } from "../src/lib/demandAnalysis.js";

const py = JSON.parse(readFileSync(process.argv[2], "utf8"));
const table = { name: "sample.csv", rows: parseCSV(readFileSync(new URL("../sample-data/SmartMeterTexas_IntervalData_sample.csv", import.meta.url), "utf8")) };
const { meters } = buildMeters(table, detectLayout(table));
const data = combineMeters(meters, { demandType: "kW" });
const s = summaryStats(data);
const plots = standardPlots(data);
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

console.log("peak", s.peak, py.peak, "| avg", s.avg, py.avg, "| min nonzero", s.minNonzero, py.min, "| days", s.days);
console.log("histogram counts equal:", JSON.stringify(plots[0].bins.map((b) => b.count)) === JSON.stringify(py.hist));
const box = plots.at(-1).boxes.map((b) => b.median);
console.log("monthly medians max diff:", maxDiff(box, py.monthMedians));
const daily = plots.filter((p) => p.kind === "daily");
daily.forEach((p, i) => {
  const q = py.plots[i];
  const res = { title: p.title === q.title.trim(), n: p.avg.length === q.lines["Average Demand"][0].length };
  for (const [label, key] of [["Average Demand", "avg"], ["Peak Demand", "max"], ["Lowest Nonzero Demand", "min"]]) {
    res[key] = maxDiff(p[key].map((v) => v[1]), q.lines[label][1]).toExponential(1);
  }
  console.log(p.title.padEnd(72), JSON.stringify(res));
});
