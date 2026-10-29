import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileArchive, FileText, FolderOpen, Loader2, Share, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, Field, Segmented } from "@/components/Section";
import DataFiles from "@/components/DataFiles";
import ColumnsDialog from "@/components/ColumnsDialog";
import StatsCard from "@/components/StatsCard";
import PlotCard from "@/components/PlotCard";
import DailyBuilder from "@/components/DailyBuilder";
import { importFile } from "@/lib/smartImport";
import { validateInputs, combineMeters, summaryStats, standardPlots, dailyDemandAnalysis } from "@/lib/demandAnalysis";
import { renderPng, formatDate } from "@/lib/charts";
import { renderAll, buildZip, buildPdf, statsRows, downloadBlob, plotFileName, fileSlug, timestamp, canShareFiles, shareBlob } from "@/lib/exports";
import sampleUrl from "../../sample-data/SmartMeterTexas_IntervalData_sample.csv?url";

const ACCEPT = ".csv,.txt,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
let nextKey = 1;

export default function Home() {
  const fileInput = useRef(null);
  const [canShare] = useState(canShareFiles);

  const [files, setFiles] = useState([]);
  const [excluded, setExcluded] = useState(new Set());
  const [demandType, setDemandType] = useState("kW");
  const [powerFactors, setPowerFactors] = useState({});
  const [titleHeader, setTitleHeader] = useState("");
  const [bins, setBins] = useState("30");
  const [custom, setCustom] = useState([]);
  const [columnsFor, setColumnsFor] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(null); // { kind, done, total }
  const [plotBusy, setPlotBusy] = useState({}); // plot id -> "png" | "share"

  // ---------------------------------------------------------------- files

  const updateFile = (key, patch) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addFiles = useCallback(async (list) => {
    const entries = list.map((file) => ({ key: nextKey++, name: file.name, loading: true, original: file }));
    setFiles((fs) => [...fs, ...entries]);
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const { table, layout, meters, warnings } = await importFile(entry.original);
          updateFile(entry.key, { loading: false, table, layout, meters, warnings, error: layout.problem || null });
        } catch (e) {
          updateFile(entry.key, { loading: false, error: e.message || "Couldn't read this file." });
        }
      })
    );
  }, []);

  const onDeviceFiles = (fileList) => {
    const list = [...(fileList || [])];
    if (list.length) addFiles(list);
  };

  const loadSample = async () => {
    const blob = await (await fetch(sampleUrl)).blob();
    addFiles([new File([blob], "SmartMeterTexas_IntervalData_sample.csv", { type: "text/csv" })]);
  };

  const removeFile = (f) => {
    setFiles((fs) => fs.filter((x) => x.key !== f.key));
    if (columnsFor?.key === f.key) setColumnsFor(null);
  };

  const toggleMeter = (id) =>
    setExcluded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ---------------------------------------------------------------- analysis

  const meters = useMemo(() => files.flatMap((f) => f.meters || []).filter((m) => !excluded.has(m.id)), [files, excluded]);
  const deferredPf = useDeferredValue(powerFactors);
  const deferredHeader = useDeferredValue(titleHeader);
  const deferredBins = useDeferredValue(Math.min(200, Math.max(1, Math.round(Number(bins)) || 30)));

  const errors = useMemo(
    () => (meters.length ? validateInputs({ meters, demandType, powerFactors: deferredPf }) : []),
    [meters, demandType, deferredPf]
  );

  const data = useMemo(
    () => (meters.length && !errors.length ? combineMeters(meters, { demandType, powerFactors: deferredPf }) : null),
    [meters, errors, demandType, deferredPf]
  );
  const stats = useMemo(() => (data?.power.length ? summaryStats(data) : null), [data]);

  const plots = useMemo(() => {
    if (!stats) return [];
    const header = deferredHeader.trim();
    return [
      ...standardPlots(data, { header, bins: deferredBins }),
      ...custom.flatMap((c) =>
        dailyDemandAnalysis(data, { ...c, header, id: `custom-${c.key}` }).map((p) => ({ ...p, customKey: c.key }))
      ),
    ];
  }, [data, stats, deferredHeader, deferredBins, custom]);

  const reportTitle = titleHeader.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Wattson";
  const rows = stats ? statsRows(stats, { demandType, meters }) : [];

  // ---------------------------------------------------------------- exports

  // Download on computers; on phones open the share sheet. If rendering took long
  // enough that the browser no longer counts the original tap, ask for another.
  const deliver = async (blob, name, share) => {
    if (!share) return downloadBlob(blob, name);
    const result = await shareBlob(blob, name);
    if (result === "needs-tap") {
      toast(`${name} is ready`, {
        duration: 20000,
        action: { label: "Share", onClick: () => shareBlob(blob, name).catch((e) => toast.error(e.message)) },
      });
    }
  };

  const run = async (kind, fn) => {
    setBusy({ kind, done: 0, total: 0 });
    try {
      await fn((done, total) => setBusy({ kind, done, total }));
    } catch (e) {
      toast.error(e.message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const exportZip = (share) =>
    run(share ? "zip-share" : "zip", async (progress) => {
      const images = await renderAll(plots, progress);
      await deliver(await buildZip(images, rows), `${fileSlug(reportTitle)}_plots_${timestamp()}.zip`, share);
    });

  const exportPdf = (share) =>
    run(share ? "pdf-share" : "pdf", async (progress) => {
      const images = await renderAll(plots, progress);
      const pdf = await buildPdf(images, rows, {
        title: `${reportTitle} – Demand Analysis`,
        subtitle: `${formatDate(stats.start)} – ${formatDate(stats.end)} · demand in ${demandType} · made with Wattson`,
      });
      await deliver(pdf, `${fileSlug(reportTitle)}_report_${timestamp()}.pdf`, share);
    });

  const exportPlot = async (plot, i, share) => {
    setPlotBusy((b) => ({ ...b, [plot.id]: share ? "share" : "png" }));
    try {
      await deliver(await renderPng(plot), plotFileName(plot, i), share);
    } catch (e) {
      toast.error(e.message || "Something went wrong.");
    } finally {
      setPlotBusy((b) => ({ ...b, [plot.id]: undefined }));
    }
  };

  const addCustom = (args) => {
    setCustom((c) => [...c, { ...args, key: nextKey++ }]);
    toast.success("Plot added at the end of the list");
  };

  const busyLabel = (kind, label) =>
    busy?.kind === kind ? (busy.total ? `Rendering ${Math.min(busy.done + 1, busy.total)}/${busy.total}` : "Working…") : label;

  const ExportButton = ({ kind, icon: Icon, label, onClick }) => (
    <Button variant="outline" onClick={onClick} disabled={!!busy}>
      {busy?.kind === kind ? <Loader2 className="animate-spin" /> : <Icon />} {busyLabel(kind, label)}
    </Button>
  );

  // ---------------------------------------------------------------- render

  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      {!hasFiles && (
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Interval demand, visualized</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Open 15-minute (or any interval) usage data to plot demand patterns: histogram, annual trend, daily
            profiles and monthly box plots. Files are read on this device and never uploaded.
          </p>
        </div>
      )}

      <Section
        title="Interval data"
        description={hasFiles ? "Multiple meters are added together." : "Smart Meter Texas exports, the Python tool's Excel template, or any CSV/Excel file with dates and usage."}
        className={dragging ? "ring-2 ring-neutral-900" : undefined}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onDeviceFiles(e.dataTransfer.files);
          }}
          className="space-y-3"
        >
          {hasFiles && (
            <DataFiles
              files={files}
              excluded={excluded}
              onToggleMeter={toggleMeter}
              demandType={demandType}
              powerFactors={powerFactors}
              onPf={(id, v) => setPowerFactors((p) => ({ ...p, [id]: v }))}
              onColumns={setColumnsFor}
              onRemove={removeFile}
            />
          )}
          <Button
            variant={hasFiles ? "outline" : "default"}
            size={hasFiles ? "sm" : "lg"}
            onClick={() => fileInput.current?.click()}
            className={hasFiles ? "" : "h-12 w-full"}
          >
            <Upload /> {hasFiles ? "Add file" : "Open data file"}
          </Button>
          {!hasFiles && (
            <p className="text-center text-xs text-neutral-400">
              No data handy?{" "}
              <button onClick={loadSample} className="font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900">
                Try the sample file
              </button>
            </p>
          )}
          <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => {
            onDeviceFiles(e.target.files);
            e.target.value = "";
          }} />
        </div>
      </Section>

      {hasFiles && (
        <Section title="Settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Demand units" hint={demandType === "kVA" ? "kVA = kW ÷ power factor. Enter each meter's power factor above." : "kW = kWh per interval × (60 ÷ interval minutes)."}>
              <Segmented value={demandType} onChange={setDemandType} options={[{ value: "kW", label: "kW" }, { value: "kVA", label: "kVA" }]} />
            </Field>
            <Field label="Histogram bins">
              <Input type="number" inputMode="numeric" min={1} max={200} value={bins} onChange={(e) => setBins(e.target.value)} />
            </Field>
            <Field label="Title header" hint="Added to the start of every plot title, e.g. “All Meters” or “Meter 1234”." className="sm:col-span-2">
              <Input value={titleHeader} onChange={(e) => setTitleHeader(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </Section>
      )}

      {errors.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {errors.map((e) => (
            <p key={e} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}

      {stats && (
        <>
          <Section title="Summary">
            <StatsCard stats={stats} demandType={demandType} dropped={data.dropped} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ExportButton kind="zip" icon={FileArchive} label="Download PNGs (ZIP)" onClick={() => exportZip(false)} />
              <ExportButton kind="pdf" icon={FileText} label="Download PDF report" onClick={() => exportPdf(false)} />
              {canShare && (
                <>
                  <ExportButton kind="zip-share" icon={Share} label="Share PNGs (ZIP)" onClick={() => exportZip(true)} />
                  <ExportButton kind="pdf-share" icon={Share} label="Share PDF report" onClick={() => exportPdf(true)} />
                </>
              )}
            </div>
          </Section>

          <div className="space-y-4">
            {plots.map((p, i) => (
              <PlotCard
                key={p.id}
                plot={p}
                number={i + 1}
                busy={plotBusy[p.id]}
                onDownload={() => exportPlot(p, i, false)}
                onShare={canShare ? () => exportPlot(p, i, true) : undefined}
                onRemove={p.customKey ? () => setCustom((c) => c.filter((x) => x.key !== p.customKey)) : undefined}
              />
            ))}
          </div>

          <Section title="Custom daily profile" description="Average daily demand for any days of the week and months. New plots are added to the list above.">
            <DailyBuilder onAdd={addCustom} />
          </Section>
        </>
      )}

      {hasFiles && !stats && !errors.length && files.every((f) => !f.loading) && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-400">
          <FolderOpen className="h-4 w-4" /> Add a readable data file to see plots.
        </p>
      )}

      <ColumnsDialog
        open={!!columnsFor}
        file={columnsFor}
        onClose={() => setColumnsFor(null)}
        onApply={({ layout, intervalOverride, meters: newMeters, warnings }) => {
          updateFile(columnsFor.key, { layout, intervalOverride, meters: newMeters, warnings, error: null });
          setColumnsFor(null);
        }}
      />
    </div>
  );
}
