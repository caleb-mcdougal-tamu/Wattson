// PNG, ZIP and PDF exports of the plots.
import { createZip } from "@/lib/zipWriter";
import { renderPng, hasData, formatDate, formatDateTime, fmt, EXPORT_SIZE } from "@/lib/charts";

const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

export const safeName = (s) =>
  String(s || "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Wattson";

export const fileSlug = (s) => safeName(s).replace(/ /g, "_");

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export const plotFileName = (plot, index) => `${String(index + 1).padStart(2, "0")}_${fileSlug(plot.title)}.png`;

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// [{ name, blob, plot }] for every plot that has data.
export async function renderAll(plots, onProgress) {
  const list = plots.filter(hasData);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    onProgress?.(i, list.length);
    out.push({ name: plotFileName(list[i], i), blob: await renderPng(list[i]), plot: list[i] });
    await yieldToUI();
  }
  onProgress?.(list.length, list.length);
  return out;
}

export function statsRows(stats, { demandType, meters }) {
  const u = demandType;
  return [
    ["Meters", meters.map((m) => m.name).join(", ")],
    ["Date range", `${formatDate(stats.start)} – ${formatDate(stats.end)} (${stats.days} days)`],
    ["Interval", `${stats.intervalMin} minutes (${stats.intervals.toLocaleString()} intervals)`],
    ["Peak demand", `${fmt(stats.peak)} ${u} on ${formatDateTime(stats.peakAt)}`],
    ["Average demand", `${fmt(stats.avg)} ${u}`],
    [
      "Lowest nonzero demand",
      stats.minNonzero === null ? "–" : `${fmt(stats.minNonzero)} ${u} on ${formatDateTime(stats.minNonzeroAt)}`,
    ],
    ["Zero-demand intervals", stats.zeros.toLocaleString()],
    ["Load factor", stats.loadFactor === null ? "–" : `${(stats.loadFactor * 100).toFixed(1)}%`],
    ["Total energy", `${fmt(stats.totalKwh, 0)} kWh`],
  ];
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export const statsCsv = (rows) => new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n"], { type: "text/csv" });

export async function buildZip(images, rows) {
  const entries = [];
  for (const img of images) entries.push({ path: img.name, data: new Uint8Array(await img.blob.arrayBuffer()) });
  entries.push({ path: "summary.csv", data: new Uint8Array(await statsCsv(rows).arrayBuffer()), deflate: true });
  return createZip(entries);
}

// PDF pages hold the plots as JPEGs: a fraction of the PNG size, still sharp when printed.
async function toJpegDataUrl(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.92);
}

// Landscape letter report: a summary page, then one plot per page.
export async function buildPdf(images, rows, { title, subtitle }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, M, 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(subtitle, M, 84);
  doc.setTextColor(20);

  let y = 124;
  doc.setFontSize(12);
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(k, M, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(v, W - M * 2 - 180);
    doc.text(lines, M + 180, y);
    y += 22 * lines.length;
  }

  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Plots", M, y + 16);
  doc.setTextColor(20);
  y += 34;
  images.forEach((img, i) => {
    if (y > H - M) return;
    doc.text(`${i + 2}. ${img.plot.title}`, M, y);
    y += 14;
  });

  const ratio = EXPORT_SIZE.height / EXPORT_SIZE.width;
  for (const img of images) {
    doc.addPage();
    const w = W - M * 2;
    const h = Math.min(w * ratio, H - M * 2);
    doc.addImage(await toJpegDataUrl(img.blob), "JPEG", (W - h / ratio) / 2, (H - h) / 2, h / ratio, h);
    await yieldToUI();
  }
  return doc.output("blob");
}
