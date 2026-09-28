import { crc32, liteHandBundle, modelBuffer, modelMetadata, readStoredZip, withTasksMetadata, writeStoredZip } from '../../../engine/liteHand';

/**
 * A minimal TFLite-shaped FlatBuffer: Model { buffers: [Buffer { data }], metadata: [Metadata { name, buffer }] },
 * laid out front to back (FlatBuffer offsets point forward), like the real models.
 */
function tinyModel(buffers: Uint8Array[], metadata: { name: string; buffer: number }[]): Uint8Array {
  const bytes: number[] = [];
  const u16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const set32 = (at: number, v: number) => {
    bytes[at] = v & 0xff;
    bytes[at + 1] = (v >>> 8) & 0xff;
    bytes[at + 2] = (v >>> 16) & 0xff;
    bytes[at + 3] = (v >>> 24) & 0xff;
  };
  const align = (n: number, plus = 0) => {
    while ((bytes.length + plus) % n !== 0) bytes.push(0);
  };
  const pointTo = (field: number) => set32(field, bytes.length - field);

  u32(0); // root offset, set below
  bytes.push(...Array.from('TFL3', (c) => c.charCodeAt(0)));
  // Model vtable: 8 fields (0..7), buffers at 4, metadata at 6.
  const modelVtable = bytes.length;
  u16(4 + 8 * 2);
  u16(12);
  for (let i = 0; i < 8; i++) u16(i === 4 ? 4 : i === 6 ? 8 : 0);
  align(4);
  const model = bytes.length;
  set32(0, model);
  u32(model - modelVtable);
  const buffersField = bytes.length;
  u32(0);
  const metadataField = bytes.length;
  u32(0);

  pointTo(buffersField);
  u32(buffers.length);
  const bufferSlots = buffers.map(() => {
    const at = bytes.length;
    u32(0);
    return at;
  });
  const bufferVtable = bytes.length;
  u16(6);
  u16(8);
  u16(4); // data
  align(4);
  const dataFields = buffers.map((_, i) => {
    pointTo(bufferSlots[i]!);
    u32(bytes.length - bufferVtable);
    const at = bytes.length;
    u32(0);
    return at;
  });
  buffers.forEach((data, i) => {
    align(16, 4);
    pointTo(dataFields[i]!);
    u32(data.length);
    bytes.push(...data);
  });

  align(4);
  pointTo(metadataField);
  u32(metadata.length);
  const metaSlots = metadata.map(() => {
    const at = bytes.length;
    u32(0);
    return at;
  });
  const metaVtable = bytes.length;
  u16(8);
  u16(12);
  u16(4);
  u16(8);
  const nameFields = metadata.map((entry, i) => {
    pointTo(metaSlots[i]!);
    u32(bytes.length - metaVtable);
    const at = bytes.length;
    u32(0);
    u32(entry.buffer);
    return at;
  });
  metadata.forEach((entry, i) => {
    align(4);
    pointTo(nameFields[i]!);
    u32(entry.name.length);
    bytes.push(...Array.from(entry.name, (c) => c.charCodeAt(0)), 0);
  });
  align(4);
  return Uint8Array.from(bytes);
}

const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// The lite model: legacy metadata only.
const lite = tinyModel([new Uint8Array(0), text('1.5.0'), text('fp16'), text('weights')], [
  { name: 'min_runtime_version', buffer: 1 },
  { name: 'reduced_precision_support', buffer: 2 },
]);
// The full model: Tasks metadata, and handedness labels in a ZIP after the FlatBuffer.
const tasksMetadata = text('model metadata flatbuffer');
const donorBody = tinyModel([new Uint8Array(0), text('1.5.0'), tasksMetadata], [
  { name: 'min_runtime_version', buffer: 1 },
  { name: 'TFLITE_METADATA', buffer: 2 },
]);
const donor = new Uint8Array([...donorBody, ...writeStoredZip([['handedness.txt', text('Left\nRight\n')]], donorBody.length)]);

