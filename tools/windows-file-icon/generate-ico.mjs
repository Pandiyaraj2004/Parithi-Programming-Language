#!/usr/bin/env node
/**
 * Builds a proper MULTI-SIZE Windows .ico from logo.png — no dependencies
 * (matches the main Parithi package's own zero-runtime-dependency stance;
 * this is a dev-only tool, never shipped). Everything below — PNG
 * decoding, box-filter resizing, and PNG re-encoding — is implemented from
 * scratch on top of Node's built-in `zlib` (for DEFLATE/INFLATE) and a
 * hand-rolled CRC-32 (the PNG spec's own checksum), so the only "source
 * image" involved anywhere is logo.png itself, exactly as required.
 *
 * Why this exists instead of just wrapping logo.png's bytes once (the
 * previous version of this script): Windows picks a *different* icon
 * resolution depending on context (a 16x16 in a list view, 256x256 on the
 * Desktop, etc.) — embedding only one resolution means Windows has to
 * stretch it for every other size, which looks soft/blurry. A "proper"
 * .ico embeds several resolutions so Windows can pick the sharpest one
 * for wherever it's actually drawing the icon.
 *
 * Pipeline per requested size:
 *   1. Decode logo.png to raw RGBA pixels (supports 8-bit RGB/RGBA,
 *      non-interlaced PNGs — i.e. the overwhelming majority of real PNGs,
 *      including this project's logo.png).
 *   2. Center-crop to a square (logo.png is 487x454, not square — cropping
 *      avoids stretching/distorting it when it's forced into a square
 *      icon frame).
 *   3. Box-filter downsample to each target size (16/32/48/256 by
 *      default) — averaging every source pixel that falls inside each
 *      destination pixel, which is the correct, alias-free way to shrink
 *      an image (as opposed to nearest-neighbor, which would look
 *      aliased/jagged at these size ratios).
 *   4. Re-encode each resized bitmap as its own standalone PNG.
 * All resulting PNGs are then packed into one .ico, one ICONDIRENTRY per
 * size — Windows Vista+ supports PNG-compressed icon directory entries at
 * any size, not just 256x256, so no BMP/AND-mask encoding is needed.
 *
 * Usage:
 *   node generate-ico.mjs [--source <path-to-png>] [--out <path-to-ico>] [--sizes 16,32,48,256] [--also-png <size>:<path>]
 *
 * Defaults: --source ./logo.png (next to this script), --out ./parithi.ico, --sizes 16,32,48,256
 *
 * --also-png is for other consumers that just want one clean, square PNG
 * from the same center-crop this script already does for the .ico (e.g.
 * the VS Code extension's file icon and Marketplace icon) — repeatable,
 * e.g. `--also-png 512:../../editors/vscode-parithi/images/icon.png`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseArgs(argv) {
  const args = {
    source: join(__dirname, 'logo.png'),
    out: join(__dirname, 'parithi.ico'),
    sizes: [16, 32, 48, 256],
    alsoPng: [], // [{ size, path }, ...]
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) args.source = resolve(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) args.out = resolve(argv[++i]);
    else if (argv[i] === '--sizes' && argv[i + 1]) {
      args.sizes = argv[++i].split(',').map((s) => Number.parseInt(s.trim(), 10));
    } else if (argv[i] === '--also-png' && argv[i + 1]) {
      const [sizeStr, ...pathParts] = argv[++i].split(':');
      args.alsoPng.push({ size: Number.parseInt(sizeStr, 10), path: resolve(pathParts.join(':')) });
    }
  }
  return args;
}

// ---------------------------------------------------------------------
// CRC-32 (PNG's own checksum algorithm — RFC 1950/2083's table-based form)
// ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------
// Minimal PNG decoder — 8-bit RGB/RGBA, non-interlaced only (throws a
// clear, actionable error for anything else, rather than silently
// producing a corrupt result).
// ---------------------------------------------------------------------

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Source file is not a valid PNG (bad signature).');
  }
  const chunks = [];
  let pos = 8;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    chunks.push({ type, data });
    pos += 8 + length + 4; // length + type + data + crc
  }
  return chunks;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Reverses PNG's per-scanline filtering (spec §6.3), producing raw, unfiltered pixel bytes. */
