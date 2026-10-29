import React, { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileArchive, FileText, FolderOpen, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section, Field, Segmented } from "@/components/Section";
import DataFiles from "@/components/DataFiles";
import ColumnsDialog from "@/components/ColumnsDialog";
import DriveFilePicker from "@/components/DriveFilePicker";
import DriveIcon from "@/components/DriveIcon";
import StatsCard from "@/components/StatsCard";
import PlotCard from "@/components/PlotCard";
import DailyBuilder from "@/components/DailyBuilder";
import { useAuth } from "@/lib/AuthContext";
import { importFile } from "@/lib/smartImport";
import { validateInputs, combineMeters, summaryStats, standardPlots, dailyDemandAnalysis } from "@/lib/demandAnalysis";
import { renderPng, formatDate } from "@/lib/charts";
import { renderAll, buildZip, buildPdf, statsRows, statsCsv, downloadBlob, plotFileName, fileSlug, safeName, timestamp } from "@/lib/exports";
import { SHEET_MIME, downloadBlob as driveDownload, exportBlob } from "@/lib/google/drive";
import { saveFiles } from "@/lib/google/driveStore";
import sampleUrl from "../../sample-data/SmartMeterTexas_IntervalData_sample.csv?url";

const ACCEPT = ".csv,.txt,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
let nextKey = 1;