describe('ZIP helpers', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('writes and reads uncompressed ZIPs, with 4-byte aligned file data', () => {
    const zip = writeStoredZip([
      ['a.tflite', text('abc')],
      ['labels.txt', text('Left\nRight\n')],
    ]);
    const files = readStoredZip(zip);
    expect(files.map(([name, data]) => [name, decode(data)])).toEqual([
      ['a.tflite', 'abc'],
      ['labels.txt', 'Left\nRight\n'],
    ]);
    expect(files.every(([, data]) => data.byteOffset % 4 === 0)).toBe(true);
    expect(() => readStoredZip(text('not a zip at all, no end record'))).toThrow('not a zip');
  });

  it('reads a ZIP appended to other data, with offsets counted from the start', () => {
    const [[name, data]] = readStoredZip(donor) as [[string, Uint8Array]];
    expect(name).toBe('handedness.txt');
    expect(decode(data)).toBe('Left\nRight\n');
  });
});

describe('Tasks metadata for the lite hand model', () => {
  it('reads model metadata and buffers', () => {
    expect(modelMetadata(lite)).toEqual([
      { name: 'min_runtime_version', buffer: 1 },
      { name: 'reduced_precision_support', buffer: 2 },
    ]);
    expect(decode(modelBuffer(lite, 3))).toBe('weights');
    expect(modelBuffer(lite, 0)).toHaveLength(0);
  });

  it("gives the model the donor's Tasks metadata and labels, leaving the rest alone", () => {
    const result = withTasksMetadata(lite, donor);
    expect(modelMetadata(result)).toEqual([
      { name: 'reduced_precision_support', buffer: 2 },
      { name: 'TFLITE_METADATA', buffer: 1 },
    ]);
    expect(decode(modelBuffer(result, 1))).toBe('model metadata flatbuffer');
    expect(decode(modelBuffer(result, 2))).toBe('fp16');
    expect(decode(modelBuffer(result, 3))).toBe('weights');
    // Model buffers stay 16-byte aligned.
    expect(modelBuffer(result, 1).byteOffset % 16).toBe(0);
    // Labels follow the FlatBuffer as a ZIP, as in the full model.
    expect(readStoredZip(result).map(([n, d]) => [n, decode(d)])).toEqual([['handedness.txt', 'Left\nRight\n']]);
    // Only two offsets changed in the original bytes; everything else is appended.
    const changed = Array.from(lite).filter((b, i) => result[i] !== b).length;
    expect(changed).toBeLessThanOrEqual(8);
  });

  it('refuses models it cannot convert', () => {
    expect(() => withTasksMetadata(lite, lite)).toThrow('donor has no Tasks metadata');
    const noRuntimeEntry = tinyModel([new Uint8Array(0), text('fp16')], [{ name: 'reduced_precision_support', buffer: 1 }]);
    expect(() => withTasksMetadata(noRuntimeEntry, donor)).toThrow('min_runtime_version');
  });

  it('bundles the lite landmark model with the full hand detector', () => {
    const detector = text('palm detector');
    const fullTask = writeStoredZip([
      ['hand_detector.tflite', detector],
      ['hand_landmarks_detector.tflite', donor],
    ]);
    const files = new Map(readStoredZip(liteHandBundle(fullTask, lite)));
    expect([...files.keys()]).toEqual(['hand_detector.tflite', 'hand_landmarks_detector.tflite']);
    expect(decode(files.get('hand_detector.tflite')!)).toBe('palm detector');
    expect(modelMetadata(files.get('hand_landmarks_detector.tflite')!).map((e) => e.name)).toContain('TFLITE_METADATA');
    expect(() => liteHandBundle(writeStoredZip([['other.tflite', detector]]), lite)).toThrow('unexpected hand_landmarker.task');
  });
});
