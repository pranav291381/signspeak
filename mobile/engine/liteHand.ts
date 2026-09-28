/**
 * MediaPipe's lite hand-landmark model, made loadable by MediaPipe Tasks.
 *
 * Google publishes the lite model (about twice as fast as the full one) only in
 * the older format, without the "Tasks" metadata (input normalization,
 * handedness labels) that the Tasks hand landmarker needs. Its inputs and
 * outputs are identical to the full model's, so the page gives it the full
 * model's metadata and bundles it with the full model's hand detector, the way
 * hand_landmarker.task is built. Nothing else in the model is changed.
 *
 * Only the few FlatBuffer and ZIP structures involved are read and written.
 * Pure functions, tested in src/engine/__tests__/liteHand.test.ts.
 */

// ---- CRC-32 (ZIP) ------------------------------------------------------------------

let crcTable: Uint32Array | null = null;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// ---- Stored (uncompressed) ZIP -----------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Position of the end-of-central-directory record, or -1 when there is none. */
function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const data = view(bytes);
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (data.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/**
 * Files of an uncompressed ZIP, in order. Offsets inside the ZIP count from the
 * start of `bytes` (so a ZIP appended to a model is read in place).
 */
export function readStoredZip(bytes: Uint8Array): [string, Uint8Array][] {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('not a zip');
  const data = view(bytes);
  const count = data.getUint16(eocd + 10, true);
  let at = data.getUint32(eocd + 16, true);
  const files: [string, Uint8Array][] = [];
  for (let i = 0; i < count; i++) {
    if (data.getUint32(at, true) !== CENTRAL_SIGNATURE) throw new Error('bad zip directory');
    const method = data.getUint16(at + 10, true);
    const size = data.getUint32(at + 20, true);
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const local = data.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (method !== 0) throw new Error(`${name} is compressed`);
    if (data.getUint32(local, true) !== LOCAL_SIGNATURE) throw new Error('bad zip entry');
    const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true);
    files.push([name, bytes.subarray(start, start + size)]);
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/**
 * An uncompressed ZIP of `files`, each file's data 4-byte aligned. Offsets
 * count from `base` bytes before the ZIP (for a ZIP appended to a model).
 */
export function writeStoredZip(files: readonly [string, Uint8Array][], base = 0): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name);
    const padding = (4 - ((base + offset + 30 + nameBytes.length) % 4)) % 4;
    const header = new Uint8Array(30 + nameBytes.length + padding);
    const h = view(header);
    const crc = crc32(content);
    h.setUint32(0, LOCAL_SIGNATURE, true);
    h.setUint16(4, 10, true); // version needed
    h.setUint16(12, 0x21, true); // 1980-01-01
    h.setUint32(14, crc, true);
    h.setUint32(18, content.length, true);
    h.setUint32(22, content.length, true);
    h.setUint16(26, nameBytes.length, true);
    h.setUint16(28, padding, true); // extra field: zero padding
    header.set(nameBytes, 30);

    const entry = new Uint8Array(46 + nameBytes.length);
    const e = view(entry);
    e.setUint32(0, CENTRAL_SIGNATURE, true);
    e.setUint16(4, 10, true);
    e.setUint16(6, 10, true);
    e.setUint16(14, 0x21, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, content.length, true);
    e.setUint32(24, content.length, true);
    e.setUint16(28, nameBytes.length, true);
    e.setUint32(42, base + offset, true);
    entry.set(nameBytes, 46);

    parts.push(header, content);
    central.push(entry);
    offset += header.length + content.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const d = view(end);
  d.setUint32(0, EOCD_SIGNATURE, true);
  d.setUint16(8, files.length, true);
  d.setUint16(10, files.length, true);
  d.setUint32(12, centralSize, true);
  d.setUint32(16, base + offset, true);
  return concat([...parts, ...central, end]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---- TFLite FlatBuffer (model metadata only) --------------------------------------

/** TFLite schema: Model.buffers and Model.metadata; Buffer.data; Metadata.name and Metadata.buffer. */
const MODEL_BUFFERS = 4;
const MODEL_METADATA = 6;
const BUFFER_DATA = 0;
const TASKS_METADATA = 'TFLITE_METADATA';
/** Metadata entry whose buffer is reused (informational only). */
const REUSED_ENTRY = 'min_runtime_version';

class FlatBuffer {
  private readonly data: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.data = view(bytes);
  }
  u32(at: number): number {
    return this.data.getUint32(at, true);
  }
  /** Where field `index` of the table at `table` is stored, or null when absent. */
  field(table: number, index: number): number | null {
    const vtable = table - this.data.getInt32(table, true);
    const size = this.data.getUint16(vtable, true);
    const slot = 4 + index * 2;
    if (slot >= size) return null;
    const offset = this.data.getUint16(vtable + slot, true);
    return offset ? table + offset : null;
  }
  /** Follows the offset stored at `at`. */
  deref(at: number): number {
    return at + this.u32(at);
  }
  root(): number {
    return this.u32(0);
  }
  /** Tables of the vector whose offset is stored at `at`. */
  tables(at: number): number[] {
    const vector = this.deref(at);
    return Array.from({ length: this.u32(vector) }, (_, i) => this.deref(vector + 4 + i * 4));
  }
  string(at: number): string {
    const start = this.deref(at);
    return new TextDecoder().decode(this.bytes.subarray(start + 4, start + 4 + this.u32(start)));
  }
}

export interface MetadataEntry {
  name: string;
  buffer: number;
}

/** The model's metadata entries (name and buffer index). */
export function modelMetadata(model: Uint8Array): MetadataEntry[] {
  const fb = new FlatBuffer(model);
  const at = fb.field(fb.root(), MODEL_METADATA);
  if (at === null) return [];
  return fb.tables(at).map((table) => {
    const name = fb.field(table, 0);
    const buffer = fb.field(table, 1);
    return { name: name === null ? '' : fb.string(name), buffer: buffer === null ? 0 : fb.u32(buffer) };
  });
}

/** Contents of the model's buffer `index`. */
export function modelBuffer(model: Uint8Array, index: number): Uint8Array {
  const fb = new FlatBuffer(model);
  const buffers = fb.field(fb.root(), MODEL_BUFFERS);
  if (buffers === null) throw new Error('model has no buffers');
  const table = fb.tables(buffers)[index];
  if (table === undefined) throw new Error(`no buffer ${index}`);
  const data = fb.field(table, BUFFER_DATA);
  if (data === null) return new Uint8Array(0);
  const vector = fb.deref(data);
  return model.subarray(vector + 4, vector + 4 + fb.u32(vector));
}

/** End of the FlatBuffer: where a ZIP of associated files starts, or the end of the file. */
function flatBufferEnd(model: Uint8Array): number {
  const eocd = findEndOfCentralDirectory(model);
  if (eocd < 0) return model.length;
  let first = model.length;
  const data = view(model);
  let at = data.getUint32(eocd + 16, true);
  for (let i = 0; i < data.getUint16(eocd + 10, true); i++) {
    first = Math.min(first, data.getUint32(at + 42, true));
    at += 46 + data.getUint16(at + 28, true) + data.getUint16(at + 30, true) + data.getUint16(at + 32, true);
  }
  return first;
}

class Writer {
  bytes: number[] = [];
  constructor(private readonly start: number) {}
  get position(): number {
    return this.start + this.bytes.length;
  }
  align(to: number, plus = 0): void {
    while ((this.position + plus) % to !== 0) this.bytes.push(0);
  }
  u16(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }
  u32(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }
  set32(position: number, value: number): void {
    const i = position - this.start;
    this.bytes[i] = value & 0xff;
    this.bytes[i + 1] = (value >>> 8) & 0xff;
    this.bytes[i + 2] = (value >>> 16) & 0xff;
    this.bytes[i + 3] = (value >>> 24) & 0xff;
  }
  raw(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.bytes.push(values[i]!);
  }
}

/**
 * `model` with the Tasks metadata of `donor`: its TFLITE_METADATA buffer and
 * the ZIP of associated files (e.g. handedness labels). The two models must
 * have the same inputs and outputs; the caller checks the result by hash.
 *
 * FlatBuffer offsets only point forward, so the new data is appended after the
 * model and two existing offsets are pointed at it: Model.metadata (a new list
 * with TFLITE_METADATA) and the data of the buffer that held
 * "min_runtime_version" (now holding the metadata).
 */
export function withTasksMetadata(model: Uint8Array, donor: Uint8Array): Uint8Array<ArrayBuffer> {
  const donorEntry = modelMetadata(donor).find((e) => e.name === TASKS_METADATA);
  if (!donorEntry) throw new Error('donor has no Tasks metadata');
  const metadata = modelBuffer(donor, donorEntry.buffer);
  const associated = findEndOfCentralDirectory(donor) >= 0 ? readStoredZip(donor) : [];

  const body = model.subarray(0, flatBufferEnd(model));
  const fb = new FlatBuffer(body);
  const root = fb.root();
  const metadataField = fb.field(root, MODEL_METADATA);
  const buffersField = fb.field(root, MODEL_BUFFERS);
  if (metadataField === null || buffersField === null) throw new Error('model has no metadata list');
  const entries = modelMetadata(body).filter((e) => e.name !== TASKS_METADATA);
  const reused = entries.find((e) => e.name === REUSED_ENTRY);
  if (!reused) throw new Error(`model has no ${REUSED_ENTRY} entry`);
  const reusedTable = fb.tables(buffersField)[reused.buffer];
  const dataField = reusedTable === undefined ? null : fb.field(reusedTable, BUFFER_DATA);
  if (dataField === null) throw new Error('reused buffer has no data field');
  const kept: MetadataEntry[] = [...entries.filter((e) => e !== reused), { name: TASKS_METADATA, buffer: reused.buffer }];

  const w = new Writer(body.length);
  // The metadata bytes, 16-byte aligned like every TFLite buffer.
  w.align(16, 4);
  const dataVector = w.position;
  w.u32(metadata.length);
  w.raw(metadata);
  // The new metadata list, then its tables (sharing one vtable), then their names.
  w.align(4);
  const list = w.position;
  w.u32(kept.length);
  kept.forEach(() => w.u32(0));
  const vtable = w.position;
  w.u16(8); // vtable size
  w.u16(12); // table size
  w.u16(4); // name
  w.u16(8); // buffer
  const tables = kept.map((entry) => {
    const table = w.position;
    w.u32(table - vtable); // soffset to the vtable (before the table)
    w.u32(0); // name, set below
    w.u32(entry.buffer);
    return table;
  });
  kept.forEach((entry, i) => {
    w.set32(list + 4 + i * 4, tables[i]! - (list + 4 + i * 4));
    w.align(4);
    const name = new TextEncoder().encode(entry.name);
    w.set32(tables[i]! + 4, w.position - (tables[i]! + 4));
    w.u32(name.length);
    w.raw(name);
    w.bytes.push(0);
  });
  w.align(4);

  const out = new Uint8Array(w.position);
  out.set(body);
  out.set(w.bytes, body.length);
  const patch = view(out);
  patch.setUint32(metadataField, list - metadataField, true);
  patch.setUint32(dataField, dataVector - dataField, true);
  return associated.length > 0 ? concat([out, writeStoredZip(associated, out.length)]) : out;
}

/** hand_landmarker.task with its landmark model replaced by the lite one. */
export function liteHandBundle(fullTask: Uint8Array, liteLandmarks: Uint8Array): Uint8Array<ArrayBuffer> {
  const files = new Map(readStoredZip(fullTask));
  const detector = files.get('hand_detector.tflite');
  const landmarks = files.get('hand_landmarks_detector.tflite');
  if (!detector || !landmarks) throw new Error('unexpected hand_landmarker.task');
  return writeStoredZip([
    ['hand_detector.tflite', detector],
    ['hand_landmarks_detector.tflite', withTasksMetadata(liteLandmarks, landmarks)],
  ]);
}
