import { inflateSync } from "node:zlib";
import { createImage, type RgbaImage } from "./png";

const SIGNATURE_LENGTH = 8;
const CHUNK_HEADER_LENGTH = 8;
const CHUNK_CRC_LENGTH = 4;
const COLOR_TYPE_PALETTE = 3;
const COLOR_TYPE_RGBA = 6;
const RGBA_BYTES = 4;
const RGB_BYTES = 3;
const OPAQUE = 255;
const BITS_PER_BYTE = 8;

enum RowFilter {
  None = 0,
  Sub = 1,
  Up = 2,
  Average = 3,
  Paeth = 4,
}

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  isInterlaced: boolean;
}

interface PngChunks {
  header: PngHeader;
  palette: Buffer | null;
  transparency: Buffer | null;
  compressedData: Buffer;
}

function readChunks(png: Buffer): PngChunks {
  let header: PngHeader | null = null;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const dataParts: Buffer[] = [];
  let offset = SIGNATURE_LENGTH;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const chunkType = png.toString("ascii", offset + 4, offset + CHUNK_HEADER_LENGTH);
    const data = png.subarray(offset + CHUNK_HEADER_LENGTH, offset + CHUNK_HEADER_LENGTH + length);
    if (chunkType === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9),
        isInterlaced: data.readUInt8(12) !== 0,
      };
    }
    if (chunkType === "PLTE") palette = data;
    if (chunkType === "tRNS") transparency = data;
    if (chunkType === "IDAT") dataParts.push(data);
    offset += CHUNK_HEADER_LENGTH + length + CHUNK_CRC_LENGTH;
  }
  if (!header) throw new Error("PNG has no IHDR chunk");
  return { header, palette, transparency, compressedData: Buffer.concat(dataParts) };
}

function predictPaeth(left: number, above: number, aboveLeft: number): number {
  const estimate = left + above - aboveLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const aboveLeftDistance = Math.abs(estimate - aboveLeft);
  if (leftDistance <= aboveDistance && leftDistance <= aboveLeftDistance) return left;
  return aboveDistance <= aboveLeftDistance ? above : aboveLeft;
}

/** Undoes PNG row filters, returning each row's raw bytes. */
function unfilterRows(inflated: Buffer, rowLength: number, height: number, stride: number) {
  const rows: Uint8Array[] = [];
  let previous = new Uint8Array(rowLength);
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    const start = rowIndex * (rowLength + 1);
    const filter = inflated[start] as RowFilter;
    const row = Uint8Array.from(inflated.subarray(start + 1, start + 1 + rowLength));
    for (let byteIndex = 0; byteIndex < rowLength; byteIndex++) {
      const left = byteIndex >= stride ? (row[byteIndex - stride] ?? 0) : 0;
      const above = previous[byteIndex] ?? 0;
      const aboveLeft = byteIndex >= stride ? (previous[byteIndex - stride] ?? 0) : 0;
      const predictions: Record<RowFilter, number> = {
        [RowFilter.None]: 0,
        [RowFilter.Sub]: left,
        [RowFilter.Up]: above,
        [RowFilter.Average]: Math.floor((left + above) / 2),
        [RowFilter.Paeth]: predictPaeth(left, above, aboveLeft),
      };
      row[byteIndex] = ((row[byteIndex] ?? 0) + predictions[filter]) & OPAQUE;
    }
    rows.push(row);
    previous = row;
  }
  return rows;
}

function readPaletteIndex(row: Uint8Array, column: number, bitDepth: number): number {
  const bitOffset = column * bitDepth;
  const byte = row[Math.floor(bitOffset / BITS_PER_BYTE)] ?? 0;
  const shift = BITS_PER_BYTE - bitDepth - (bitOffset % BITS_PER_BYTE);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

/**
 * Decodes the non-interlaced palette and 8-bit RGBA PNGs the map generator reads, which is all
 * the glyph sheet needs; other kinds throw.
 */
export function decodePng(png: Buffer): RgbaImage {
  const { header, palette, transparency, compressedData } = readChunks(png);
  const { width, height, bitDepth, colorType, isInterlaced } = header;
  if (isInterlaced) throw new Error("Interlaced PNGs aren't supported");
  const isPalette = colorType === COLOR_TYPE_PALETTE;
  const isRgba = colorType === COLOR_TYPE_RGBA && bitDepth === BITS_PER_BYTE;
  if (!isPalette && !isRgba) {
    throw new Error(`PNG color type ${colorType} at ${bitDepth} bits isn't supported`);
  }
  if (isPalette && !palette) throw new Error("Palette PNG has no PLTE chunk");

  const bitsPerPixel = isPalette ? bitDepth : RGBA_BYTES * BITS_PER_BYTE;
  const rowLength = Math.ceil((width * bitsPerPixel) / BITS_PER_BYTE);
  const stride = Math.max(1, bitsPerPixel / BITS_PER_BYTE);
  const rows = unfilterRows(inflateSync(compressedData), rowLength, height, stride);

  const image = createImage(width, height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * RGBA_BYTES;
      if (isRgba) {
        image.pixels.set(row.subarray(x * RGBA_BYTES, (x + 1) * RGBA_BYTES), offset);
        continue;
      }
      const paletteIndex = readPaletteIndex(row, x, bitDepth);
      const color = palette?.subarray(paletteIndex * RGB_BYTES, (paletteIndex + 1) * RGB_BYTES);
      if (color) image.pixels.set(color, offset);
      image.pixels[offset + RGB_BYTES] = transparency?.[paletteIndex] ?? OPAQUE;
    }
  });
  return image;
}
