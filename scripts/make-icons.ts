import { writeFileSync } from 'node:fs';
import { PixelBuffer } from '../src/art/PixelBuffer.js';
import { PALETTE } from '../src/art/palette.js';
import { encodePng } from './png.js';

/**
 * ============================================================================
 * ICONOS DE LA APLICACIÓN INSTALABLE
 * ============================================================================
 *
 * Genera los PNG que necesita el teléfono cuando alguien añade el juego a su
 * pantalla de inicio. Se dibujan aquí, con las mismas herramientas y la misma
 * paleta que los sprites del juego, en lugar de meter imágenes al repositorio:
 * el proyecto no tiene ni un solo archivo binario de arte y no va a empezar
 * ahora por un icono.
 *
 *   npx tsx scripts/make-icons.ts
 *
 * El emblema se dibuja a 32×32 —resolución de pixel art de verdad— y se amplía
 * por múltiplos enteros. Ampliar por vecino más cercano es lo que conserva el
 * borde duro; cualquier interpolación lo convertiría en una mancha borrosa.
 */

/**
 * Dibuja el emblema a 32×32: casco M1 sobre la línea de selva.
 *
 * El criterio no es el detalle sino el contraste. Un icono se ve a 40 píxeles
 * en una pantalla de inicio llena de otros iconos, así que la silueta tiene que
 * distinguirse de un vistazo: casco claro sobre fondo oscuro, contorno grueso y
 * una sola franja de color. La primera versión usaba verdes sobre verdes y a
 * tamaño real era una mancha.
 */
function drawEmblem(): PixelBuffer {
  const buf = new PixelBuffer(32, 32);

  // Fondo oscuro y plano: todo el contraste se lo lleva la silueta.
  buf.fill(PALETTE.jungleDeep);

  // Línea de selva al pie, apenas insinuada.
  for (let x = -1; x < 32; x += 5) buf.ellipse(x + 2, 27, 4, 3, PALETTE.oliveDark);
  buf.rect(0, 28, 32, 4, PALETTE.oliveDark);

  // Casco M1, en caqui claro para que recorte contra el fondo.
  buf.ellipse(16, 16, 11, 8, PALETTE.khaki);
  buf.rect(5, 16, 22, 4, PALETTE.khaki);
  // Ala del casco, un tono más claro: es lo que lo hace legible como casco.
  buf.rect(3, 19, 26, 3, PALETTE.sand);
  // Sombra interior bajo el ala.
  buf.rect(5, 22, 22, 2, PALETTE.brown);
  // Brillo arriba a la izquierda: da volumen sin añadir detalle.
  buf.ellipse(12, 12, 4, 2, PALETTE.sand);

  // Franja ámbar (el amarillo de fogonazo de la paleta): el único acento de
  // color, y el que se reconoce de lejos.
  buf.rect(0, 24, 32, 2, PALETTE.muzzle);

  buf.outline(PALETTE.outline);
  return buf;
}

/** Amplía por vecino más cercano: la única forma de escalar pixel art. */
function scale(src: PixelBuffer, factor: number): PixelBuffer {
  const out = new PixelBuffer(src.width * factor, src.height * factor);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const color = src.get(x, y);
      out.rect(x * factor, y * factor, factor, factor, color);
    }
  }
  return out;
}

const emblem = drawEmblem();
// 32 × 6 = 192 y 32 × 16 = 512, los dos tamaños que pide el manifiesto.
// El de Apple son 180: se genera a 192 y el sistema lo reduce sin dañarlo.
for (const [name, factor] of [
  ['icon-192.png', 6],
  ['icon-512.png', 16],
  ['apple-touch-icon.png', 6],
] as const) {
  writeFileSync(`public/${name}`, encodePng(scale(emblem, factor)));
  console.log(`public/${name} ✓`);
}
