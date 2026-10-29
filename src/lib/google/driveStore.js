// Wattson's folders in Google Drive:
//
//   My Drive/
//   └─ Wattson/
//      └─ <Site>/
//         ├─ Data/                       ← interval data files saved from the app
//         └─ Plots/
//            ├─ <Title> 2026-10-29_1430/  ← one folder per "Save all to Drive"
//            └─ 05_Average_Daily_….png    ← single plots saved from a plot card
import { FOLDER_MIME, createFolder, listFiles, q, uploadFile, folderUrl } from "@/lib/google/drive";

export const ROOT_FOLDER = "Wattson";
const folderCache = new Map();

export function resetDriveCache() {
  folderCache.clear();
}

async function ensureFolder(name, parentId) {
  const key = `${parentId}/${name}`;
  if (folderCache.has(key)) return folderCache.get(key);
  const promise = (async () => {
    const found = await listFiles(
      `name = '${q(name)}' and '${q(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      { fields: "id,name", pageSize: 10 }
    );
    return (found[0] || (await createFolder(name, parentId))).id;
  })();
  folderCache.set(key, promise);
  promise.catch(() => folderCache.delete(key));
  return promise;
}

export const rootFolder = () => ensureFolder(ROOT_FOLDER, "root");

export async function siteFolders(site) {
  const root = await rootFolder();
  const siteId = await ensureFolder(site, root);
  const [data, plots] = await Promise.all([ensureFolder("Data", siteId), ensureFolder("Plots", siteId)]);
  return { root, site: siteId, data, plots };
}

// files: [{ name, blob }]. Returns the Drive link of the folder they went to.
export async function saveFiles(site, files, { kind = "plots", subfolder, onProgress } = {}) {
  const folders = await siteFolders(site);
  let parent = kind === "data" ? folders.data : folders.plots;
  if (subfolder) parent = (await createFolder(subfolder, parent)).id;
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const f = files[i];
    await uploadFile(f.blob, { name: f.name, parents: [parent], mimeType: f.blob.type || "application/octet-stream" });
  }
  onProgress?.(files.length, files.length);
  return folderUrl(parent);
}
