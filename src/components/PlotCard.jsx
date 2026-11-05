import React, { useState } from "react";
import { Download, Info, Loader2, Share, X } from "lucide-react";
import Chart from "@/components/Chart";
import { Button } from "@/components/ui/button";
import { hasData } from "@/lib/charts";

const TALL_PLOTS = new Set(["annual", "weekHeatmap", "dayHeatmap"]);

// Opens on hover with a mouse and on tap on a touch screen.
function HelpTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="How to read this chart"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setOpen(false)}
        onBlur={() => setOpen(false)}
        className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <p role="tooltip" className="absolute left-4 right-4 top-full z-20 mt-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg">
          {text}
        </p>
      )}
    </>
  );
}

export default function PlotCard({ plot, number, onDownload, onShare, onRemove, busy, controls }) {
  const empty = !hasData(plot);
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="relative flex items-start gap-2 px-4 pt-4">
        <span className="mt-0.5 grid h-5 min-w-5 place-items-center rounded bg-neutral-100 px-1 text-[11px] font-semibold text-neutral-500">
          {number}
        </span>
        <h3 className="flex-1 text-sm font-semibold leading-snug text-neutral-900">{plot.title}</h3>
        {plot.help && !empty && <HelpTip text={plot.help} />}
        {onRemove && (
          <button onClick={onRemove} aria-label="Remove plot" className="-mr-1 -mt-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      {controls && !empty && <div className="px-4 pt-2">{controls}</div>}
      {empty ? (
        <p className="mx-4 my-4 rounded-xl bg-neutral-50 py-10 text-center text-sm text-neutral-400">
          No data for these days and months.
        </p>
      ) : (
        <Chart plot={plot} className={TALL_PLOTS.has(plot.kind) ? "h-[340px] sm:h-[400px] px-1" : "h-[300px] sm:h-[360px] px-1"} />
      )}
      {!empty && (
        <footer className="flex justify-end gap-1 border-t border-neutral-100 px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={onDownload} disabled={busy}>
            {busy === "png" ? <Loader2 className="animate-spin" /> : <Download />} PNG
          </Button>
          {onShare && (
            <Button variant="ghost" size="sm" onClick={onShare} disabled={busy}>
              {busy === "share" ? <Loader2 className="animate-spin" /> : <Share />} Share
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
