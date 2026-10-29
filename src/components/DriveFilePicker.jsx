import React, { useEffect, useState } from "react";
import { ChevronRight, Folder, HardDrive, Users, Search, Check, Loader2, FileSpreadsheet, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOLDER_MIME, SHEET_MIME, listPage, listSharedDrives, q } from "@/lib/google/drive";
import { rootFolder } from "@/lib/google/driveStore";
import { cn } from "@/lib/utils";

const FIELDS = "id,name,mimeType,modifiedTime,size";
const DATA_KINDS =
  "(mimeType = 'text/csv' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or " +
  `mimeType = 'application/vnd.ms-excel' or mimeType = '${SHEET_MIME}' or name contains '.csv')`;
const KINDS = `(mimeType = '${FOLDER_MIME}' or ${DATA_KINDS})`;
const PAGE_SIZE = 200;

const SOURCES = [
  { key: "wattson", label: "Wattson", icon: Zap },
  { key: "my", label: "My Drive", icon: HardDrive },
  { key: "shared", label: "Shared with me", icon: Users },
  { key: "drives", label: "Shared drives", icon: Folder },
];

function queryFor(location, search) {
  if (search) return `trashed = false and ${DATA_KINDS} and name contains '${q(search)}'`;
  if (location.source === "shared" && !location.folderId) return `trashed = false and sharedWithMe and ${KINDS}`;
  return `trashed = false and '${q(location.folderId || "root")}' in parents and ${KINDS}`;
}

const formatModified = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");

// Browse Google Drive (the Wattson folder, My Drive, Shared with me, shared
// drives) for .csv, .xlsx and Google Sheets files to analyze.
export default function DriveFilePicker({ open, onClose, onPick }) {
  const [source, setSource] = useState("wattson");
  const [path, setPath] = useState([]); // [{ id, name }]
  const [wattsonId, setWattsonId] = useState(null);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [items, setItems] = useState([]);
  const [drives, setDrives] = useState(null);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Map());

  const folderId = path.length ? path[path.length - 1].id : source === "wattson" ? wattsonId : null;
  const showDriveList = source === "drives" && !path.length && !submittedSearch;
  const waitingForWattson = source === "wattson" && !wattsonId && !submittedSearch;

  useEffect(() => {
    if (!open) return;
    setSelected(new Map());
    if (!wattsonId) {
      rootFolder()
        .then(setWattsonId)
        .catch((e) => setError(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const load = async (pageToken) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listPage(queryFor({ source, folderId }, submittedSearch), {
        fields: FIELDS,
        pageSize: PAGE_SIZE,
        pageToken,
        orderBy: submittedSearch ? "modifiedTime desc" : "folder,name_natural",
      });
      setItems((prev) => (pageToken ? [...prev, ...(page.files || [])] : page.files || []));
      setNextPage(page.nextPageToken || null);
    } catch (e) {
      setError(e.message || "Couldn't load Drive.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || waitingForWattson) return;
    if (showDriveList) {
      setItems([]);
      setNextPage(null);
      if (drives === null) {
        setLoading(true);
        listSharedDrives()
          .then(setDrives)
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false));
      }
      return;
    }
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, folderId, submittedSearch, waitingForWattson]);

  const chooseSource = (key) => {
    setSource(key);
    setPath([]);
    setSearch("");
    setSubmittedSearch("");
  };

  const openFolder = (f) => {
    setSubmittedSearch("");
    setSearch("");
    setPath((p) => [...p, { id: f.id, name: f.name }]);
  };

  const toggle = (f) =>
    setSelected((s) => {
      const n = new Map(s);
      if (n.has(f.id)) n.delete(f.id);
      else n.set(f.id, f);
      return n;
    });

  const folders = items.filter((f) => f.mimeType === FOLDER_MIME);
  const files = items.filter((f) => f.mimeType !== FOLDER_MIME);
  const sourceLabel = SOURCES.find((s) => s.key === source)?.label;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] max-w-2xl flex-col gap-3 p-4 sm:h-[80vh] sm:p-6">
        <DialogHeader>
          <DialogTitle>Open data from Google Drive</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SOURCES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => chooseSource(key)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                source === key && !submittedSearch
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedSearch(search.trim());
          }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setSubmittedSearch("");
            }}
            placeholder="Search data files by name"
            className="pl-9"
          />
        </form>

        <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {submittedSearch ? (
            <span className="text-neutral-500">Results for &ldquo;{submittedSearch}&rdquo;</span>
          ) : (
            <>
              <button onClick={() => setPath([])} className={cn(path.length ? "text-neutral-500 hover:text-neutral-900" : "font-medium text-neutral-900")}>
                {sourceLabel}
              </button>
              {path.map((p, i) => (
                <React.Fragment key={p.id}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-300" />
                  <button
                    onClick={() => setPath((cur) => cur.slice(0, i + 1))}
                    className={cn("max-w-[40vw] truncate", i === path.length - 1 ? "font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-900")}
                  >
                    {p.name}
                  </button>
                </React.Fragment>
              ))}
            </>
          )}
        </nav>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {error && <p className="py-2 text-sm text-red-600">{error}</p>}

          {showDriveList &&
            (drives || []).map((d) => (
              <button key={d.id} onClick={() => openFolder(d)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-neutral-50">
                <HardDrive className="h-5 w-5 shrink-0 text-neutral-400" />
                <span className="truncate text-sm text-neutral-800">{d.name}</span>
              </button>
            ))}
          {showDriveList && drives && drives.length === 0 && !loading && (
            <p className="py-10 text-center text-sm text-neutral-400">No shared drives.</p>
          )}

          {folders.map((f) => (
            <button key={f.id} onClick={() => openFolder(f)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-neutral-50">
              <Folder className="h-5 w-5 shrink-0 text-neutral-400" />
              <span className="flex-1 truncate text-sm text-neutral-800">{f.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
            </button>
          ))}

          {files.map((f) => {
            const sel = selected.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggle(f)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left", sel ? "bg-neutral-100" : "hover:bg-neutral-50")}
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-neutral-800">{f.name}</span>
                  <span className="block text-xs text-neutral-400">{formatModified(f.modifiedTime)}</span>
                </span>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                    sel ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
                  )}
                >
                  {sel && <Check className="h-3 w-3" />}
                </span>
              </button>
            );
          })}

          {!loading && !error && !showDriveList && items.length === 0 && (
            <div className="py-10 text-center text-sm text-neutral-400">
              <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-neutral-300" />
              No folders or data files here.
            </div>
          )}

          {(loading || waitingForWattson) && !error && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          )}
          {!loading && nextPage && (
            <div className="flex justify-center py-3">
              <Button variant="outline" size="sm" onClick={() => load(nextPage)}>
                Load more
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center gap-2 sm:gap-2">
          <span className="mr-auto text-sm text-neutral-500">{selected.size ? `${selected.size} selected` : ".csv, .xlsx and Google Sheets"}</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected.size} onClick={() => onPick([...selected.values()])}>
            Open {selected.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
