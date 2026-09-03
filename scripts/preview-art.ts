import { writeFileSync } from 'node:fs';
import { PixelBuffer, hex } from '../src/art/PixelBuffer.js';
import { bakeArt } from '../src/art/SpriteBaker.js';
import { encodePng } from './png.js';

/**
 * Herramienta de desarrollo: hornea todo el arte y lo vuelca en una hoja de
 * contacto PNG ampliada, para poder revisar cada sprite a simple vista.
 *
 * Uso:  npx tsx scripts/preview-art.ts salida.png [escala]
 */

const outPath = process.argv[2] ?? 'art-preview.png';
const scale = Number(process.argv[3] ?? 4);

const art = bakeArt();

// --- Se recopilan todas las filas de la hoja de contacto ---
const rows: { label: string; frames: PixelBuffer[] }[] = [];

for (const [unitId, clips] of Object.entries(art.units)) {
  const seen = new Set<string>();
  for (const [clipName, baked] of Object.entries(clips)) {
    // Los clips de respaldo apuntan al mismo objeto: se muestran una sola vez.
    if (seen.has(baked.clip.name)) continue;
    seen.add(baked.clip.name);
    rows.push({ label: `${unitId}/${clipName}`, frames: [...baked.right] });
  }
}

rows.push({ label: 'structures', frames: Object.values(art.structures) });
rows.push({ label: 'props', frames: Object.values(art.props) });
rows.push({ label: 'background', frames: Object.values(art.background) });

// --- Se calcula el tamaño del lienzo ---
const PAD = 4;
let sheetW = 0;
let sheetH = PAD;
const rowHeights: number[] = [];
for (const row of rows) {
  const w = row.frames.reduce((acc, f) => acc + f.width + PAD, PAD);
  const h = row.frames.reduce((acc, f) => Math.max(acc, f.height), 0);
  sheetW = Math.max(sheetW, w);
  rowHeights.push(h);
  sheetH += h + PAD;
}

const sheet = new PixelBuffer(sheetW, sheetH);
sheet.fill(hex('#101410'));

// --- Se pegan los fotogramas fila a fila ---
let y = PAD;
rows.forEach((row, i) => {
  const rowH = rowHeights[i] as number;
  let x = PAD;
  for (const frame of row.frames) {
    // Fondo a cuadros bajo cada sprite: hace visible la transparencia.
    for (let py = 0; py < frame.height; py++) {
      for (let px = 0; px < frame.width; px++) {
        const light = ((px >> 2) + (py >> 2)) % 2 === 0;
        sheet.set(x + px, y + py, hex(light ? '#232a22' : '#1a201a'));
      }
    }
    sheet.blit(frame, x, y + rowH - frame.height);
    x += frame.width + PAD;
  }
  y += rowH + PAD;
});

// --- Ampliación con vecino más cercano, para poder ver los píxeles ---
const scaled = new PixelBuffer(sheet.width * scale, sheet.height * scale);
for (let py = 0; py < scaled.height; py++) {
  for (let px = 0; px < scaled.width; px++) {
    scaled.set(px, py, sheet.get(Math.floor(px / scale), Math.floor(py / scale)));
  }
}

writeFileSync(outPath, encodePng(scaled));
console.log(`Hoja de contacto: ${outPath}  (${scaled.width}x${scaled.height}, escala ${scale}x)`);
console.log(`Horneado en ${art.bakeMs.toFixed(1)} ms`);
console.log(`Filas: ${rows.map((r) => r.label).join(', ')}`);