export default function Home() {
  const { configured, isAuthenticated, login } = useAuth();
  const fileInput = useRef(null);

  const [files, setFiles] = useState([]);
  const [excluded, setExcluded] = useState(new Set());
  const [demandType, setDemandType] = useState("kW");
  const [powerFactors, setPowerFactors] = useState({});
  const [titleHeader, setTitleHeader] = useState("");
  const [siteName, setSiteName] = useState("");
  const [bins, setBins] = useState("30");
  const [custom, setCustom] = useState([]);
  const [columnsFor, setColumnsFor] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(null); // { kind, done, total }
  const [plotBusy, setPlotBusy] = useState({}); // plot id -> "png" | "drive"
  const [savingKey, setSavingKey] = useState(null);

  // ---------------------------------------------------------------- files

  const updateFile = (key, patch) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const addFiles = useCallback(async (list) => {
    const entries = list.map((item) => ({ key: nextKey++, name: item.file.name, source: item.source, original: item.file, loading: true }));
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
    const list = [...(fileList || [])].map((file) => ({ file, source: "device" }));
    if (list.length) addFiles(list);
  };

  const loadSample = async () => {
    const blob = await (await fetch(sampleUrl)).blob();
    addFiles([{ file: new File([blob], "SmartMeterTexas_IntervalData_sample.csv", { type: "text/csv" }), source: "device" }]);
  };

  const onDrivePick = async (picked) => {
    setPickerOpen(false);
    const list = await Promise.all(
      picked.map(async (f) => {
        try {
          const isSheet = f.mimeType === SHEET_MIME;
          const blob = isSheet ? await exportBlob(f.id) : await driveDownload(f.id);
          return { file: new File([blob], isSheet ? `${f.name}.xlsx` : f.name), source: "drive" };
        } catch (e) {
          toast.error(`Couldn't download ${f.name}: ${e.message}`);
          return null;
        }
      })
    );
    addFiles(list.filter(Boolean));
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

  const site = safeName(siteName.trim() || titleHeader.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Wattson");
  const reportTitle = titleHeader.trim() || site;
  const rows = stats ? statsRows(stats, { demandType, meters }) : [];

  // ---------------------------------------------------------------- exports

  const ensureDrive = async () => (isAuthenticated ? true : login());

  const driveToast = (message, url) =>
    toast.success(message, { action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") } });

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

  const downloadZip = () =>
    run("zip", async (progress) => {
      const images = await renderAll(plots, progress);
      downloadBlob(await buildZip(images, rows), `${fileSlug(reportTitle)}_plots_${timestamp()}.zip`);
    });

  const pdfFor = (images) =>
    buildPdf(images, rows, {
      title: `${reportTitle} – Demand Analysis`,
      subtitle: `${formatDate(stats.start)} – ${formatDate(stats.end)} · demand in ${demandType} · made with Wattson`,
    });

  const downloadPdf = () =>
    run("pdf", async (progress) => {
      const images = await renderAll(plots, progress);
      downloadBlob(await pdfFor(images), `${fileSlug(reportTitle)}_report_${timestamp()}.pdf`);
    });

  const saveAllToDrive = async () => {
    if (!(await ensureDrive())) return;
    run("drive", async (progress) => {
      const images = await renderAll(plots, progress);
      const stamp = timestamp();
      const out = [
        ...images,
        { name: `${fileSlug(reportTitle)}_report_${stamp}.pdf`, blob: await pdfFor(images) },
        { name: "summary.csv", blob: statsCsv(rows) },
      ];
      const url = await saveFiles(site, out, { subfolder: `${safeName(reportTitle)} ${stamp}`, onProgress: progress });
      driveToast(`Saved ${images.length} plots and the PDF report to Wattson/${site}/Plots`, url);
    });
  };

  const withPlotBusy = async (plot, kind, fn) => {
    setPlotBusy((b) => ({ ...b, [plot.id]: kind }));
    try {
      await fn();
    } catch (e) {
      toast.error(e.message || "Something went wrong.");
    } finally {
      setPlotBusy((b) => ({ ...b, [plot.id]: undefined }));
    }
  };

  const downloadPlot = (plot, i) =>
    withPlotBusy(plot, "png", async () => downloadBlob(await renderPng(plot), plotFileName(plot, i)));

  const savePlotToDrive = async (plot, i) => {
    if (!(await ensureDrive())) return;
    withPlotBusy(plot, "drive", async () => {
      const url = await saveFiles(site, [{ name: plotFileName(plot, i), blob: await renderPng(plot) }]);
      driveToast(`Saved to Wattson/${site}/Plots`, url);
    });
  };

  const saveDataToDrive = async (f) => {
    if (!(await ensureDrive())) return;
    setSavingKey(f.key);
    try {
      const url = await saveFiles(site, [{ name: f.name, blob: f.original }], { kind: "data" });
      updateFile(f.key, { source: "drive" });
      driveToast(`Saved ${f.name} to Wattson/${site}/Data`, url);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const addCustom = (args) => {
    setCustom((c) => [...c, { ...args, key: nextKey++ }]);
    toast.success("Plot added at the end of the list");
  };

  const busyLabel = (kind, label) =>
    busy?.kind === kind ? (busy.total ? `Rendering ${Math.min(busy.done + 1, busy.total)}/${busy.total}` : "Working…") : label;

  // ---------------------------------------------------------------- render

  const driveAvailable = configured;
  const hasFiles = files.length > 0;

  return (
    <div className="space-y-4">
      {!hasFiles && (
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Interval demand, visualized</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Open 15-minute (or any interval) usage data to plot demand patterns: histogram, annual trend, daily
            profiles and monthly box plots. Files are read on this device; nothing is uploaded unless you save to Google Drive.
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
              onSaveDrive={saveDataToDrive}
              drive={driveAvailable}
              savingKey={savingKey}
            />
          )}
          <div className={hasFiles ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-2"}>
            <Button variant={hasFiles ? "outline" : "default"} size={hasFiles ? "sm" : "lg"} onClick={() => fileInput.current?.click()} className={hasFiles ? "" : "h-12"}>
              <Upload /> {hasFiles ? "Add file" : "Open from device"}
            </Button>
            {driveAvailable && (
              <Button
                variant="outline"
                size={hasFiles ? "sm" : "lg"}
                className={hasFiles ? "" : "h-12"}
                onClick={async () => (await ensureDrive()) && setPickerOpen(true)}
              >
                <DriveIcon className="h-4 w-4" /> {hasFiles ? "Add from Drive" : "Open from Google Drive"}
              </Button>
            )}
          </div>
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
            <Field label="Title header" hint="Added to the start of every plot title, e.g. “All Meters” or “Meter 1234”.">
              <Input value={titleHeader} onChange={(e) => setTitleHeader(e.target.value)} placeholder="Optional" />
            </Field>
            {driveAvailable && (
              <Field label="Site (Google Drive folder)" hint={`Saved under Wattson/${site}/ in your Drive.`}>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder={site} />
              </Field>
            )}
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
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={downloadZip} disabled={!!busy}>
                {busy?.kind === "zip" ? <Loader2 className="animate-spin" /> : <FileArchive />} {busyLabel("zip", "Download PNGs (ZIP)")}
              </Button>
              <Button variant="outline" onClick={downloadPdf} disabled={!!busy}>
                {busy?.kind === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} {busyLabel("pdf", "PDF report")}
              </Button>
              {driveAvailable && (
                <Button variant="outline" onClick={saveAllToDrive} disabled={!!busy}>
                  {busy?.kind === "drive" ? <Loader2 className="animate-spin" /> : <DriveIcon className="h-4 w-4" />} {busyLabel("drive", "Save all to Drive")}
                </Button>
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
                drive={driveAvailable}
                onDownload={() => downloadPlot(p, i)}
                onSaveDrive={() => savePlotToDrive(p, i)}
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
      {driveAvailable && isAuthenticated && <DriveFilePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onDrivePick} />}
    </div>
  );
}