function unfilter(rawData, width, height, bpp) {
  const rowBytes = width * bpp;
  const out = Buffer.alloc(height * rowBytes);
  let srcPos = 0;

  for (let y = 0; y < height; y++) {
    const filterType = rawData[srcPos];
    srcPos += 1;
    const rowStart = y * rowBytes;
    const prevRowStart = (y - 1) * rowBytes;

    for (let x = 0; x < rowBytes; x++) {
      const raw = rawData[srcPos + x];
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[prevRowStart + x] : 0;
      const c = y > 0 && x >= bpp ? out[prevRowStart + x - bpp] : 0;

      let value;
      switch (filterType) {
        case 0: value = raw; break;
        case 1: value = raw + a; break;
        case 2: value = raw + b; break;
        case 3: value = raw + Math.floor((a + b) / 2); break;
        case 4: value = raw + paethPredictor(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type ${filterType}.`);
      }
      out[rowStart + x] = value & 0xff;
    }
    srcPos += rowBytes;
  }
  return out;
}

/** Decodes a PNG buffer into { width, height, pixels } — pixels is a flat RGBA Buffer (4 bytes/pixel), regardless of the source's own color type. */
function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('Malformed PNG: no IHDR chunk.');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data.readUInt8(8);
  const colorType = ihdr.data.readUInt8(9);
  const interlace = ihdr.data.readUInt8(12);

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}). ` +
      'Only 8-bit, non-interlaced RGB or RGBA PNGs are supported — re-save the source as a standard PNG (e.g. via Paint/GIMP/an online converter) and try again.',
    );
  }

  const idatData = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const rawFiltered = inflateSync(idatData);

  const srcBpp = colorType === 6 ? 4 : 3; // RGBA vs RGB
  const unfiltered = unfilter(rawFiltered, width, height, srcBpp);

  if (srcBpp === 4) {
    return { width, height, pixels: unfiltered };
  }

  // RGB -> RGBA (opaque alpha) so every downstream step only ever deals with one pixel format.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < unfiltered.length; i += 3, j += 4) {
    rgba[j] = unfiltered[i];
    rgba[j + 1] = unfiltered[i + 1];
    rgba[j + 2] = unfiltered[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, pixels: rgba };
}

// ---------------------------------------------------------------------
// Center-crop to square + box-filter resize
// ---------------------------------------------------------------------

/** Returns { pixels, size } for the largest centered square crop of an RGBA buffer — avoids stretching a non-square logo into a square icon frame. */
function centerCropToSquare(pixels, width, height) {
  const size = Math.min(width, height);
  if (width === height) return { pixels, size };

  const offsetX = Math.floor((width - size) / 2);
  const offsetY = Math.floor((height - size) / 2);
  const cropped = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    const srcRowStart = ((y + offsetY) * width + offsetX) * 4;
    const dstRowStart = y * size * 4;
    pixels.copy(cropped, dstRowStart, srcRowStart, srcRowStart + size * 4);
  }
  return { pixels: cropped, size };
}

/** Box-filter downsample: each destination pixel is the average of every source pixel that falls inside it — alias-free shrinking, unlike nearest-neighbor. */
function boxResize(srcPixels, srcSize, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  const scale = srcSize / dstSize;

  for (let dy = 0; dy < dstSize; dy++) {
    const sy0 = Math.floor(dy * scale);
    const sy1 = Math.max(sy0 + 1, Math.floor((dy + 1) * scale));
    for (let dx = 0; dx < dstSize; dx++) {
      const sx0 = Math.floor(dx * scale);
      const sx1 = Math.max(sx0 + 1, Math.floor((dx + 1) * scale));

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = sy0; sy < sy1 && sy < srcSize; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcSize; sx++) {
          const i = (sy * srcSize + sx) * 4;
          r += srcPixels[i];
          g += srcPixels[i + 1];
          b += srcPixels[i + 2];
          a += srcPixels[i + 3];
          count++;
        }
      }
      const j = (dy * dstSize + dx) * 4;
      dst[j] = Math.round(r / count);
      dst[j + 1] = Math.round(g / count);
      dst[j + 2] = Math.round(b / count);
      dst[j + 3] = Math.round(a / count);
    }
  }
  return dst;
}

