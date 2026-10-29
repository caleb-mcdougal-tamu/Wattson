// Minimal Google Drive v3 REST client (browser fetch + GIS access token).
import { getAccessToken, invalidateToken } from "@/lib/google/auth";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

// Multipart uploads are one request; larger files use a resumable session.
const MULTIPART_LIMIT = 5 * 1024 * 1024;
// Drive's limit for one property is 124 bytes of UTF-8 for key + value.
const PROPERTY_BYTES = 124;

export const FILE_FIELDS =
  "id,name,mimeType,parents,properties,description,createdTime,thumbnailLink,webViewLink," +
  "owners(displayName,emailAddress,me),imageMediaMetadata(time,width,height)";

export class DriveError extends Error {
  constructor(status, message, reason) {
    super(message || `Google Drive request failed (${status})`);
    this.status = status;
    this.reason = reason;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function driveFetch(url, options = {}, attempt = 0) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.ok) return res;

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const reason = body?.error?.errors?.[0]?.reason;
  if (res.status === 401 && attempt === 0) {
    invalidateToken();
    return driveFetch(url, options, attempt + 1);
  }
  const rateLimited =
    res.status === 429 || (res.status === 403 && /rateLimitExceeded/.test(reason || ""));
  if ((rateLimited || res.status >= 500) && attempt < 4) {
    await sleep(Math.min(500 * 2 ** attempt, 8000) + Math.random() * 250);
    return driveFetch(url, options, attempt + 1);
  }
  throw new DriveError(res.status, body?.error?.message, reason);
}

// Escape a value for use inside a single-quoted Drive query string.
export const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function withParams(base, params) {
  const sp = new URLSearchParams({ supportsAllDrives: "true", ...params });
  return `${base}?${sp.toString()}`;
}

// One page of a files.list query, across My Drive, shared-with-me and shared drives.
export async function listPage(query, { fields = FILE_FIELDS, pageToken, pageSize = 1000, orderBy } = {}) {
  const params = {
    q: query,
    fields: `nextPageToken,files(${fields})`,
    pageSize: String(pageSize),
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  };
  if (pageToken) params.pageToken = pageToken;
  if (orderBy) params.orderBy = orderBy;
  const res = await driveFetch(withParams(`${API}/files`, params));
  return res.json();
}

export async function listFiles(query, opts = {}) {
  const out = [];
  let pageToken;
  do {
    const page = await listPage(query, { ...opts, pageToken });
    out.push(...(page.files || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

// files.list for children of many parents, chunked to keep queries short.
export async function listChildren(parentIds, extraQuery, opts = {}) {
  const ids = [...new Set(parentIds)].filter(Boolean);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
  const results = await Promise.all(
    chunks.map((chunk) => {
      const parents = chunk.map((id) => `'${q(id)}' in parents`).join(" or ");
      const query = `(${parents}) and trashed = false${extraQuery ? ` and ${extraQuery}` : ""}`;
      return listFiles(query, opts);
    })
  );
  return results.flat();
}

export async function listSharedDrives() {
  const out = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: "100", fields: "nextPageToken,drives(id,name)" });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await driveFetch(`${API}/drives?${params.toString()}`);
    const body = await res.json();
    out.push(...(body.drives || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

export async function getFile(id, fields = FILE_FIELDS) {
  const res = await driveFetch(withParams(`${API}/files/${encodeURIComponent(id)}`, { fields }));
  return res.json();
}

export async function getAbout() {
  const res = await driveFetch(`${API}/about?fields=user(displayName,emailAddress,photoLink)`);
  return (await res.json()).user;
}

// Trim each property so key + value fits Drive's 124-byte limit. Empty or
// null values are sent as null, which deletes that property.
export function toProperties(obj) {
  const enc = new TextEncoder();
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null || v === "") {
      out[k] = null;
      continue;
    }
    let s = String(v);
    const budget = PROPERTY_BYTES - enc.encode(k).length;
    while (enc.encode(s).length > budget) s = s.slice(0, -1);
    out[k] = s;
  }
  return out;
}

export async function createFolder(name, parentId, { properties, description } = {}) {
  const res = await driveFetch(withParams(`${API}/files`, { fields: FILE_FIELDS }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
      properties: properties ? toProperties(properties) : undefined,
      description,
    }),
  });
  return res.json();
}

export async function updateFile(id, metadata) {
  const res = await driveFetch(
    withParams(`${API}/files/${encodeURIComponent(id)}`, { fields: FILE_FIELDS }),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    }
  );
  return res.json();
}

// Moves to the owner's Drive trash (recoverable for 30 days).
export function trashFile(id) {
  return updateFile(id, { trashed: true });
}

export async function copyFile(id, metadata) {
  const res = await driveFetch(
    withParams(`${API}/files/${encodeURIComponent(id)}/copy`, { fields: FILE_FIELDS }),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    }
  );
  return res.json();
}

export async function uploadFile(blob, metadata) {
  const meta = { ...metadata, mimeType: metadata.mimeType || blob.type };
  if (blob.size <= MULTIPART_LIMIT) {
    const boundary = `wattson${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(meta),
      `\r\n--${boundary}\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);
    const res = await driveFetch(
      withParams(`${UPLOAD_API}/files`, { uploadType: "multipart", fields: FILE_FIELDS }),
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      }
    );
    return res.json();
  }

  const start = await driveFetch(
    withParams(`${UPLOAD_API}/files`, { uploadType: "resumable", fields: FILE_FIELDS }),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": meta.mimeType,
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify(meta),
    }
  );
  const sessionUrl = start.headers.get("Location");
  if (!sessionUrl) throw new DriveError(0, "Drive did not return an upload session.");
  const res = await driveFetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": meta.mimeType },
    body: blob,
  });
  return res.json();
}

export async function downloadBlob(id) {
  const res = await driveFetch(
    withParams(`${API}/files/${encodeURIComponent(id)}`, { alt: "media" })
  );
  return res.blob();
}

// Google Sheets have no file content of their own; export them as .xlsx.
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportBlob(id, mimeType = XLSX_MIME) {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`);
  return res.blob();
}

export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;

// Run `fn` over `items` with at most `limit` in flight.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
