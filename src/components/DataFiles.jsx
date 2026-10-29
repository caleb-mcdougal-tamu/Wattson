import React from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, SlidersHorizontal, Trash2 } from "lucide-react";
import DriveIcon from "@/components/DriveIcon";
import { Input } from "@/components/ui/input";
import { FORMAT_LABELS } from "@/lib/smartImport";
import { formatDate } from "@/lib/charts";
import { cn } from "@/lib/utils";

function MeterRow({ meter, included, onToggle, showToggle, demandType, pf, onPf }) {
  const notes = [
    `${meter.intervalMin}-min`,
    `${meter.count.toLocaleString()} intervals`,
    meter.missing ? `${meter.missing.toLocaleString()} missing` : null,
    meter.estimated ? `${meter.estimated.toLocaleString()} estimated` : null,
  ].filter(Boolean);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-neutral-50 px-3 py-2", !included && "opacity-50")}>
      {showToggle && (
        <input type="checkbox" checked={included} onChange={onToggle} aria-label={`Include ${meter.name}`} className="h-4 w-4" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-800">{meter.name}</p>
        <p className="text-xs text-neutral-500">
          {formatDate(meter.start)} – {formatDate(meter.end)} · {notes.join(" · ")}
        </p>
      </div>
      {demandType === "kVA" && included && (
        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          Power factor
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="1"
            value={pf ?? ""}
            onChange={(e) => onPf(e.target.value)}
            placeholder="0.90"
            className="h-8 w-20 bg-white"
          />
        </label>
      )}
    </div>
  );
}

export default function DataFiles({ files, excluded, onToggleMeter, demandType, powerFactors, onPf, onColumns, onRemove, onSaveDrive, drive, savingKey }) {
  const meterCount = files.reduce((n, f) => n + (f.meters?.length || 0), 0);
  return (
    <ul className="space-y-3">
      {files.map((f) => (
        <li key={f.key} className="rounded-xl border border-neutral-200 p-3">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900">{f.name}</p>
              <p className="text-xs text-neutral-500">
                {f.loading ? "Reading…" : f.layout ? FORMAT_LABELS[f.layout.format] : "Couldn't read this file"}
                {f.source === "drive" && " · from Google Drive"}
              </p>
            </div>
            <div className="-mr-1 -mt-1 flex shrink-0 items-center">
              {f.loading && <Loader2 className="m-1.5 h-4 w-4 animate-spin text-neutral-400" />}
              {drive && f.source === "device" && f.meters && (
                <button
                  onClick={() => onSaveDrive(f)}
                  disabled={savingKey === f.key}
                  title="Save this data file to Google Drive"
                  className="rounded-md p-1.5 hover:bg-neutral-100 disabled:opacity-50"
                >
                  {savingKey === f.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <DriveIcon className="h-4 w-4" />}
                </button>
              )}
              {f.layout && (
                <button onClick={() => onColumns(f)} title="Choose columns" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => onRemove(f)} title="Remove" className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {f.error && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {f.error}
            </p>
          )}
          {f.warnings?.map((w) => (
            <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </p>
          ))}

          {f.meters?.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {f.meters.map((m) => (
                <MeterRow
                  key={m.id}
                  meter={m}
                  included={!excluded.has(m.id)}
                  showToggle={meterCount > 1}
                  onToggle={() => onToggleMeter(m.id)}
                  demandType={demandType}
                  pf={powerFactors[m.id]}
                  onPf={(v) => onPf(m.id, v)}
                />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