// ---------------------------------------------------------------------
// Minimal PNG encoder — always writes 8-bit RGBA, filter type 0 (None)
// per scanline (simplest correct encoding; DEFLATE still compresses the
// flat, mostly-repeated icon pixels well without per-row filtering).
// ---------------------------------------------------------------------

function writeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(pixels, size) {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type: RGBA
  ihdrData.writeUInt8(0, 10); // compression method
  ihdrData.writeUInt8(0, 11); // filter method
  ihdrData.writeUInt8(0, 12); // interlace method

  const rowBytes = size * 4;
  const raw = Buffer.alloc(size * (rowBytes + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter type: None
    pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const idatData = deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdrData),
    writeChunk('IDAT', idatData),
    writeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------
// .ico assembly — one ICONDIRENTRY per size, each pointing at its own
// standalone PNG (Windows Vista+ supports PNG-compressed icon entries at
// any size, not just 256x256).
// ---------------------------------------------------------------------

function toIconDimensionByte(pixels) {
  return pixels >= 256 ? 0 : pixels; // ICO convention: 0 means 256
}

function buildIco(images) {
  const ICONDIR_SIZE = 6;
  const ICONDIRENTRY_SIZE = 16;

  const iconDir = Buffer.alloc(ICONDIR_SIZE);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // type = 1 (icon)
  iconDir.writeUInt16LE(images.length, 4);

  let offset = ICONDIR_SIZE + images.length * ICONDIRENTRY_SIZE;
  const entries = [];
  const dataBlobs = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(ICONDIRENTRY_SIZE);
    entry.writeUInt8(toIconDimensionByte(size), 0);
    entry.writeUInt8(toIconDimensionByte(size), 1);
    entry.writeUInt8(0, 2); // color count — 0 for truecolor
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel (RGBA)
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data from file start
    entries.push(entry);
    dataBlobs.push(png);
    offset += png.length;
  }

  return Buffer.concat([iconDir, ...entries, ...dataBlobs]);
}

// ---------------------------------------------------------------------

/** Renders (and caches) the resized-square PNG for one size, reusing an already-computed size if asked for twice. */
function renderSquarePng(cache, squarePixels, squareSize, size) {
  if (cache.has(size)) return cache.get(size);
  const resized = size === squareSize ? squarePixels : boxResize(squarePixels, squareSize, size);
  const png = encodePng(resized, size);
  cache.set(size, png);
  return png;
}

function main() {
  const { source, out, sizes, alsoPng } = parseArgs(process.argv.slice(2));

  const sourceBuffer = readFileSync(source);
  const decoded = decodePng(sourceBuffer);
  console.log(`Decoded ${source}: ${decoded.width}x${decoded.height}`);

  const { pixels: squarePixels, size: squareSize } = centerCropToSquare(decoded.pixels, decoded.width, decoded.height);
  if (decoded.width !== decoded.height) {
    console.log(`Center-cropped to a ${squareSize}x${squareSize} square (source wasn't square) before resizing.`);
  }

  const pngCache = new Map();
  const images = sizes
    .slice()
    .sort((a, b) => a - b)
    .map((size) => {
      const png = renderSquarePng(pngCache, squarePixels, squareSize, size);
      console.log(`  Generated ${size}x${size} (${png.length} bytes)`);
      return { size, png };
    });

  const ico = buildIco(images);
  writeFileSync(out, ico);
  console.log(`Wrote ${out} (${ico.length} bytes, ${images.length} sizes: ${images.map((i) => i.size).join(', ')}).`);

  for (const { size, path } of alsoPng) {
    const png = renderSquarePng(pngCache, squarePixels, squareSize, size);
    writeFileSync(path, png);
    console.log(`Wrote ${path} (${size}x${size}, ${png.length} bytes).`);
  }
}

main();
