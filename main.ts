// Validator for the 25 November news-image entry.
//
// entry.png is the finished newspaper page, drawn beforehand. This script
// only checks that the image is a well-formed 1024x1024 PNG inside the
// size limit, then hands an unchanged copy to the grader through
// MAKEFUN_OUTPUT_DIR. It draws nothing.
//
// Usage:  MAKEFUN_OUTPUT_DIR=out node main.ts
// Node 22, ES module, standard library only.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SIZE_LIMIT = 1024 * 1024;
const WANT_W = 1024;
const WANT_H = 1024;

function die(reason: string): never {
  console.error("entry.png rejected: " + reason);
  process.exit(1);
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value++) {
    let c = value;
    for (let bit = 0; bit < 8; bit++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[value] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function checksum(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const folder = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(folder, "entry.png"));

if (png.length > SIZE_LIMIT) {
  die("file is " + png.length + " bytes, over the 1 MiB limit");
}
if (png.length < 8 || !PNG_MAGIC.every((b, i) => png[i] === b)) {
  die("does not start with the PNG signature");
}
if (png.length < 33) {
  die("too short to contain an IHDR chunk");
}
if (png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR") {
  die("first chunk is not IHDR");
}

const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
const depth = png[24];
const kind = png[25];
if (w !== WANT_W || h !== WANT_H) die("dimensions are " + w + "x" + h + ", want 1024x1024");
if (depth !== 8) die("bit depth is " + depth + ", want 8");
if (kind < 2 || kind > 6) die("colour type is " + kind + ", want 2-6");

const storedCrc = png.readUInt32BE(29);
if (storedCrc !== checksum(png.subarray(12, 29))) die("IHDR CRC32 does not match");

// The image must carry pixel data, not just a header: walk the chunk list
// and require at least one IDAT chunk before IEND.
let offset = 8;
let sawData = false;
while (offset + 8 <= png.length) {
  const chunkLen = png.readUInt32BE(offset);
  const chunkType = png.toString("ascii", offset + 4, offset + 8);
  if (chunkType === "IDAT") {
    sawData = true;
    break;
  }
  if (chunkType === "IEND") break;
  offset += 12 + chunkLen;
}
if (!sawData) die("no IDAT chunk found: image has no pixel data");

const end = png.subarray(png.length - 12);
if (end.readUInt32BE(0) !== 0 || end.toString("ascii", 4, 8) !== "IEND") {
  die("no IEND chunk at the end of the file");
}

const dest = process.env.MAKEFUN_OUTPUT_DIR;
if (!dest) die("MAKEFUN_OUTPUT_DIR is not set");
mkdirSync(dest, { recursive: true });
writeFileSync(join(dest, "entry.png"), png);
console.log(
  "entry.png accepted: 1024x1024, depth 8, colour " + kind + ", " + png.length + " bytes"
);
