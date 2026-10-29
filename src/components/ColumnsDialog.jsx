import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/Section";
import { buildMeters, FORMAT_LABELS } from "@/lib/smartImport";

const PREVIEW_ROWS = 6;

const show = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "");
  return String(v);
};

// Lets the user check or change which columns hold the date, time and usage.
export default function ColumnsDialog({ file, open, onClose, onApply }) {
  const [layout, setLayout] = useState(file?.layout);
  const [interval, setIntervalText] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !file) return;
    setLayout(file.layout);
    setIntervalText(file.intervalOverride ? String(file.intervalOverride) : "");
    setError(null);
  }, [open, file]);

  const preview = useMemo(() => {
    if (!file || !layout) return [];
    return file.table.rows.slice(layout.headerRow + 1, layout.headerRow + 1 + PREVIEW_ROWS);
  }, [file, layout]);

  if (!file || !layout) return null;
  const set = (patch) => setLayout((l) => ({ ...l, ...patch, format: "custom" }));
  const columnOptions = layout.headers.map((h, i) => (
    <option key={i} value={i}>
      {h}
    </option>
  ));

  const apply = () => {
    const intervalOverride = Number(interval) > 0 ? Number(interval) : undefined;
    try {
      const result = buildMeters(file.table, layout, { intervalOverride });
      onApply({ layout, intervalOverride, ...result });
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleValueCol = (i) =>
    set({ valueCols: layout.valueCols.includes(i) ? layout.valueCols.filter((c) => c !== i) : [...layout.valueCols, i].sort((a, b) => a - b) });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Columns in {file.name}</DialogTitle>
          <DialogDescription>
            Detected as <b>{FORMAT_LABELS[file.layout.format]}</b>. Change anything that looks wrong.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                {layout.headers.map((h, i) => (
                  <th
                    key={i}
                    className={`border-b border-neutral-200 px-2 py-1.5 text-left font-medium ${
                      i === layout.dateCol || i === layout.timeCol || layout.valueCols.includes(i)
                        ? "bg-amber-50 text-neutral-900"
                        : "text-neutral-500"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((r, ri) => (
                <tr key={ri}>
                  {layout.headers.map((_, i) => (
                    <td key={i} className="whitespace-nowrap border-b border-neutral-100 px-2 py-1 text-neutral-700">
                      {show(r[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date (or date and time)">
            <select className={selectClass} value={layout.dateCol} onChange={(e) => set({ dateCol: +e.target.value })}>
              <option value={-1}>Choose…</option>
              {columnOptions}
            </select>
          </Field>
          <Field label="Interval start time">
            <select className={selectClass} value={layout.timeCol} onChange={(e) => set({ timeCol: +e.target.value })}>
              <option value={-1}>None (the date column includes the time)</option>
              {columnOptions}
            </select>
          </Field>
          <Field label="Values are">
            <select className={selectClass} value={layout.valueKind} onChange={(e) => set({ valueKind: e.target.value })}>
              <option value="kwh">Energy per interval (kWh)</option>
              <option value="kw">Demand (kW)</option>
            </select>
          </Field>
          <Field label="Meter ID column" hint="Rows are split into one meter per ID.">
            <select className={selectClass} value={layout.meterCol} onChange={(e) => set({ meterCol: +e.target.value })}>
              <option value={-1}>None</option>
              {columnOptions}
            </select>
          </Field>
          <Field label="Header row" hint="Row number of the column names (0 = no header).">
            <Input
              type="number"
              min={0}
              value={layout.headerRow + 1}
              onChange={(e) => {
                const headerRow = Math.max(0, Number(e.target.value) || 0) - 1;
                const headers = layout.headers.map((h, i) =>
                  headerRow >= 0 && file.table.rows[headerRow]?.[i] != null ? String(file.table.rows[headerRow][i]) : `Column ${i + 1}`
                );
                set({ headerRow, headers });
              }}
            />
          </Field>
          <Field label="Interval (minutes)" hint={`Leave blank to detect it (found ${file.meters?.[0]?.intervalMin ?? "–"}).`}>
            <Input type="number" min={1} inputMode="numeric" placeholder="Auto" value={interval} onChange={(e) => setIntervalText(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
            <input type="checkbox" checked={layout.dayFirst} onChange={(e) => set({ dayFirst: e.target.checked })} />
            Dates are day first (31/12/2025)
          </label>
        </div>

        <Field label="Usage columns" hint="Pick more than one if each column is a different meter.">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {layout.headers.map((h, i) =>
              i === layout.dateCol || i === layout.timeCol || i === layout.meterCol ? null : (
                <label key={i} className="flex items-center gap-1.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={layout.valueCols.includes(i)} onChange={() => toggleValueCol(i)} />
                  {h}
                </label>
              )
            )}
          </div>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
