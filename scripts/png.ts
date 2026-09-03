import { deflateSync } from 'node:zlib';
import type { PixelBuffer } from '../src/art/PixelBuffer.js';

/**
 * Codificador PNG mínimo para herramientas de desarrollo.
 *
 * Solo se usa fuera del juego (previsualización del arte y capturas de los
 * tests). El juego en el navegador nunca pasa por aquí: sube los píxeles
 * directamente a un `ImageBitmap`.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** Convierte un PixelBuffer en un PNG RGBA sin pérdidas. */
export function encodePng(buf: PixelBuffer): Buffer {
  const { width, height, data } = buf;

  // Cada fila lleva delante un byte de filtro (0 = sin filtro).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let i = 0; i < width * 4; i++) {
      raw[rowStart + 1 + i] = data[y * width * 4 + i] as number;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // profundidad de bits
  ihdr[9] = 6;   // color RGBA
  ihdr[10] = 0;  // compresión deflate
  ihdr[11] = 0;  // filtrado estándar
  ihdr[12] = 0;  // sin entrelazado

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
