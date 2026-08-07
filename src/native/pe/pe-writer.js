/**
 * Hand-rolled Windows PE32+ (x86-64) executable writer — Phase 13 native
 * backend. There is no assembler or linker available on this machine (no
 * gcc/clang/nasm/MSVC/MinGW/LLVM — checked directly), so every byte of
 * every header, section, and the import table is produced here, following
 * the Microsoft PE/COFF Specification directly (not guessed/approximated).
 *
 * DESIGN DECISIONS (documented, not accidental):
 *   - Fixed image base (0x140000000, the standard default for a 64-bit
 *     EXE), and `IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE` deliberately NOT
 *     set — this means Windows loads the image at exactly this address,
 *     every single time, with no ASLR. That in turn means every absolute
 *     address the compiled code needs (an imported function's IAT slot, a
 *     string constant's address) is a LINK-TIME CONSTANT, so the codegen
 *     can bake them in as plain 64-bit immediates (`mov reg, imm64`)
 *     instead of needing a base-relocation table (`.reloc`) — the correct
 *     simplification for a first native backend, not a shortcut that
 *     produces wrong results.
 *   - Two sections only: `.text` (code, executable+readable) and `.rdata`
 *     (import table + string constants, readable+writable — writable
 *     because the Windows loader patches the IAT slots with real function
 *     addresses at process start, which is a write to that section).
 *   - `SizeOfHeaders`/section RVAs follow the standard convention: the
 *     header region occupies RVA 0 up to one `SectionAlignment` (0x1000),
 *     and `.text` begins at RVA 0x1000 — true for essentially every real
 *     PE file, not a Parithi-specific choice.
 *
 * Every numeric field below is named after its exact field name in the
 * Microsoft PE/COFF spec so this can be checked line-by-line against it.
 */

import { buildRdata } from './rdata-builder.js';

const IMAGE_BASE = 0x140000000n;
const SECTION_ALIGNMENT = 0x1000;
const FILE_ALIGNMENT = 0x200;

function roundUp(value, alignment) {
  return Math.ceil(value / alignment) * alignment;
}

function padTo(buffer, size) {
  if (buffer.length >= size) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(size - buffer.length)]);
}

/** IMAGE_DOS_HEADER (64 bytes) — only e_magic ("MZ") and e_lfanew (offset to the PE signature, right after this header) matter to the Windows loader; every other field is legacy and left zero. */
function buildDosHeader() {
  const buf = Buffer.alloc(64);
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(64, 0x3c); // e_lfanew — PE signature starts immediately after this 64-byte header, no DOS stub code
  return buf;
}

function buildCoffHeader({ numberOfSections }) {
  const buf = Buffer.alloc(20);
  buf.writeUInt16LE(0x8664, 0); // Machine = IMAGE_FILE_MACHINE_AMD64
  buf.writeUInt16LE(numberOfSections, 2);
  buf.writeUInt32LE(0, 4); // TimeDateStamp
  buf.writeUInt32LE(0, 8); // PointerToSymbolTable (none — no COFF symbol table)
  buf.writeUInt32LE(0, 12); // NumberOfSymbols
  buf.writeUInt16LE(240, 16); // SizeOfOptionalHeader — IMAGE_OPTIONAL_HEADER64 (112 fixed bytes) + 16 data directories * 8 bytes
  buf.writeUInt16LE(0x0022, 18); // Characteristics: IMAGE_FILE_EXECUTABLE_IMAGE | IMAGE_FILE_LARGE_ADDRESS_AWARE
  return buf;
}

