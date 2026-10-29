import React from "react";
import { formatDate, formatDateTime, fmt, COLORS } from "@/lib/charts";

function Stat({ label, value, unit, sub, color }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-neutral-500">{unit}</span>}
      </p>
      {sub && <p className="truncate text-[11px] text-neutral-400">{sub}</p>}
    </div>
  );
}

export default function StatsCard({ stats, demandType, dropped }) {
  const u = demandType;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Peak demand" value={fmt(stats.peak)} unit={u} sub={formatDateTime(stats.peakAt)} color={COLORS.peak} />
        <Stat label="Average demand" value={fmt(stats.avg)} unit={u} color={COLORS.avg} />
        <Stat
          label="Lowest nonzero"
          value={fmt(stats.minNonzero)}
          unit={u}
          sub={stats.minNonzeroAt ? formatDateTime(stats.minNonzeroAt) : null}
          color={COLORS.min}
        />
        <Stat label="Load factor" value={stats.loadFactor === null ? "–" : `${(stats.loadFactor * 100).toFixed(1)}%`} sub="average ÷ peak" />
        <Stat label="Total energy" value={fmt(stats.totalKwh, 0)} unit="kWh" />
        <Stat label="Zero-demand intervals" value={stats.zeros.toLocaleString()} color={stats.zeros ? COLORS.zero : null} />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        {formatDate(stats.start)} – {formatDate(stats.end)} · {stats.days} days · {stats.intervals.toLocaleString()} intervals of{" "}
        {stats.intervalMin} min
        {dropped > 0 && ` · ${dropped.toLocaleString()} intervals not shared by every meter were left out`}
      </p>
    </div>
  );
}
