// Turns the plot data from demandAnalysis.js into ECharts options, for the
// interactive charts in the app and for the PNGs that are downloaded or saved.
// Colors follow the Python tool's matplotlib plots.
import * as echarts from "echarts/core";
import { BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { DAY_SHORT, MONTH_SHORT, describeExceedance } from "@/lib/demandAnalysis";

echarts.use([BarChart, BoxplotChart, HeatmapChart, LineChart, ScatterChart, DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapContinuousComponent, CanvasRenderer]);

export { echarts };

export const COLORS = {
  demand: "#1f77b4", // matplotlib C0
  peak: "#d62728", // red
  avg: "#d4a106", // matplotlib's "y", darkened so it reads on white
  min: "#1f3fbf", // blue
  zero: "#2ca02c", // green
  distribution: "#7f7f7f", // gray
  day: "rgba(102, 102, 102, 0.3)", // 0.4 gray at alpha 0.3
  dailyAvg: "#111111",
  text: "#404040",
  grid: "#e5e5e5",
};

// matplotlib's plasma color map, sampled evenly, for the heat maps.
const PLASMA = ["#0d0887", "#46039f", "#7201a8", "#9c179e", "#bd3786", "#d8576b", "#ed7953", "#fb9f3a", "#fdca26", "#f0f921"];

export const EXPORT_SIZE = { width: 1400, height: 820 };

const fmt = (v, digits = 1) =>
  v === null || v === undefined || isNaN(v) ? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

const pad = (n) => String(n).padStart(2, "0");
export const formatDateTime = (ts) => {
  const d = new Date(ts);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const formatDate = (ts) => {
  const d = new Date(ts);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
};
const formatHour = (h) => {
  const mins = Math.round(h * 60);
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
};

const formatMinutes = (m) => `${pad(Math.floor(m / 60))}:${pad(Math.round(m % 60))}`;

export function hasData(plot) {
  if (plot.kind === "histogram") return plot.bins.some((b) => b.count);
  if (plot.kind === "annual" || plot.kind === "distribution") return plot.points.length > 0;
  if (plot.kind === "daily") return plot.avg.length > 0;
  if (plot.kind === "box") return plot.boxes.length > 0;
  if (plot.kind === "weekHeatmap" || plot.kind === "dayHeatmap") return plot.cells.length > 0;
  return false;
}

function axisName(name, exp, gap) {
  return {
    name,
    nameLocation: "middle",
    nameGap: gap,
    nameTextStyle: { color: COLORS.text, fontSize: exp ? 16 : 12 },
  };
}

function base(plot, exp) {
  const fs = exp ? 14 : 11;
  return {
    animation: !exp,
    useUTC: true,
    backgroundColor: "#ffffff",
    textStyle: { fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
    title: exp
      ? { text: plot.title, left: "center", top: 18, textStyle: { fontSize: 22, fontWeight: 600, color: "#171717" } }
      : undefined,
    legend: {
      bottom: exp ? 16 : 0,
      itemWidth: exp ? 28 : 18,
      textStyle: { fontSize: exp ? 15 : 11, color: COLORS.text },
    },
    grid: {
      left: exp ? 100 : 58,
      right: exp ? 60 : 16,
      top: exp ? 80 : 16,
      bottom: exp ? 120 : 92, // room for a two-row legend on phones
    },
    tooltip: { confine: true, textStyle: { fontSize: 12 } },
    _fs: fs,
  };
}

function axisStyle(fs) {
  return {
    axisLabel: { color: COLORS.text, fontSize: fs },
    axisLine: { lineStyle: { color: "#a3a3a3" } },
    splitLine: { lineStyle: { color: COLORS.grid } },
  };
}

function histogramOption(plot, exp) {
  const o = base(plot, exp);
  const decimals = plot.bins.length && plot.bins[0].to - plot.bins[0].from < 1 ? 2 : 0;
  return {
    ...o,
    legend: undefined,
    grid: { ...o.grid, bottom: exp ? 90 : 52 },
    tooltip: {
      ...o.tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: ([p]) => {
        const b = plot.bins[p.dataIndex];
        return `${fmt(b.from)}–${fmt(b.to)} ${plot.unit}<br/><b>${b.count.toLocaleString()}</b> intervals`;
      },
    },
    xAxis: {
      type: "category",
      data: plot.bins.map((b) => fmt((b.from + b.to) / 2, decimals)),
      ...axisStyle(o._fs),
      axisLabel: { ...axisStyle(o._fs).axisLabel, hideOverlap: true },
      ...axisName(plot.xLabel, exp, exp ? 50 : 32),
    },
    yAxis: { type: "value", ...axisStyle(o._fs), ...axisName(plot.yLabel, exp, exp ? 70 : 42) },
    series: [
      {
        type: "bar",
        name: "Count",
        data: plot.bins.map((b) => b.count),
        barCategoryGap: "4%",
        itemStyle: { color: COLORS.demand },
      },
    ],
  };
}

function distributionOption(plot, exp) {
  const o = base(plot, exp);
  const hours = (h) => h.toLocaleString(undefined, { maximumFractionDigits: h < 10 ? 2 : 0 });
  const grid = { ...o.grid, bottom: exp ? 90 : 52 };
  return {
    ...o,
    grid,
    legend: {
      top: grid.top + 8,
      right: grid.right + 8,
      selectedMode: false,
      itemWidth: exp ? 14 : 10,
      itemHeight: exp ? 14 : 10,
      backgroundColor: "#ffffff",
      borderColor: "#d4d4d4",
      borderWidth: 1,
      textStyle: { fontSize: exp ? 15 : 11, color: COLORS.text },
    },
    tooltip: {
      ...o.tooltip,
      // Any spot in the plot reads the nearest point, since the dots are small to aim at.
      trigger: "axis",
      axisPointer: { type: "line", snap: true },
      formatter: ([p]) => {
        const [, load, share] = p.value;
        return (
          `<div style="white-space:normal;max-width:260px"><b>${describeExceedance(load, share, plot.unit)}</b><br/>` +
          `That is ${hours(share * plot.totalHours)} of the ${hours(plot.totalHours)} hours in this data.</div>`
        );
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 1,
      interval: 0.2,
      ...axisStyle(o._fs),
      axisLabel: { ...axisStyle(o._fs).axisLabel, formatter: (v) => v.toFixed(1) },
      ...axisName(plot.xLabel, exp, exp ? 50 : 30),
    },
    yAxis: { type: "value", ...axisStyle(o._fs), ...axisName(plot.yLabel, exp, exp ? 70 : 42) },
    series: [
      {
        type: "scatter",
        name: plot.legend,
        data: plot.points,
        symbolSize: exp ? 6 : 4,
        itemStyle: { color: COLORS.distribution },
        emphasis: { disabled: true },
        clip: false, // keep the dots at 0 and 1 whole
        large: plot.points.length > 5000,
        // Exports are captured right after drawing, so they can't draw in stages.
        progressive: 0,
      },
    ],
  };
}

function refLine(name, value, color, [start, end], unit, exp) {
  return {
    type: "line",
    name,
    data: value === null ? [] : [[start, value], [end, value]],
    symbol: "none",
    lineStyle: { color, type: "dotted", width: exp ? 4 : 2.5 },
    itemStyle: { color },
    endLabel: { show: true, formatter: () => `${fmt(value)} ${unit}`, color, fontSize: exp ? 15 : 10, fontWeight: 600 },
    tooltip: { show: false },
    z: 3,
  };
}

function annualOption(plot, exp) {
  const o = base(plot, exp);
  const span = [plot.points[0][0], plot.points[plot.points.length - 1][0]];
  return {
    ...o,
    grid: { ...o.grid, right: exp ? 150 : 70, bottom: exp ? 120 : 100 },
    legend: { ...o.legend, bottom: exp ? 16 : 34 },
    tooltip: {
      ...o.tooltip,
      trigger: "axis",
      formatter: (items) => {
        const p = items.find((i) => i.seriesName === "Demand") || items[0];
        return `${formatDateTime(p.value[0])}<br/><b>${fmt(p.value[1])} ${plot.unit}</b>`;
      },
    },
    dataZoom: exp
      ? undefined
      : [
          // Zoom with the slider or Ctrl + wheel; plain wheel and drag keep scrolling the page.
          { type: "inside", filterMode: "none", zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false, moveOnMouseMove: false, preventDefaultMouseMove: false },
          { type: "slider", height: 18, bottom: 6, filterMode: "none", labelFormatter: (v) => formatDate(v) },
        ],
    xAxis: {
      type: "time",
      min: span[0],
      max: span[1],
      ...axisStyle(o._fs),
      axisLabel: { ...axisStyle(o._fs).axisLabel, hideOverlap: true, formatter: { month: "{MMM} {yyyy}", year: "{yyyy}", day: "{M}/{d}" } },
      splitLine: { show: false },
      // On screen the dates speak for themselves and the space goes to the zoom slider.
      ...(exp ? axisName(plot.xLabel, exp, 50) : {}),
    },
    yAxis: { type: "value", ...axisStyle(o._fs), ...axisName(plot.yLabel, exp, exp ? 70 : 42) },
    series: [
      {
        type: "line",
        name: "Demand",
        data: plot.points,
        // Every interval is drawn, as in the Python tool: no downsampling.
        symbol: "none",
        lineStyle: { color: COLORS.demand, width: exp ? 1.2 : 1 },
        itemStyle: { color: COLORS.demand },
      },
      refLine("Peak Demand", plot.peak, COLORS.peak, span, plot.unit, exp),
      refLine("Average Demand", plot.avg, COLORS.avg, span, plot.unit, exp),
      refLine("Lowest Nonzero Demand", plot.minNonzero, COLORS.min, span, plot.unit, exp),
      ...(plot.zeros.length
        ? [
            {
              type: "scatter",
              name: "Zero Demand",
              data: plot.zeros,
              symbolSize: exp ? 12 : 8,
              itemStyle: { color: COLORS.zero },
              z: 4,
            },
          ]
        : []),
    ],
  };
}

function dailyOption(plot, exp) {
  const o = base(plot, exp);
  // Every day shares one name, so the legend shows a single "Individual Days" entry.
  const days = plot.days.map((d) => ({
    type: "line",
    name: "Individual Days",
    data: d.points,
    symbol: "none",
    silent: true,
    lineStyle: { color: COLORS.day, width: 1 },
    itemStyle: { color: "#9a9a9a" },
    emphasis: { disabled: true },
    tooltip: { show: false },
    z: 1,
  }));
  const profile = (name, data, color, width, dotted) => ({
    type: "line",
    name,
    data,
    symbol: "none",
    lineStyle: { color, width, type: dotted ? "dotted" : "solid" },
    itemStyle: { color },
    z: 3,
  });
  return {
    ...o,
    tooltip: {
      ...o.tooltip,
      trigger: "axis",
      formatter: (items) => {
        const rows = items.filter((i) => i.seriesName !== "Individual Days");
        if (!rows.length) return "";
        return (
          `${formatHour(rows[0].value[0])}<br/>` +
          rows.map((r) => `${r.marker}${r.seriesName}: <b>${fmt(r.value[1])} ${plot.unit}</b>`).join("<br/>")
        );
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 24,
      interval: exp ? 2 : 4,
      ...axisStyle(o._fs),
      ...axisName(plot.xLabel, exp, exp ? 50 : 30),
    },
    yAxis: { type: "value", ...axisStyle(o._fs), ...axisName(plot.yLabel, exp, exp ? 70 : 42) },
    series: [
      ...days,
      profile("Average Demand", plot.avg, COLORS.dailyAvg, exp ? 6 : 3.5),
      profile("Peak Demand", plot.max, COLORS.peak, exp ? 4 : 2.5, true),
      profile("Lowest Nonzero Demand", plot.min, COLORS.min, exp ? 4 : 2.5, true),
    ],
  };
}

function boxOption(plot, exp) {
  const o = base(plot, exp);
  const outliers = plot.boxes.flatMap((b, i) => b.outliers.map((v) => [i, v]));
  return {
    ...o,
    tooltip: {
      ...o.tooltip,
      trigger: "item",
      formatter: (p) => {
        if (p.seriesType === "scatter") return `${plot.boxes[p.value[0]].label}: ${fmt(p.value[1])} ${plot.unit}`;
        const b = plot.boxes[p.dataIndex];
        return [
          `<b>${b.label}</b> (${b.n.toLocaleString()} intervals)`,
          `Upper whisker: ${fmt(b.high)}`,
          `Q3: ${fmt(b.q3)}`,
          `Median: ${fmt(b.median)}`,
          `Q1: ${fmt(b.q1)}`,
          `Lower whisker: ${fmt(b.low)}`,
          `Outliers: ${b.outliers.length.toLocaleString()}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: plot.boxes.map((b) => b.label),
      ...axisStyle(o._fs),
      axisLabel: { ...axisStyle(o._fs).axisLabel, interval: 0, fontSize: exp ? o._fs : 9 },
      splitLine: { show: false },
      ...axisName(plot.xLabel, exp, exp ? 50 : 30),
    },
    yAxis: { type: "value", ...axisStyle(o._fs), ...axisName(plot.yLabel, exp, exp ? 70 : 42) },
    series: [
      {
        type: "boxplot",
        name: "Demand",
        data: plot.boxes.map((b) => [b.low, b.q1, b.median, b.q3, b.high]),
        itemStyle: { color: "#ffffff", borderColor: "#171717", borderWidth: exp ? 2 : 1.2 },
        emphasis: { itemStyle: { borderColor: COLORS.demand } },
        boxWidth: ["30%", "60%"],
      },
      {
        type: "scatter",
        name: "Outliers",
        data: outliers,
        symbol: "emptyCircle",
        symbolSize: exp ? 6 : 4,
        itemStyle: { color: "#525252", opacity: 0.6 },
        large: outliers.length > 2000,
      },
    ],
  };
}

// The color scale runs from zero to the largest value, as in a report figure.
function colorBar(values, unit, exp) {
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return {
    type: "continuous",
    min: lo,
    max: hi > lo ? hi : lo + 1,
    dimension: 2,
    seriesIndex: 0,
    calculable: false,
    hoverLink: false,
    inRange: { color: PLASMA },
    right: exp ? 26 : 8,
    top: exp ? 80 : 12,
    itemWidth: exp ? 22 : 12,
    itemHeight: exp ? 520 : 200,
    text: [`${fmt(hi, 0)} ${unit}`, fmt(lo, 0)],
    textGap: 6,
    textStyle: { color: COLORS.text, fontSize: exp ? 14 : 10 },
  };
}

function weekHeatmapOption(plot, exp) {
  const o = base(plot, exp);
  const { metric } = plot;
  const data = plot.cells.map((c) => [c.week, c.day, c[metric]]);
  return {
    ...o,
    legend: undefined,
    grid: { left: exp ? 100 : 58, right: exp ? 130 : 76, top: exp ? 80 : 16, bottom: exp ? 110 : 76 },
    tooltip: {
      ...o.tooltip,
      trigger: "item",
      formatter: (p) => {
        const c = plot.cells[p.dataIndex];
        return (
          `${DAY_SHORT[c.day]} ${formatDate(c.date)} (week ${plot.weeks[c.week]})<br/>` +
          `<b>${plot.metricName}: ${fmt(c[metric])} ${plot.metricUnit}</b>`
        );
      },
    },
    visualMap: colorBar(data.map((c) => c[2]), plot.metricUnit, exp),
    xAxis: {
      type: "category",
      data: plot.weeks,
      axisLabel: { color: COLORS.text, fontSize: exp ? 12 : 10, rotate: 90, interval: exp && plot.weeks.length <= 60 ? 0 : "auto" },
      axisLine: { lineStyle: { color: "#a3a3a3" } },
      axisTick: { show: false },
      ...axisName(plot.xLabel, exp, exp ? 72 : 54),
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: DAY_SHORT,
      axisLabel: { color: COLORS.text, fontSize: o._fs },
      axisLine: { lineStyle: { color: "#a3a3a3" } },
      axisTick: { show: false },
      ...axisName(plot.yLabel, exp, exp ? 70 : 42),
    },
    series: [
      {
        type: "heatmap",
        data,
        // Exports are captured right after drawing, so they can't draw in stages.
        progressive: 0,
        itemStyle: { borderColor: "#ffffff", borderWidth: plot.weeks.length > 120 ? 0 : exp ? 1 : 0.5 },
        emphasis: { itemStyle: { borderColor: "#171717", borderWidth: 1 } },
      },
    ],
  };
}

function dayHeatmapOption(plot, exp) {
  const o = base(plot, exp);
  const step = exp ? 60 : 120; // label every hour in reports, every other hour on screen
  const timeLabels = plot.minutes.map(formatMinutes);
  // Redrawing tens of thousands of cells per slider move is too slow on phones and
  // for multi-year files, so those redraw when the slider is released instead.
  const redrawWhileDragging = !exp && plot.cells.length <= 40000 && window.matchMedia("(pointer: fine)").matches;
  return {
    ...o,
    legend: undefined,
    grid: { left: exp ? 100 : 58, right: exp ? 130 : 76, top: exp ? 80 : 16, bottom: exp ? 90 : 62 },
    tooltip: {
      ...o.tooltip,
      trigger: "item",
      formatter: (p) => {
        const [day, row, v] = p.value;
        return `${formatDate(plot.dates[day])} ${timeLabels[row]}<br/><b>${fmt(v)} ${plot.unit}</b>`;
      },
    },
    visualMap: colorBar([plot.min, plot.max], plot.unit, exp),
    dataZoom: exp
      ? undefined
      : [
          // Same gestures as the annual chart: slider or Ctrl + wheel, and plain wheel and drag keep scrolling the page.
          { type: "inside", xAxisIndex: 0, zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false, moveOnMouseMove: false, preventDefaultMouseMove: false },
          { type: "slider", xAxisIndex: 0, height: 18, bottom: 6, left: 58, right: 76, showDataShadow: false, realtime: redrawWhileDragging, labelFormatter: (_, label) => label },
        ],
    xAxis: {
      type: "category",
      data: plot.dates.map(formatDate),
      axisLabel: { color: COLORS.text, fontSize: o._fs, hideOverlap: true },
      axisLine: { lineStyle: { color: "#a3a3a3" } },
      axisTick: { show: false },
      // On screen the dates speak for themselves and the space goes to the zoom slider.
      ...(exp ? axisName(plot.xLabel, exp, 50) : {}),
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: timeLabels,
      axisLabel: {
        color: COLORS.text,
        fontSize: exp ? 13 : 10,
        interval: (i) => plot.minutes[i] % step === 0,
        formatter: (label) => String(Number(label.split(":")[0])),
      },
      axisLine: { lineStyle: { color: "#a3a3a3" } },
      axisTick: { show: false },
      ...axisName(plot.yLabel, exp, exp ? 60 : 34),
    },
    series: [
      {
        type: "heatmap",
        data: plot.cells,
        progressive: 0,
        emphasis: { disabled: true },
      },
    ],
  };
}

export function buildOption(plot, { exportMode = false } = {}) {
  const build = { histogram: histogramOption, distribution: distributionOption, annual: annualOption, weekHeatmap: weekHeatmapOption, dayHeatmap: dayHeatmapOption, daily: dailyOption, box: boxOption }[plot.kind];
  const option = build(plot, exportMode);
  delete option._fs;
  return option;
}

// Renders a plot off-screen at a fixed report size and returns a PNG blob.
export async function renderPng(plot, { width = EXPORT_SIZE.width, height = EXPORT_SIZE.height, pixelRatio = 1.5 } = {}) {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(el);
  const chart = echarts.init(el, null, { renderer: "canvas", width, height, devicePixelRatio: pixelRatio });
  try {
    chart.setOption(buildOption(plot, { exportMode: true }));
    const url = chart.getDataURL({ type: "png", pixelRatio, backgroundColor: "#ffffff" });
    return await (await fetch(url)).blob();
  } finally {
    chart.dispose();
    el.remove();
  }
}

export { DAY_SHORT, MONTH_SHORT, fmt };