function buildOptionalHeader({ sizeOfCode, sizeOfInitializedData, addressOfEntryPoint, sizeOfImage, sizeOfHeaders, importTableRva, importTableSize, iatRva, iatSize }) {
  const buf = Buffer.alloc(240);
  let o = 0;
  buf.writeUInt16LE(0x020b, o); o += 2; // Magic: PE32+
  buf.writeUInt8(14, o); o += 1; // MajorLinkerVersion (arbitrary — not consulted by the loader)
  buf.writeUInt8(0, o); o += 1; // MinorLinkerVersion
  buf.writeUInt32LE(sizeOfCode, o); o += 4;
  buf.writeUInt32LE(sizeOfInitializedData, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4; // SizeOfUninitializedData (no .bss)
  buf.writeUInt32LE(addressOfEntryPoint, o); o += 4;
  buf.writeUInt32LE(SECTION_ALIGNMENT, o); o += 4; // BaseOfCode = .text's RVA
  buf.writeBigUInt64LE(IMAGE_BASE, o); o += 8;
  buf.writeUInt32LE(SECTION_ALIGNMENT, o); o += 4;
  buf.writeUInt32LE(FILE_ALIGNMENT, o); o += 4;
  buf.writeUInt16LE(6, o); o += 2; // MajorOperatingSystemVersion (Windows Vista+)
  buf.writeUInt16LE(0, o); o += 2; // MinorOperatingSystemVersion
  buf.writeUInt16LE(0, o); o += 2; // MajorImageVersion
  buf.writeUInt16LE(0, o); o += 2; // MinorImageVersion
  buf.writeUInt16LE(6, o); o += 2; // MajorSubsystemVersion
  buf.writeUInt16LE(0, o); o += 2; // MinorSubsystemVersion
  buf.writeUInt32LE(0, o); o += 4; // Win32VersionValue (reserved, must be 0)
  buf.writeUInt32LE(sizeOfImage, o); o += 4;
  buf.writeUInt32LE(sizeOfHeaders, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4; // CheckSum (0 is accepted for a normal EXE — not consulted outside drivers/some loaders)
  buf.writeUInt16LE(3, o); o += 2; // Subsystem: IMAGE_SUBSYSTEM_WINDOWS_CUI (console)
  buf.writeUInt16LE(0x0100, o); o += 2; // DllCharacteristics: IMAGE_DLLCHARACTERISTICS_NX_COMPAT only — deliberately NOT DYNAMIC_BASE (see class doc)
  buf.writeBigUInt64LE(0x100000n, o); o += 8; // SizeOfStackReserve (1 MB, the standard default)
  buf.writeBigUInt64LE(0x1000n, o); o += 8; // SizeOfStackCommit
  buf.writeBigUInt64LE(0x100000n, o); o += 8; // SizeOfHeapReserve
  buf.writeBigUInt64LE(0x1000n, o); o += 8; // SizeOfHeapCommit
  buf.writeUInt32LE(0, o); o += 4; // LoaderFlags (reserved, must be 0)
  buf.writeUInt32LE(16, o); o += 4; // NumberOfRvaAndSizes

  // Data directories (16 * 8 bytes). Every entry defaults to {0,0} (Buffer.alloc already zeroed);
  // only index 1 (Import Table) and index 12 (IAT) are populated.
  const directoriesOffset = o;
  buf.writeUInt32LE(importTableRva, directoriesOffset + 1 * 8);
  buf.writeUInt32LE(importTableSize, directoriesOffset + 1 * 8 + 4);
  buf.writeUInt32LE(iatRva, directoriesOffset + 12 * 8);
  buf.writeUInt32LE(iatSize, directoriesOffset + 12 * 8 + 4);

  return buf;
}

function buildSectionHeader({ name, virtualSize, virtualAddress, sizeOfRawData, pointerToRawData, characteristics }) {
  const buf = Buffer.alloc(40);
  buf.write(name, 0, 'ascii'); // zero-padded automatically by Buffer.alloc for names under 8 bytes
  buf.writeUInt32LE(virtualSize, 8);
  buf.writeUInt32LE(virtualAddress, 12);
  buf.writeUInt32LE(sizeOfRawData, 16);
  buf.writeUInt32LE(pointerToRawData, 20);
  buf.writeUInt32LE(0, 24); // PointerToRelocations (none — no .reloc, no COFF relocations either; see class doc)
  buf.writeUInt32LE(0, 28); // PointerToLinenumbers (deprecated, unused)
  buf.writeUInt16LE(0, 32); // NumberOfRelocations
  buf.writeUInt16LE(0, 34); // NumberOfLinenumbers
  buf.writeUInt32LE(characteristics, 36);
  return buf;
}

const SCN_CODE_EXECUTE_READ = 0x60000020; // IMAGE_SCN_CNT_CODE | IMAGE_SCN_MEM_EXECUTE | IMAGE_SCN_MEM_READ
const SCN_INITIALIZED_DATA_READ_WRITE = 0xc0000040; // IMAGE_SCN_CNT_INITIALIZED_DATA | IMAGE_SCN_MEM_READ | IMAGE_SCN_MEM_WRITE — writable because the loader patches the IAT here

/**
 * @param {object} options
 * @param {Buffer} options.textBytes - the complete, already-encoded x86-64 machine code for `.text` (entry point = byte 0)
 * @param {Array<{offset: number, kind: 'iat'|'string', dll?: string, function?: string, stringIndex?: number}>} options.textFixups -
 *   byte offsets within `textBytes` where an 8-byte little-endian absolute virtual address must be written in
 *   (the immediate operand of a preceding `mov reg, imm64`), once `.rdata`'s final address is known.
 * @param {Array<{dll: string, functions: string[]}>} options.imports
 * @param {Buffer[]} options.stringConstants - raw bytes for each string literal the program prints, in the order `textFixups` references them by `stringIndex`
 * @returns {Buffer} a complete, loadable Windows PE32+ executable
 */
export function buildPE64Executable({ textBytes, textFixups, imports, stringConstants }) {
  const rdata = buildRdata(imports, stringConstants);

  // --- Patch every fixup in `.text` now that `.rdata`'s RVA (and hence every absolute address within it) is computable.
  const numberOfSections = 2;
  const headersRawSize = 64 /* DOS header */ + 4 /* "PE\0\0" */ + 20 /* COFF header */ + 240 /* Optional header */ + numberOfSections * 40;
  const sizeOfHeaders = roundUp(headersRawSize, FILE_ALIGNMENT);

  const textVirtualAddress = SECTION_ALIGNMENT;
  const rdataVirtualAddress = textVirtualAddress + roundUp(textBytes.length, SECTION_ALIGNMENT);

  // --- Patch `.rdata`'s own internal self-references first (Import Directory's
  // Name/FirstThunk fields, every thunk-array entry) — these were written by
  // rdata-builder.js as local offsets-within-.rdata; they become real image
  // RVAs only once .rdata's own RVA (computed just above) is known.
  const patchedRdata = Buffer.from(rdata.buffer);
  for (const fixup of rdata.internalFixups) {
    if (fixup.width === 4) {
      const localOffset = patchedRdata.readUInt32LE(fixup.offset);
      patchedRdata.writeUInt32LE(rdataVirtualAddress + localOffset, fixup.offset);
    } else {
      const localOffset = patchedRdata.readBigUInt64LE(fixup.offset);
      patchedRdata.writeBigUInt64LE(BigInt(rdataVirtualAddress) + localOffset, fixup.offset);
    }
  }

  const patchedText = Buffer.from(textBytes); // copy — never mutate the caller's buffer
  for (const fixup of textFixups) {
    let targetOffsetWithinRdata;
    if (fixup.kind === 'iat') {
      const key = `${fixup.dll}!${fixup.function}`;
      targetOffsetWithinRdata = rdata.iatOffsetByKey.get(key);
      if (targetOffsetWithinRdata === undefined) {
        throw new Error(`Native compiler internal error: fixup references unknown import "${key}" (not in the imports list passed to buildPE64Executable).`);
      }
    } else if (fixup.kind === 'string') {
      targetOffsetWithinRdata = rdata.stringOffsets[fixup.stringIndex];
      if (targetOffsetWithinRdata === undefined) {
        throw new Error(`Native compiler internal error: fixup references string index ${fixup.stringIndex}, but only ${rdata.stringOffsets.length} string constant(s) were provided.`);
      }
    } else {
      throw new Error(`Native compiler internal error: unknown fixup kind "${fixup.kind}".`);
    }
    const absoluteAddress = IMAGE_BASE + BigInt(rdataVirtualAddress) + BigInt(targetOffsetWithinRdata);
    patchedText.writeBigUInt64LE(absoluteAddress, fixup.offset);
  }

  // --- Section layout (file + virtual).
  const textRawData = padTo(patchedText, roundUp(patchedText.length, FILE_ALIGNMENT));
  const textPointerToRawData = sizeOfHeaders;

  const rdataRawData = padTo(patchedRdata, roundUp(patchedRdata.length, FILE_ALIGNMENT));
  const rdataPointerToRawData = textPointerToRawData + textRawData.length;

  const sizeOfImage = roundUp(rdataVirtualAddress + roundUp(rdata.buffer.length, SECTION_ALIGNMENT), SECTION_ALIGNMENT);

  const optionalHeader = buildOptionalHeader({
    sizeOfCode: textRawData.length,
    sizeOfInitializedData: rdataRawData.length,
    addressOfEntryPoint: textVirtualAddress, // our generated code starts at the very first byte of .text
    sizeOfImage,
    sizeOfHeaders,
    importTableRva: rdataVirtualAddress + rdata.importDirectoryOffset,
    importTableSize: rdata.importDirectorySize,
    iatRva: rdataVirtualAddress + rdata.iatTableOffset,
    iatSize: rdata.iatTableSize,
  });

  const textSectionHeader = buildSectionHeader({
    name: '.text',
    virtualSize: patchedText.length,
    virtualAddress: textVirtualAddress,
    sizeOfRawData: textRawData.length,
    pointerToRawData: textPointerToRawData,
    characteristics: SCN_CODE_EXECUTE_READ,
  });
  const rdataSectionHeader = buildSectionHeader({
    name: '.rdata',
    virtualSize: rdata.buffer.length,
    virtualAddress: rdataVirtualAddress,
    sizeOfRawData: rdataRawData.length,
    pointerToRawData: rdataPointerToRawData,
    characteristics: SCN_INITIALIZED_DATA_READ_WRITE,
  });

  const headers = Buffer.concat([
    buildDosHeader(),
    Buffer.from('PE\0\0', 'ascii'),
    buildCoffHeader({ numberOfSections }),
    optionalHeader,
    textSectionHeader,
    rdataSectionHeader,
  ]);

  return Buffer.concat([padTo(headers, sizeOfHeaders), textRawData, rdataRawData]);
}
