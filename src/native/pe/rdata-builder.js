/**
 * Builds the contents of the `.rdata` section: the PE import machinery
 * (Import Directory Table + a combined Import Lookup/Address Table +
 * Hint/Name entries + DLL name strings — per the Microsoft PE/COFF
 * specification §6.4 "The .idata Section") plus any raw string-literal
 * bytes the compiled program needs (e.g. `say`'s text), all packed into
 * one buffer with every piece's offset tracked for the caller.
 *
 * Simplification (deliberate, not an oversight): each import descriptor's
 * `OriginalFirstThunk` (the Import Lookup Table pointer) is set to 0, so
 * there is only ONE thunk array per DLL — used by the Windows loader both
 * to resolve each function by name at load time AND, after binding, as
 * the Import Address Table our own machine code reads from at runtime.
 * This is an explicitly valid, well-documented PE simplification ("import
 * binding without a separate ILT") — Windows' loader treats an all-zero
 * OriginalFirstThunk as "use FirstThunk for lookup too."
 *
 * Every offset this module returns is relative to the START of the
 * returned buffer (i.e. an offset *within* `.rdata`, not yet an RVA or
 * absolute address) — the caller (pe-writer.js) adds `.rdata`'s own RVA
 * (known only once `.text`'s final size is fixed) to get real addresses.
 *
 * IMPORTANT — internal self-references: the Import Directory Table's
 * `Name`/`FirstThunk` fields and every thunk-array entry are themselves
 * RVAs pointing at *other locations inside this same buffer* (the DLL
 * name string, the Hint/Name entries) — and the PE format requires those
 * to be real image RVAs, not offsets-within-`.rdata`. Since this buffer
 * is built before `.rdata`'s own final RVA is known (same chicken-and-egg
 * problem `.text`'s fixups solve), every such field is written here as a
 * plain local offset, with its byte position + width recorded in
 * `internalFixups` — the caller MUST add `.rdata`'s RVA to each of those
 * fields once known, or the import table points at garbage (this exact
 * bug was caught by actually executing a generated .exe: Windows loaded
 * it, but crashed with STATUS_ACCESS_VIOLATION resolving a Name RVA that
 * was really a small local offset, not a real RVA).
 */

/** Pads `chunks` with a single zero byte if the running `offset` is odd — every Hint/Name entry and DLL name string must start at a word (2-byte) boundary. */
function alignToEven(chunks, offset) {
  if (offset % 2 === 0) return offset;
  chunks.push(Buffer.from([0]));
  return offset + 1;
}

/**
 * @param {Array<{dll: string, functions: string[]}>} imports
 * @param {Buffer[]} stringConstants - raw bytes for each `say`-able string literal, in order
 * @returns {{
 *   buffer: Buffer,
 *   importDirectoryOffset: number, importDirectorySize: number,
 *   iatOffsetByKey: Map<string, number>, // key: "DLL.DLL!FunctionName" -> byte offset within `buffer` of that function's IAT slot
 *   iatTableOffset: number, iatTableSize: number, // every DLL's thunk array back-to-back, for the IAT data directory entry
 *   stringOffsets: number[], // byte offset within `buffer` for each entry of `stringConstants`, same order
 *   internalFixups: Array<{offset: number, width: 4|8}>, // see "IMPORTANT" above — caller must add rdata's RVA to the value at each of these positions
 * }}
 */
