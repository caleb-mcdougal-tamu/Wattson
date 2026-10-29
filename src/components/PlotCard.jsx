import React from "react";
import { Download, Loader2, X } from "lucide-react";
import Chart from "@/components/Chart";
import DriveIcon from "@/components/DriveIcon";
import { Button } from "@/components/ui/button";
import { hasData } from "@/lib/charts";

export default function PlotCard({ plot, number, onDownload, onSaveDrive, onRemove, busy, drive }) {
  const empty = !hasData(plot);
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-start gap-2 px-4 pt-4">
        <span className="mt-0.5 grid h-5 min-w-5 place-items-center rounded bg-neutral-100 px-1 text-[11px] font-semibold text-neutral-500">
          {number}
        </span>
        <h3 className="flex-1 text-sm font-semibold leading-snug text-neutral-900">{plot.title}</h3>
        {onRemove && (
          <button onClick={onRemove} aria-label="Remove plot" className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      {empty ? (
        <p className="mx-4 my-4 rounded-xl bg-neutral-50 py-10 text-center text-sm text-neutral-400">
          No data for these days and months.
        </p>
      ) : (
        <Chart plot={plot} className={plot.kind === "annual" ? "h-[340px] sm:h-[400px] px-1" : "h-[300px] sm:h-[360px] px-1"} />
      )}
      {!empty && (
        <footer className="flex justify-end gap-1 border-t border-neutral-100 px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={onDownload} disabled={busy}>
            {busy === "png" ? <Loader2 className="animate-spin" /> : <Download />} PNG
          </Button>
          {drive && (
            <Button variant="ghost" size="sm" onClick={onSaveDrive} disabled={busy}>
              {busy === "drive" ? <Loader2 className="animate-spin" /> : <DriveIcon className="h-4 w-4" />} Save to Drive
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
