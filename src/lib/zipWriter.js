// Minimal ZIP writer. Supports STORE (method 0) for already-compressed blobs
// and DEFLATE (method 8) via the browser's CompressionStream('deflate-raw').
// No external dependency. Produces a valid .zip Blob with nested directory
// entries and UTF-8 names.

const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(arr, off, v) {
  arr[off] = v & 0xff;
  arr[off + 1] = (v >>> 8) & 0xff;
}
function writeU32(arr, off, v) {
  arr[off] = v & 0xff;
  arr[off + 1] = (v >>> 8) & 0xff;
  arr[off + 2] = (v >>> 16) & 0xff;
  arr[off + 3] = (v >>> 24) & 0xff;
}

function dosDateTime(d) {
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1f),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
  };
}

async function deflateRaw(data) {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks = [];
  let len = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// entries: [{ path, data?: Uint8Array, isDir?: bool, deflate?: bool }]
export async function createZip(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dt = dosDateTime(new Date());

  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const isDir = !!e.isDir;
    const rawData = isDir ? new Uint8Array(0) : e.data || new Uint8Array(0);
    let method = 0;
    let compData = rawData;

    if (!isDir && e.deflate && rawData.length > 0) {
      try {
        const deflated = await deflateRaw(rawData);
        if (deflated.length < rawData.length) {
          compData = deflated;
          method = 8;
        }
      } catch {
        /* fall back to STORE */
      }
    }

    const crc = isDir ? 0 : crc32(rawData);
    const extAttrs = isDir ? 0x41ed0000 : 0x81a40000;

    const lh = new Uint8Array(30);
    writeU32(lh, 0, 0x04034b50);
    writeU16(lh, 4, 20);
    writeU16(lh, 6, 0x0800); // UTF-8 names
    writeU16(lh, 8, method);
    writeU16(lh, 10, dt.time);
    writeU16(lh, 12, dt.date);
    writeU32(lh, 14, crc);
    writeU32(lh, 18, compData.length);
    writeU32(lh, 22, rawData.length);
    writeU16(lh, 26, nameBytes.length);
    writeU16(lh, 28, 0);

    localParts.push(lh, nameBytes);
    if (compData.length) localParts.push(compData);

    const cd = new Uint8Array(46);
    writeU32(cd, 0, 0x02014b50);
    writeU16(cd, 4, 20);
    writeU16(cd, 6, 20);
    writeU16(cd, 8, 0x0800);
    writeU16(cd, 10, method);
    writeU16(cd, 12, dt.time);
    writeU16(cd, 14, dt.date);
    writeU32(cd, 16, crc);
    writeU32(cd, 20, compData.length);
    writeU32(cd, 24, rawData.length);
    writeU16(cd, 28, nameBytes.length);
    writeU16(cd, 30, 0);
    writeU16(cd, 32, 0);
    writeU16(cd, 34, 0);
    writeU16(cd, 36, 0);
    writeU32(cd, 38, extAttrs);
    writeU32(cd, 42, offset);
    centralParts.push(cd, nameBytes);

    offset += lh.length + nameBytes.length + compData.length;
    await yieldToUI();
  }

  let cdSize = 0;
  for (const c of centralParts) cdSize += c.length;
  const cdOffset = offset;

  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, entries.length);
  writeU16(eocd, 10, entries.length);
  writeU32(eocd, 12, cdSize);
  writeU32(eocd, 16, cdOffset);
  writeU16(eocd, 20, 0);

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}