export function buildRdata(imports, stringConstants) {
  // --- Pass 1: lay out the thunk (IAT) arrays first — their offsets are
  // needed by the Import Directory Table, which is written last even
  // though it appears first in the buffer.
  const importDirectorySize = (imports.length + 1) * 20; // one IMAGE_IMPORT_DESCRIPTOR per DLL + one all-zero terminator
  let offset = importDirectorySize;

  const iatOffsetByKey = new Map();
  const iatTableOffset = offset;
  const dllThunkArrayOffset = new Map(); // dll -> offset

  for (const { dll, functions } of imports) {
    dllThunkArrayOffset.set(dll, offset);
    functions.forEach((fn, i) => iatOffsetByKey.set(`${dll}!${fn}`, offset + i * 8));
    offset += (functions.length + 1) * 8; // +1 for the zero-terminator entry
  }
  const iatTableSize = offset - iatTableOffset;

  // --- Pass 2: Hint/Name entries (one per imported function) followed by each DLL's name string.
  const hintNameChunks = [];
  const hintNameRvaByKey = new Map(); // "DLL!Function" -> offset of its Hint/Name entry

  for (const { dll, functions } of imports) {
    for (const fn of functions) {
      hintNameRvaByKey.set(`${dll}!${fn}`, offset);
      const entry = Buffer.concat([Buffer.from([0, 0]), Buffer.from(fn + '\0', 'ascii')]); // Hint(2, "no hint") + null-terminated name
      hintNameChunks.push(entry);
      offset += entry.length;
      offset = alignToEven(hintNameChunks, offset);
    }
  }

  const dllNameOffset = new Map();
  for (const { dll } of imports) {
    dllNameOffset.set(dll, offset);
    const nameBuf = Buffer.from(dll + '\0', 'ascii');
    hintNameChunks.push(nameBuf);
    offset += nameBuf.length;
    offset = alignToEven(hintNameChunks, offset);
  }

  // --- Pass 3: user string constants — plain bytes, no alignment needed (WriteFile takes an explicit length, never a null terminator).
  const stringOffsets = [];
  const stringChunks = [];
  for (const s of stringConstants) {
    stringOffsets.push(offset);
    stringChunks.push(s);
    offset += s.length;
  }

  // --- Assemble: the thunk arrays (now that every Hint/Name RVA is known) and the Import Directory Table (now that every thunk-array/DLL-name RVA is known).
  // Every value written here is still a LOCAL offset within this buffer, not a real RVA yet — see the "IMPORTANT" class doc note. `internalFixups`
  // records exactly where each one lives so the caller can add `.rdata`'s real RVA to it once known.
  const internalFixups = [];

  const thunkArrayChunks = imports.map(({ dll, functions }) => {
    const buf = Buffer.alloc((functions.length + 1) * 8);
    const thunkArrayOffset = dllThunkArrayOffset.get(dll);
    functions.forEach((fn, i) => {
      buf.writeBigUInt64LE(BigInt(hintNameRvaByKey.get(`${dll}!${fn}`)), i * 8);
      internalFixups.push({ offset: thunkArrayOffset + i * 8, width: 8 });
    });
    return buf;
  });

  const importDirectoryBuffer = Buffer.alloc(importDirectorySize);
  imports.forEach(({ dll }, i) => {
    const entryOffset = i * 20;
    importDirectoryBuffer.writeUInt32LE(0, entryOffset); // OriginalFirstThunk = 0 (see class doc)
    importDirectoryBuffer.writeUInt32LE(0, entryOffset + 4); // TimeDateStamp
    importDirectoryBuffer.writeUInt32LE(0, entryOffset + 8); // ForwarderChain
    importDirectoryBuffer.writeUInt32LE(dllNameOffset.get(dll), entryOffset + 12); // Name RVA (local offset for now)
    importDirectoryBuffer.writeUInt32LE(dllThunkArrayOffset.get(dll), entryOffset + 16); // FirstThunk (IAT) RVA (local offset for now)
    internalFixups.push({ offset: entryOffset + 12, width: 4 });
    internalFixups.push({ offset: entryOffset + 16, width: 4 });
  });
  // The final all-zero IMAGE_IMPORT_DESCRIPTOR terminator is already zero from Buffer.alloc — no fixup needed (0 + rva would be wrong; it must stay 0).

  const buffer = Buffer.concat([importDirectoryBuffer, ...thunkArrayChunks, ...hintNameChunks, ...stringChunks]);

  return {
    buffer,
    importDirectoryOffset: 0,
    importDirectorySize,
    iatOffsetByKey,
    iatTableOffset,
    iatTableSize,
    stringOffsets,
    internalFixups,
  };
}
