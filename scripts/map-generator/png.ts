import { deflateSync } from "node:zlib";

/** An RGBA image, row-major, 4 bytes per pixel. */
export interface RgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4;
const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;
const FILTER_NONE = 0;
const CRC_POLYNOMIAL = 0xedb88320;
const BYTE_VALUES = 256;

const crcTable = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(BYTE_VALUES);
  for (let byteValue = 0; byteValue < BYTE_VALUES; byteValue++) {
    let remainder = byteValue;
    for (let bit = 0; bit < BIT_DEPTH; bit++) {
      remainder = remainder & 1 ? CRC_POLYNOMIAL ^ (remainder >>> 1) : remainder >>> 1;
    }
    table[byteValue] = remainder >>> 0;
  }
  return table;
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildChunk(chunkType: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(chunkType, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(computeCrc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, pixels: new Uint8Array(width * height * BYTES_PER_PIXEL) };
}

export function setPixel(image: RgbaImage, x: number, y: number, color: Rgba): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * BYTES_PER_PIXEL;
  image.pixels.set(color, offset);
}

export function encodePng(image: RgbaImage): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.writeUInt8(BIT_DEPTH, 8);
  header.writeUInt8(COLOR_TYPE_RGBA, 9);

  const rowLength = image.width * BYTES_PER_PIXEL;
  const filteredRows = Buffer.alloc((rowLength + 1) * image.height);
  for (let row = 0; row < image.height; row++) {
    const rowStart = row * (rowLength + 1);
    filteredRows[rowStart] = FILTER_NONE;
    filteredRows.set(image.pixels.subarray(row * rowLength, (row + 1) * rowLength), rowStart + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    buildChunk("IHDR", header),
    buildChunk("IDAT", deflateSync(filteredRows)),
    buildChunk("IEND", Buffer.alloc(0)),
  ]);
}
